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
    },
    {
        name: 'read_skill',
        description: 'Load the full instructions of a named skill from the available_skills list in the system prompt. Use this when a user request matches a skill\'s description or when-to-use; the returned markdown is the playbook to follow.',
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'The exact skill name as advertised in <available_skills>.' }
            },
            required: ['name']
        }
    },
    {
        name: 'read_mcp_resource',
        description: 'Fetch the contents of an MCP resource (file, document, record) from a connected MCP server. Use the URIs surfaced in the "MCP Resources" section of the system prompt. Returns the textual content; binary contents are omitted.',
        parameters: {
            type: 'object',
            properties: {
                uri: { type: 'string', description: 'The resource URI as advertised by the MCP server (e.g. file:///..., notion://...).' },
                serverName: { type: 'string', description: 'Optional MCP server name to disambiguate when the same URI is hosted by multiple servers.' }
            },
            required: ['uri']
        }
    },
    {
        name: 'run_claude_code',
        description: 'Delegate a coding task to the Claude Code CLI — a real agent with file edit and bash tools. Use for non-trivial implementation, refactors, multi-file changes, or anything the in-app file tools cannot finish in one shot. Returns the final report from Claude Code.',
        parameters: {
            type: 'object',
            properties: {
                task: { type: 'string', description: 'Full instructions for Claude Code, written as you would type them into the CLI.' },
                cwd: { type: 'string', description: 'Working directory. Defaults to the configured project root.' },
                permissionMode: { type: 'string', enum: ['default', 'acceptEdits', 'plan', 'bypassPermissions'], description: 'Claude Code permission mode. Default: acceptEdits.' }
            },
            required: ['task']
        }
    },
    {
        name: 'forge_create_sandbox',
        description: 'Create an isolated sandbox copy of the codebase for experimental self-modification. Returns { sandboxId, rootPath }. All subsequent file operations under this sandboxId are routed to the sandbox tree, not production. Use when proposing performance or architectural improvements that need verification before applying.',
        parameters: {
            type: 'object',
            properties: {
                goal: { type: 'string', description: 'What you intend to change in this sandbox, e.g. "Optimize IntentClassifier latency".' }
            },
            required: ['goal']
        }
    },
    {
        name: 'forge_run_benchmarks',
        description: 'Run a benchmark suite inside a sandbox. The suite must exist at sandboxes/sb_<id>/benchmarks/<suite>.mjs and print one line of JSON to stdout (e.g. {"latencyMs":42,"score":0.91}). Returns the parsed JSON plus exit code and stderr. Required before forge_propose_evolution.',
        parameters: {
            type: 'object',
            properties: {
                sandboxId: { type: 'string', description: 'Sandbox id from forge_create_sandbox.' },
                suite:     { type: 'string', description: 'Benchmark name (filename without .mjs). Default: "default".' }
            },
            required: ['sandboxId']
        }
    },
    {
        name: 'forge_diff_sandbox',
        description: 'Compute a unified diff between sandbox files and the production tree. Returns the diff text and a list of changed files.',
        parameters: {
            type: 'object',
            properties: {
                sandboxId: { type: 'string', description: 'Sandbox id from forge_create_sandbox.' }
            },
            required: ['sandboxId']
        }
    },
    {
        name: 'forge_propose_evolution',
        description: 'Stage a merge proposal for user review. Rejected unless forge_run_benchmarks was called within the last 5 minutes for this sandbox AND the benchmark contains the metric named in report.metric showing non-regression vs report.baseline. Does NOT apply changes — the user must accept via the UI.',
        parameters: {
            type: 'object',
            properties: {
                sandboxId: { type: 'string', description: 'Sandbox id from forge_create_sandbox.' },
                report: {
                    type: 'object',
                    description: 'Evolution report shown to the user.',
                    properties: {
                        summary:   { type: 'string', description: 'One-line summary of the change.' },
                        rationale: { type: 'string', description: 'Why this change is an improvement.' },
                        metric:    { type: 'string', description: 'Benchmark field name to validate against (e.g. "latencyMs").' },
                        baseline:  { type: 'number', description: 'The production baseline for that metric.' },
                        higherIsBetter: { type: 'boolean', description: 'True if a higher metric value is better. Default false.' }
                    },
                    required: ['summary', 'rationale', 'metric', 'baseline']
                }
            },
            required: ['sandboxId', 'report']
        }
    },
    {
        name: 'forge_destroy_sandbox',
        description: 'Delete a sandbox and all its files. Use to clean up after a failed experiment.',
        parameters: {
            type: 'object',
            properties: {
                sandboxId: { type: 'string', description: 'Sandbox id to destroy.' }
            },
            required: ['sandboxId']
        }
    },
    {
        name: 'run_codex',
        description: 'Delegate a coding task to the OpenAI Codex CLI — an agent with file edit and shell tools. Use for implementation, refactors, or multi-file changes. Returns the final output from Codex.',
        parameters: {
            type: 'object',
            properties: {
                task: { type: 'string', description: 'Full task instructions for Codex, written as you would type them into the CLI.' },
                cwd: { type: 'string', description: 'Working directory. Defaults to the configured project root.' },
                approvalMode: { type: 'string', enum: ['suggest', 'auto-edit', 'full-auto'], description: 'Codex approval mode. Default: auto-edit.' }
            },
            required: ['task']
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
