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
        description: 'Capture the screen and run structured perception: OCR to extract visible text, UI element detection (buttons, inputs, URLs), cursor position, and heuristic intent inference. Returns a structured JSON report AND attaches the screenshot to your visual context. Call this whenever the user asks what is on their screen, what they are working on, or when you need grounded screen-state data to answer a question.',
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
    },
    {
        name: 'execute_sandboxed',
        description: 'Run code in an isolated Docker container (Python, Node, or shell). Safer than run_command for untrusted or destructive scripts. Requires Docker Desktop.',
        parameters: {
            type: 'object',
            properties: {
                command: { type: 'string', description: 'Code or shell command to execute' },
                language: { type: 'string', enum: ['python', 'node', 'sh'], description: 'Runtime environment' }
            },
            required: ['command', 'language']
        }
    },
    {
        name: 'generate_image',
        description: 'Generate an image from a text prompt using DALL-E 3 or Stability AI. The result opens in the Live Canvas panel.',
        parameters: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'Detailed image description' },
                size: { type: 'string', enum: ['1024x1024', '1792x1024', '1024x1792'], description: 'Image dimensions (default 1024x1024)' }
            },
            required: ['prompt']
        }
    },
    {
        name: 'schedule_task',
        description: 'Schedule a recurring task using a 5-field cron expression. The agent receives the intent as a prompt at each trigger time.',
        parameters: {
            type: 'object',
            properties: {
                cron: { type: 'string', description: '5-field cron expression, e.g. "0 9 * * 1-5" for weekdays at 9 AM' },
                intent: { type: 'string', description: 'What the agent should do when the task fires' },
                id: { type: 'string', description: 'Optional stable job identifier for later removal' }
            },
            required: ['cron', 'intent']
        }
    },
    {
        name: 'remove_scheduled_task',
        description: 'Cancel a previously scheduled recurring task by its id.',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Job id returned by schedule_task' }
            },
            required: ['id']
        }
    },
    {
        name: 'spawn_agent',
        description: 'Spawn a specialist background agent to handle a long or parallel task without blocking the conversation. The result is announced in chat when done.',
        parameters: {
            type: 'object',
            properties: {
                task: { type: 'string', description: 'Full task description for the background agent' },
                label: { type: 'string', description: 'Short human-readable label for tracking, e.g. "Research quantum computing"' },
                agentId: { type: 'string', description: 'Optional specialist profile: "researcher" (web research + citations), "builder" (code + file ops), "auditor" (security review). Omit for a general agent.' }
            },
            required: ['task']
        }
    },
    {
        name: 'list_spawns',
        description: 'List all currently running background agents and how long they have been running.',
        parameters: { type: 'object', properties: {} }
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
