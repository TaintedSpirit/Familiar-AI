// CommandRegistry — single source of truth for slash commands.
//
// Pattern adapted from Hermes' COMMAND_REGISTRY (commands.py): one definition
// drives dispatch, the Command Palette UI, and inline autocomplete.
//
// A CommandDef is a plain object:
//   { name, description, category, aliases, argsHint, icon, handler }
//
// Handler signature:
//   handler({ args, raw, context }) → string | { reply, sideEffect } | Promise<...>
//
// `context` is supplied by the caller (chat surface) and bundles store hooks
// and side-effect callbacks the handlers need. Handlers must not import stores
// directly — that keeps the registry decoupled and avoids circular deps.

import {
    Plus, Eraser, PencilLine, Cpu, Sparkles, Users, ListChecks, Square,
    Hammer, GitBranch, Activity, Settings, BarChart2,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtAgentRoster = (registry) => {
    const lines = Object.values(registry).map(p =>
        `**${p.name}** (${p.archetype})\n${p.description}\nTools: ${p.allowedTools.join(', ')}`
    );
    return `Pack Roster:\n\n${lines.join('\n\n')}\n\nUse: spawn_agent agentId="researcher|builder|auditor" task="…"`;
};

const findModelEntry = (catalog, query) => {
    const q = query.toLowerCase();
    return catalog.find(m => m.id.toLowerCase() === q)
        ?? catalog.find(m => m.modelId.toLowerCase() === q)
        ?? catalog.find(m => m.label.toLowerCase() === q)
        ?? catalog.find(m => m.modelId.toLowerCase().includes(q))
        ?? catalog.find(m => m.label.toLowerCase().includes(q))
        ?? null;
};

// ── Registry ──────────────────────────────────────────────────────────────────

export const COMMAND_REGISTRY = [
    // Session
    {
        name: 'new', aliases: ['reset'], category: 'Session', icon: Plus,
        argsHint: '[title]',
        description: 'Start a new chat chapter (preserves the current one).',
        handler: ({ args, context }) => {
            const title = args.join(' ').trim() || 'New Chapter';
            context.memoryStore.getState().addChatThread(title);
            return `New chapter started: "${title}".`;
        },
    },
    {
        name: 'clear', category: 'Session', icon: Eraser,
        description: 'Wipe messages from the active chapter.',
        handler: ({ context }) => {
            context.memoryStore.getState().clearMessages();
            return 'Chapter cleared.';
        },
    },
    {
        name: 'title', category: 'Session', icon: PencilLine,
        argsHint: '<name>',
        description: 'Rename the active chapter.',
        handler: ({ args, context }) => {
            const newTitle = args.join(' ').trim();
            if (!newTitle) return 'Usage: /title <new name>';
            const state = context.memoryStore.getState();
            const proj = state.projects.find(p => p.id === state.activeProjectId);
            const threadId = proj?.activeChatThreadId;
            if (!threadId) return 'No active chapter to rename.';
            state.renameChatThread(threadId, newTitle);
            return `Chapter renamed to "${newTitle}".`;
        },
    },

    // Models
    {
        name: 'model', aliases: ['provider'], category: 'Models', icon: Cpu,
        argsHint: '[id|label]',
        description: 'List available models or switch to one.',
        handler: ({ args, context }) => {
            const catalog = context.modelCatalog;
            const settings = context.settingsStore.getState();
            if (!args.length) {
                const grouped = {};
                for (const m of catalog) {
                    (grouped[m.group] ||= []).push(m);
                }
                const lines = Object.entries(grouped).map(([group, entries]) => {
                    const rows = entries.map(e => {
                        const active = e.provider === settings.aiProvider && e.modelId === settings.model;
                        return `  ${active ? '●' : '○'} ${e.label}  —  \`${e.modelId || e.id}\``;
                    });
                    return `**${group}**\n${rows.join('\n')}`;
                });
                return `Active: ${settings.aiProvider} / ${settings.model}\n\n${lines.join('\n\n')}\n\nUse: /model <id|label>`;
            }
            const query = args.join(' ');
            const entry = findModelEntry(catalog, query);
            if (!entry) return `No model matching "${query}". Try /model with no args to see the list.`;
            settings.setAiProvider(entry.provider);
            settings.setModel(entry.modelId || entry.id);
            return `Model switched: ${entry.label} (${entry.provider} / ${entry.modelId || entry.id}).`;
        },
    },
    {
        name: 'reasoning', category: 'Models', icon: Sparkles,
        argsHint: '[on|off]',
        description: 'Toggle reasoning/thinking display preference.',
        handler: ({ args, context }) => {
            const settings = context.settingsStore.getState();
            const current = !!settings.showReasoning;
            const next = args[0] === 'on' ? true
                       : args[0] === 'off' ? false
                       : !current;
            if (typeof settings.setShowReasoning === 'function') {
                settings.setShowReasoning(next);
            } else {
                // Settings store doesn't expose a setter — set directly via zustand.
                context.settingsStore.setState({ showReasoning: next });
            }
            return `Reasoning display: ${next ? 'on' : 'off'}.`;
        },
    },

    // Agents
    {
        name: 'agents', category: 'Agents', icon: Users,
        description: 'Show the agent roster (archetypes, tools).',
        handler: ({ context }) => fmtAgentRoster(context.agentRegistry),
    },
    {
        name: 'subagents', aliases: ['tasks'], category: 'Agents', icon: ListChecks,
        description: 'List active sub-agents.',
        handler: ({ context }) => {
            const list = context.agentSpawner.list();
            if (!list.length) return 'No active sub-agents.';
            const rows = list.map(s => `• [${s.id.slice(-6)}] "${s.label || s.task?.slice(0, 40)}" — ${s.runningFor}s`);
            return `Active Sub-Agents (${list.length}):\n\n${rows.join('\n')}`;
        },
    },
    {
        name: 'stopagent', category: 'Agents', icon: Square,
        argsHint: '[id]',
        description: 'Terminate a running sub-agent by id.',
        handler: ({ args, context }) => {
            const targetId = args[0];
            if (!targetId) return 'Usage: /stopagent <id-suffix>';
            const list = context.agentSpawner.list();
            const match = list.find(s => s.id.endsWith(targetId) || s.id === targetId);
            if (!match) return `No active agent matching "${targetId}".`;
            context.agentSpawner.kill(match.id);
            return `Agent [${match.id.slice(-6)}] "${match.label || match.task?.slice(0, 40)}" terminated.`;
        },
    },

    // Forge
    {
        name: 'forge', category: 'Forge', icon: Hammer,
        argsHint: '[create <goal> | list | destroy <id>]',
        description: 'Manage Forge evolution sandboxes.',
        handler: async ({ args, context }) => {
            const sub = args[0] || 'list';
            const forge = context.forgeService;
            if (!forge) return 'Forge service unavailable.';
            if (sub === 'list' || sub === 'ls') {
                const list = forge.listSandboxes ? forge.listSandboxes() : [];
                if (!list.length) return 'No active sandboxes.';
                return `Sandboxes (${list.length}):\n\n${list.map(s => `• ${s.sandboxId}  — ${s.goal || '(no goal)'}`).join('\n')}`;
            }
            if (sub === 'create') {
                const goal = args.slice(1).join(' ').trim() || 'Unnamed evolution';
                try {
                    const result = await forge.createSandbox(goal);
                    if (result?.error) return `Forge error: ${result.error}`;
                    return `Sandbox created: ${result.sandboxId}\nRoot: ${result.rootPath}`;
                } catch (e) {
                    return `Forge error: ${e.message}`;
                }
            }
            if (sub === 'destroy' || sub === 'rm') {
                const id = args[1];
                if (!id) return 'Usage: /forge destroy <sandboxId>';
                const result = await forge.destroySandbox(id);
                if (result?.error) return `Forge error: ${result.error}`;
                return `Sandbox ${id} destroyed.`;
            }
            return 'Usage: /forge [create <goal> | list | destroy <id>]';
        },
    },
    {
        name: 'evolution', category: 'Forge', icon: GitBranch,
        description: 'Show pending evolution proposals (sandboxes awaiting merge).',
        handler: ({ context }) => {
            const forge = context.forgeService;
            const list = forge?.listSandboxes ? forge.listSandboxes() : [];
            if (!list.length) return 'No pending evolutions.';
            return `Pending evolutions:\n\n${list.map(s => `• ${s.sandboxId}  — ${s.goal || '(no goal)'}`).join('\n')}`;
        },
    },

    // System
    {
        name: 'status', category: 'System', icon: Activity,
        description: 'Project, model, and agent health summary.',
        handler: ({ context }) => {
            const mem = context.memoryStore.getState();
            const settings = context.settingsStore.getState();
            const proj = mem.projects.find(p => p.id === mem.activeProjectId);
            const threadCount = (proj?.chatThreads || []).length;
            const activeThread = proj?.chatThreads?.find(t => t.id === proj.activeChatThreadId);
            const msgCount = activeThread?.messages?.length ?? 0;
            const agents = context.agentSpawner.list();
            return [
                `**Status**`,
                `Project: ${proj?.name || '(none)'}`,
                `Chapter: ${activeThread?.title || '(none)'} (${msgCount} messages, ${threadCount} chapters total)`,
                `Model: ${settings.aiProvider} / ${settings.model}`,
                `Active sub-agents: ${agents.length}`,
                `Trust: ${proj?.trustLevel ?? 'observe'}`,
                `Work mode: ${mem.workMode}`,
            ].join('\n');
        },
    },
    {
        name: 'config', category: 'System', icon: Settings,
        description: 'Open the Settings HUD.',
        handler: ({ context }) => {
            if (typeof context.openSettings === 'function') {
                context.openSettings();
                return 'Opening Settings…';
            }
            return 'Settings HUD is unavailable from this surface.';
        },
    },
    {
        name: 'usage', category: 'System', icon: BarChart2,
        description: 'Show token / message usage for the active chapter.',
        handler: ({ context }) => {
            const mem = context.memoryStore.getState();
            const proj = mem.projects.find(p => p.id === mem.activeProjectId);
            const thread = proj?.chatThreads?.find(t => t.id === proj.activeChatThreadId);
            const msgs = thread?.messages || [];
            const chars = msgs.reduce((sum, m) => sum + (m.content?.length || 0), 0);
            const approxTokens = Math.round(chars / 4);
            return `**Usage** (active chapter)\nMessages: ${msgs.length}\nCharacters: ${chars.toLocaleString()}\nApprox tokens: ~${approxTokens.toLocaleString()}`;
        },
    },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

const _byName = new Map();
for (const def of COMMAND_REGISTRY) {
    _byName.set(def.name, def);
    for (const a of def.aliases || []) _byName.set(a, def);
}

export const findCommand = (name) => _byName.get(name) || null;

export const parseInput = (input) => {
    const trimmed = (input || '').trim();
    if (!trimmed.startsWith('/')) return null;
    const parts = trimmed.slice(1).split(/\s+/);
    const name = (parts.shift() || '').toLowerCase();
    return { name, args: parts, raw: trimmed };
};

export const resolveCommand = (input) => {
    const parsed = parseInput(input);
    if (!parsed) return null;
    const def = findCommand(parsed.name);
    if (!def) return { unknown: true, name: parsed.name };
    return { def, args: parsed.args, raw: parsed.raw };
};

export const executeCommand = async (input, context) => {
    const resolved = resolveCommand(input);
    if (!resolved) return null;
    if (resolved.unknown) {
        return `Unknown command: /${resolved.name}. Type / to see available commands.`;
    }
    try {
        const out = await resolved.def.handler({
            args: resolved.args, raw: resolved.raw, context,
        });
        if (out == null) return '(no output)';
        if (typeof out === 'string') return out;
        if (typeof out === 'object' && typeof out.reply === 'string') return out.reply;
        return String(out);
    } catch (e) {
        return `Command error: ${e.message}`;
    }
};

export const searchCommands = (query) => {
    const q = (query || '').trim().toLowerCase().replace(/^\//, '');
    if (!q) return [...COMMAND_REGISTRY];
    return COMMAND_REGISTRY.filter(def => {
        if (def.name.includes(q)) return true;
        if ((def.aliases || []).some(a => a.includes(q))) return true;
        if (def.description.toLowerCase().includes(q)) return true;
        if ((def.category || '').toLowerCase().includes(q)) return true;
        return false;
    });
};

export const groupByCategory = (defs) => {
    const groups = new Map();
    for (const def of defs) {
        const key = def.category || 'Other';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(def);
    }
    return [...groups.entries()].map(([category, items]) => ({ category, items }));
};
