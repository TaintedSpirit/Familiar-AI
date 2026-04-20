import { mcpLoader } from './MCPLoader';

const TOOLS = [
    {
        name: 'web_search',
        description: 'Search the web for current information, news, or facts.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The search query' }
            },
            required: ['query']
        }
    },
    {
        name: 'scrape_url',
        description: 'Fetch and read the text content of a web page URL.',
        parameters: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'The full URL to fetch' }
            },
            required: ['url']
        }
    },
    {
        name: 'get_screen_context',
        description: 'Capture a screenshot of the current screen and return the active window title.',
        parameters: { type: 'object', properties: {} }
    },
    {
        name: 'get_clipboard',
        description: 'Read the current clipboard text content.',
        parameters: { type: 'object', properties: {} }
    },
    {
        name: 'read_file',
        description: 'Read the text content of a file from disk.',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Absolute path to the file' }
            },
            required: ['path']
        }
    },
    {
        name: 'write_file',
        description: 'Write text content to a file on disk. Creates or overwrites the file.',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Absolute path to write to' },
                content: { type: 'string', description: 'Text content to write' }
            },
            required: ['path', 'content']
        }
    },
    {
        name: 'list_dir',
        description: 'List files and folders in a directory.',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Directory path to list' }
            },
            required: ['path']
        }
    },
    {
        name: 'run_command',
        description: 'Run a shell command and return stdout/stderr. Use for reading system info, running scripts, etc.',
        parameters: {
            type: 'object',
            properties: {
                command: { type: 'string', description: 'Shell command to execute' }
            },
            required: ['command']
        }
    },
    {
        name: 'update_memory',
        description: 'Permanently remember a fact or piece of information for future sessions.',
        parameters: {
            type: 'object',
            properties: {
                fact: { type: 'string', description: 'The fact or information to remember' }
            },
            required: ['fact']
        }
    }
];

export const toolRegistry = {
    getAll: () => [...TOOLS, ...mcpLoader.getTools()],
    get: (name) => {
        const local = TOOLS.find(t => t.name === name);
        if (local) return local;
        // Search in MCP Cache
        return mcpLoader.getTools().find(t => t.name === name);
    }
};
