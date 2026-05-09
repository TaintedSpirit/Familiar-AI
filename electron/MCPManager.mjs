import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { BrowserWindow } from "electron";

class MCPManager {
    constructor() {
        // serverName -> { client, transport, status, error, transportKind }
        this.clients = new Map();
    }

    _broadcast(payload) {
        for (const win of BrowserWindow.getAllWindows()) {
            try { win.webContents.send('mcp:status', payload); } catch {}
        }
    }

    _setStatus(serverName, status, error = null) {
        const entry = this.clients.get(serverName);
        if (entry) {
            entry.status = status;
            entry.error = error ? String(error?.message || error) : null;
        }
        this._broadcast({ serverName, status, error: error ? String(error?.message || error) : null });
    }

    _buildTransport(config) {
        const kind = config.transport || 'stdio';
        if (kind === 'stdio') {
            return {
                kind,
                transport: new StdioClientTransport({
                    command: config.command,
                    args: config.args || [],
                    env: { ...process.env, ...(config.env || {}) }
                })
            };
        }
        if (kind === 'sse') {
            if (!config.url) throw new Error(`MCP server requires "url" for SSE transport`);
            return {
                kind,
                transport: new SSEClientTransport(new URL(config.url), {
                    requestInit: { headers: config.headers || {} }
                })
            };
        }
        if (kind === 'http' || kind === 'streamable-http') {
            if (!config.url) throw new Error(`MCP server requires "url" for HTTP transport`);
            return {
                kind: 'http',
                transport: new StreamableHTTPClientTransport(new URL(config.url), {
                    requestInit: { headers: config.headers || {} }
                })
            };
        }
        throw new Error(`Unknown MCP transport: ${kind}`);
    }

    async connect(serverName, config) {
        if (this.clients.has(serverName)) {
            await this.disconnect(serverName);
        }

        const { kind, transport } = this._buildTransport(config);
        const summary = kind === 'stdio'
            ? `${config.command} ${(config.args || []).join(' ')}`
            : `${kind} ${config.url}`;
        console.log(`[MCPManager] Connecting to ${serverName} via ${summary}`);

        const client = new Client(
            { name: `aifamiliar-${serverName}`, version: "1.0.0" },
            { capabilities: {} }
        );

        // Track entry up-front so status events can find it
        this.clients.set(serverName, {
            client, transport, transportKind: kind,
            status: 'connecting', error: null
        });
        this._broadcast({ serverName, status: 'connecting', error: null });

        // Surface transport-level disconnects to the renderer
        transport.onclose = () => {
            // Only fire if we still own this entry (avoid double-fire on intentional disconnect)
            if (this.clients.get(serverName)?.transport === transport) {
                this._setStatus(serverName, 'disconnected');
                this.clients.delete(serverName);
            }
        };
        transport.onerror = (err) => {
            if (this.clients.get(serverName)?.transport === transport) {
                this._setStatus(serverName, 'error', err);
            }
        };

        try {
            await client.connect(transport);
        } catch (err) {
            this._setStatus(serverName, 'error', err);
            this.clients.delete(serverName);
            throw err;
        }

        this._setStatus(serverName, 'connected');
        console.log(`[MCPManager] Connected to ${serverName}`);
        return true;
    }

    async disconnect(serverName) {
        const connection = this.clients.get(serverName);
        if (!connection) return;

        // Detach handlers first so we don't broadcast a spurious disconnected
        try { connection.transport.onclose = undefined; } catch {}
        try { connection.transport.onerror = undefined; } catch {}

        try {
            await connection.client.close();
        } catch (err) {
            console.error(`[MCPManager] Error closing client for ${serverName}:`, err);
        }
        this.clients.delete(serverName);
        this._broadcast({ serverName, status: 'disconnected', error: null });
        console.log(`[MCPManager] Disconnected ${serverName}`);
    }

    _require(serverName) {
        const connection = this.clients.get(serverName);
        if (!connection) throw new Error(`MCP server ${serverName} not connected`);
        return connection;
    }

    async listTools(serverName) {
        const res = await this._require(serverName).client.listTools();
        return res.tools || [];
    }

    async callTool(serverName, toolName, args) {
        const res = await this._require(serverName).client.callTool({
            name: toolName,
            arguments: args
        });

        if (res.isError) {
            throw new Error(`Tool ${toolName} on ${serverName} returned error: ${JSON.stringify(res.content)}`);
        }

        return res.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n');
    }

    async listResources(serverName) {
        try {
            const res = await this._require(serverName).client.listResources();
            return res.resources || [];
        } catch (err) {
            // Server may not support resources — surface as empty rather than throw
            if (/method not found|not supported/i.test(err.message || '')) return [];
            throw err;
        }
    }

    async readResource(serverName, uri) {
        const res = await this._require(serverName).client.readResource({ uri });
        return res.contents || [];
    }

    async listPrompts(serverName) {
        try {
            const res = await this._require(serverName).client.listPrompts();
            return res.prompts || [];
        } catch (err) {
            if (/method not found|not supported/i.test(err.message || '')) return [];
            throw err;
        }
    }

    async getPrompt(serverName, name, args) {
        const res = await this._require(serverName).client.getPrompt({ name, arguments: args || {} });
        return res; // { description, messages }
    }

    listConnected() {
        return [...this.clients.entries()].map(([name, e]) => ({
            serverName: name,
            status: e.status,
            transport: e.transportKind,
            error: e.error
        }));
    }

    getStatus(serverName) {
        const e = this.clients.get(serverName);
        if (!e) return { status: 'disconnected', error: null };
        return { status: e.status, error: e.error, transport: e.transportKind };
    }

    registerIpcHandlers(ipcMain) {
        ipcMain.handle('mcp:connect', async (_e, payload) => {
            const { serverName, ...config } = payload;
            return await this.connect(serverName, config);
        });
        ipcMain.handle('mcp:disconnect', async (_e, serverName) => {
            await this.disconnect(serverName);
            return true;
        });
        ipcMain.handle('mcp:listTools', async (_e, serverName) => {
            return await this.listTools(serverName);
        });
        ipcMain.handle('mcp:callTool', async (_e, { serverName, toolName, args }) => {
            return await this.callTool(serverName, toolName, args);
        });

        // Phase 2 — resources & prompts
        ipcMain.handle('mcp:listResources', async (_e, serverName) => {
            return await this.listResources(serverName);
        });
        ipcMain.handle('mcp:readResource', async (_e, { serverName, uri }) => {
            return await this.readResource(serverName, uri);
        });
        ipcMain.handle('mcp:listPrompts', async (_e, serverName) => {
            return await this.listPrompts(serverName);
        });
        ipcMain.handle('mcp:getPrompt', async (_e, { serverName, name, args }) => {
            return await this.getPrompt(serverName, name, args);
        });

        // Phase 3 — introspection
        ipcMain.handle('mcp:list', async () => this.listConnected());
        ipcMain.handle('mcp:getStatus', async (_e, serverName) => this.getStatus(serverName));
    }
}

export const mcpManager = new MCPManager();
