import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

class MCPManager {
    constructor() {
        this.clients = new Map(); // serverName -> { client, transport }
    }

    async connect(serverName, command, args, env) {
        if (this.clients.has(serverName)) {
            await this.disconnect(serverName);
        }

        console.log(`[MCPManager] Connecting to ${serverName} via ${command} ${args.join(' ')}`);
        
        const transport = new StdioClientTransport({
            command,
            args,
            env: { ...process.env, ...env }
        });

        const client = new Client(
            { name: `aifamiliar-${serverName}`, version: "1.0.0" },
            { capabilities: {} }
        );

        await client.connect(transport);
        this.clients.set(serverName, { client, transport });
        console.log(`[MCPManager] Connected to ${serverName}`);
        
        return true;
    }

    async disconnect(serverName) {
        const connection = this.clients.get(serverName);
        if (connection) {
            try {
                await connection.client.close();
            } catch (err) {
                console.error(`[MCPManager] Error closing client for ${serverName}:`, err);
            }
            this.clients.delete(serverName);
            console.log(`[MCPManager] Disconnected ${serverName}`);
        }
    }

    async listTools(serverName) {
        const connection = this.clients.get(serverName);
        if (!connection) throw new Error(`MCP server ${serverName} not connected`);
        
        const res = await connection.client.listTools();
        return res.tools || [];
    }

    async callTool(serverName, toolName, args) {
        const connection = this.clients.get(serverName);
        if (!connection) throw new Error(`MCP server ${serverName} not connected`);

        const res = await connection.client.callTool({
            name: toolName,
            arguments: args
        });

        if (res.isError) {
            throw new Error(`Tool ${toolName} on ${serverName} returned error: ${JSON.stringify(res.content)}`);
        }
        
        // MCP tool responses are typically an array of text contents
        const resultText = res.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n');
            
        return resultText;
    }

    // Connect IPC Handlers
    registerIpcHandlers(ipcMain) {
        ipcMain.handle('mcp:connect', async (event, { serverName, command, args, env }) => {
            return await this.connect(serverName, command, args, env);
        });

        ipcMain.handle('mcp:disconnect', async (event, serverName) => {
            await this.disconnect(serverName);
            return true;
        });

        ipcMain.handle('mcp:listTools', async (event, serverName) => {
            return await this.listTools(serverName);
        });

        ipcMain.handle('mcp:callTool', async (event, { serverName, toolName, args }) => {
            return await this.callTool(serverName, toolName, args);
        });
    }
}

export const mcpManager = new MCPManager();
