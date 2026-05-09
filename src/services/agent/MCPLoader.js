import { useSettingsStore } from '../settings/SettingsStore';

/**
 * Resolve ${SETTINGS.someKey} references in a string against the SettingsStore.
 * Used for both env values (stdio) and header values (http/sse) so users don't
 * have to paste secrets twice.
 */
function resolveTemplate(value) {
    if (typeof value !== 'string') return value;
    if (!value.includes('${')) return value;
    const settings = useSettingsStore.getState();
    return value.replace(/\$\{SETTINGS\.([A-Za-z0-9_]+)\}/g, (_, key) => {
        const v = settings[key];
        return v == null ? '' : String(v);
    });
}

function resolveDict(dict) {
    if (!dict || typeof dict !== 'object') return dict;
    const out = {};
    for (const [k, v] of Object.entries(dict)) out[k] = resolveTemplate(v);
    return out;
}

/**
 * Strip ${SETTINGS.*}-resolved values when serializing tool outputs / errors so
 * we never echo secrets back to the model. Best-effort.
 */
function safeConfig(config) {
    const { headers, env, ...rest } = config;
    return rest;
}

export class MCPLoader {
    constructor() {
        this.servers = {};
        this.connectedServers = new Set();
        this.toolsCache = [];      // Tools (real + prompt-as-tool)
        this.resourcesCache = [];  // [{ serverName, uri, name, description, mimeType }]
        this.promptsCache = [];    // [{ serverName, name, description, arguments }]
        this.serverStatus = {};    // serverName -> 'connecting'|'connected'|'error'|'disconnected'
        this._version = 0;         // bumped after any cache refresh
        this._subs = new Set();
        this._statusUnsub = null;
    }

    /**
     * Subscribe to cache changes. Returns an unsubscribe fn.
     */
    subscribe(fn) {
        this._subs.add(fn);
        return () => this._subs.delete(fn);
    }
    _notify() {
        this._version += 1;
        for (const fn of this._subs) {
            try { fn(this._version); } catch (e) { console.error('[MCPLoader] subscriber threw:', e); }
        }
    }
    getVersion() { return this._version; }

    _ensureStatusListener() {
        if (this._statusUnsub || !window.electronAPI?.mcp?.onStatus) return;
        this._statusUnsub = window.electronAPI.mcp.onStatus(({ serverName, status }) => {
            this.serverStatus[serverName] = status;
            // If a server died, drop its cached tools/resources/prompts.
            if (status === 'disconnected' || status === 'error') {
                if (this.connectedServers.has(serverName)) {
                    this.connectedServers.delete(serverName);
                    this._dropCacheFor(serverName);
                    this._notify();
                }
            }
        });
    }

    _dropCacheFor(serverName) {
        this.toolsCache    = this.toolsCache.filter(t => t._mcpContext?.serverName !== serverName);
        this.resourcesCache = this.resourcesCache.filter(r => r.serverName !== serverName);
        this.promptsCache  = this.promptsCache.filter(p => p.serverName !== serverName);
    }

    /**
     * @param {Object} serversConfig - Record<serverName, ServerConfig>
     */
    async configure(serversConfig) {
        this._ensureStatusListener();
        const next = serversConfig || {};
        const prevNames = new Set(Object.keys(this.servers));
        const nextNames = new Set(Object.keys(next));

        // Disconnect servers that were removed from the config
        for (const name of prevNames) {
            if (!nextNames.has(name)) {
                await this.disconnectServer(name);
            }
        }

        // Detect changed configs (transport/command/url change requires reconnect)
        for (const name of nextNames) {
            const a = this.servers[name];
            const b = next[name];
            if (a && JSON.stringify(a) !== JSON.stringify(b) && this.connectedServers.has(name)) {
                await this.disconnectServer(name);
            }
        }

        this.servers = next;

        // Connect any not-yet-connected servers
        for (const [name, config] of Object.entries(this.servers)) {
            if (!this.connectedServers.has(name)) {
                await this.connectServer(name, config);
            }
        }

        await this.refreshAll();
    }

    async connectServer(name, config) {
        if (!window.electronAPI?.mcp) {
            console.warn('[MCPLoader] App running outside Electron context. MCP is disabled.');
            return false;
        }

        try {
            console.log(`[MCPLoader] Connecting to MCP server: ${name}`);
            const resolved = {
                serverName: name,
                transport: config.transport || 'stdio',
                command: config.command,
                args: config.args || [],
                env: resolveDict(config.env || {}),
                url: config.url,
                headers: resolveDict(config.headers || {})
            };
            await window.electronAPI.mcp.connect(resolved);
            this.connectedServers.add(name);
            this.serverStatus[name] = 'connected';
            return true;
        } catch (err) {
            console.error(`[MCPLoader] Failed to connect to ${name}:`, err);
            this.serverStatus[name] = 'error';
            return false;
        }
    }

    async disconnectServer(name) {
        if (!window.electronAPI?.mcp) return;
        try {
            await window.electronAPI.mcp.disconnect(name);
        } catch (err) {
            console.error(`[MCPLoader] Failed to disconnect ${name}:`, err);
        }
        this.connectedServers.delete(name);
        this.serverStatus[name] = 'disconnected';
        this._dropCacheFor(name);
        this._notify();
    }

    /**
     * Re-fetch tools, resources, and prompts from every connected server.
     */
    async refreshAll() {
        if (!window.electronAPI?.mcp) return;

        const tools = [];
        const resources = [];
        const prompts = [];

        for (const name of this.connectedServers) {
            // Tools
            try {
                const list = await window.electronAPI.mcp.listTools(name);
                for (const t of list) {
                    tools.push({
                        name: `mcp_${name}__${t.name}`,
                        description: t.description || `MCP tool from ${name}`,
                        parameters: {
                            type: 'object',
                            properties: t.inputSchema?.properties || {},
                            required: t.inputSchema?.required || []
                        },
                        _mcpContext: { kind: 'tool', serverName: name, originalToolName: t.name }
                    });
                }
            } catch (err) {
                console.error(`[MCPLoader] listTools failed for ${name}:`, err.message);
            }

            // Resources (cached, not surfaced as tools — exposed via read_mcp_resource builtin)
            try {
                const list = await window.electronAPI.mcp.listResources(name);
                for (const r of list) {
                    resources.push({
                        serverName: name,
                        uri: r.uri,
                        name: r.name || r.uri,
                        description: r.description || '',
                        mimeType: r.mimeType || ''
                    });
                }
            } catch (err) {
                console.warn(`[MCPLoader] listResources failed for ${name}:`, err.message);
            }

            // Prompts — surfaced as synthetic tools so the model can invoke them
            try {
                const list = await window.electronAPI.mcp.listPrompts(name);
                for (const p of list) {
                    prompts.push({
                        serverName: name,
                        name: p.name,
                        description: p.description || '',
                        arguments: p.arguments || []
                    });
                    const properties = {};
                    const required = [];
                    for (const arg of (p.arguments || [])) {
                        properties[arg.name] = {
                            type: 'string',
                            description: arg.description || ''
                        };
                        if (arg.required) required.push(arg.name);
                    }
                    tools.push({
                        name: `mcp_${name}__prompt__${p.name}`,
                        description: `[MCP prompt] ${p.description || p.name}`,
                        parameters: { type: 'object', properties, required },
                        _mcpContext: { kind: 'prompt', serverName: name, originalPromptName: p.name }
                    });
                }
            } catch (err) {
                console.warn(`[MCPLoader] listPrompts failed for ${name}:`, err.message);
            }
        }

        this.toolsCache = tools;
        this.resourcesCache = resources;
        this.promptsCache = prompts;
        console.log(
            `[MCPLoader] Cached ${tools.length} tools, ${resources.length} resources, ${prompts.length} prompts.`
        );
        this._notify();
    }

    // Backwards-compatible alias used by the older configure()
    async refreshTools() { return this.refreshAll(); }

    getTools()     { return this.toolsCache; }
    getResources() { return this.resourcesCache; }
    getPrompts()   { return this.promptsCache; }
    getStatus(name) { return this.serverStatus[name] || 'disconnected'; }

    /**
     * Read a resource by URI. URI format is the MCP server's native URI
     * (e.g. file:///..., postgres://..., custom://...).
     * If serverName is omitted, we'll search the cache for it.
     */
    async readResource(uri, serverName) {
        if (!window.electronAPI?.mcp) throw new Error('MCP unavailable outside Electron');
        let target = serverName;
        if (!target) {
            const hit = this.resourcesCache.find(r => r.uri === uri);
            if (!hit) throw new Error(`Resource ${uri} not found in any connected MCP server cache`);
            target = hit.serverName;
        }
        const contents = await window.electronAPI.mcp.readResource({ serverName: target, uri });
        // contents is array of { uri, mimeType, text? blob? }
        return contents
            .map(c => c.text != null ? c.text : (c.blob ? `[binary ${c.mimeType || 'data'} omitted]` : ''))
            .join('\n');
    }

    async executeTool(prefixedToolName, args) {
        const toolMeta = this.toolsCache.find(t => t.name === prefixedToolName);
        if (!toolMeta) {
            throw new Error(`MCP Tool ${prefixedToolName} not found in cache.`);
        }
        const ctx = toolMeta._mcpContext;
        const safeArgs = args && typeof args === 'object' ? args : {};

        if (ctx.kind === 'prompt') {
            console.log(`[MCPLoader] Resolving prompt ${ctx.originalPromptName} on ${ctx.serverName}`);
            const res = await window.electronAPI.mcp.getPrompt({
                serverName: ctx.serverName,
                name: ctx.originalPromptName,
                args: safeArgs
            });
            // Flatten prompt messages back into a string the model can consume
            const messages = res?.messages || [];
            const flattened = messages.map(m => {
                const role = m.role || 'user';
                const content = Array.isArray(m.content)
                    ? m.content.map(c => c.type === 'text' ? c.text : `[${c.type}]`).join('\n')
                    : (m.content?.text || JSON.stringify(m.content));
                return `[${role}] ${content}`;
            }).join('\n\n');
            return flattened || `(prompt ${ctx.originalPromptName} returned no messages)`;
        }

        console.log(`[MCPLoader] Executing ${ctx.originalToolName} on ${ctx.serverName} with args:`, args);
        return await window.electronAPI.mcp.callTool({
            serverName: ctx.serverName,
            toolName: ctx.originalToolName,
            args: safeArgs
        });
    }
}

export const mcpLoader = new MCPLoader();
