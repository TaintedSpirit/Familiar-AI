export class MCPLoader {
    constructor() {
        this.servers = {};
        this.connectedServers = new Set();
        this.toolsCache = []; // Formatted for LLM tool schema
    }

    /**
     * @param {Object} serversConfig - Record<serverName, { command, args, env }>
     */
    async configure(serversConfig) {
        this.servers = serversConfig;
        
        // Connect to all newly configured servers
        for (const [name, config] of Object.entries(this.servers)) {
            if (!this.connectedServers.has(name)) {
                await this.connectServer(name, config);
            }
        }

        // Rebuild tools cache
        await this.refreshTools();
    }

    async connectServer(name, config) {
        if (!window.electronAPI?.mcp) {
            console.warn('[MCPLoader] App running outside Electron context. MCP is disabled.');
            return false;
        }

        try {
            console.log(`[MCPLoader] Connecting to MCP server: ${name}`);
            await window.electronAPI.mcp.connect({
                serverName: name,
                command: config.command,
                args: config.args || [],
                env: config.env || {}
            });
            this.connectedServers.add(name);
            return true;
        } catch (err) {
            console.error(`[MCPLoader] Failed to connect to ${name}:`, err);
            return false;
        }
    }

    async refreshTools() {
        if (!window.electronAPI?.mcp) return;

        this.toolsCache = [];

        for (const name of this.connectedServers) {
            try {
                const tools = await window.electronAPI.mcp.listTools(name);
                
                // Map MCP raw tool format into Ai Familiar tool parameters format
                for (const t of tools) {
                    this.toolsCache.push({
                        // Prefix the tool name to ensure uniqueness and route it back to the server
                        name: `mcp_${name}__${t.name}`,
                        description: t.description || `MCP tool from ${name}`,
                        parameters: {
                            type: 'object',
                            properties: t.inputSchema?.properties || {},
                            required: t.inputSchema?.required || []
                        },
                        _mcpContext: {
                            serverName: name,
                            originalToolName: t.name
                        }
                    });
                }
            } catch (err) {
                console.error(`[MCPLoader] Failed to list tools for ${name}:`, err);
            }
        }
        
        console.log(`[MCPLoader] Loaded ${this.toolsCache.length} MCP tools into cache.`);
    }

    getTools() {
        return this.toolsCache;
    }

    async executeTool(prefixedToolName, args) {
        const toolMeta = this.toolsCache.find(t => t.name === prefixedToolName);
        if (!toolMeta) {
            throw new Error(`MCP Tool ${prefixedToolName} not found in cache.`);
        }

        const { serverName, originalToolName } = toolMeta._mcpContext;
        
        console.log(`[MCPLoader] Executing ${originalToolName} on ${serverName} with args:`, args);
        return await window.electronAPI.mcp.callTool({
            serverName,
            toolName: originalToolName,
            args
        });
    }
}

export const mcpLoader = new MCPLoader();
