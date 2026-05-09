import { AGENT_REGISTRY } from './AgentRegistry';

const MAX_CONCURRENT = 3;
const MAX_DEPTH = 2;
const SPAWNED_MAX_ITERATIONS = 8;
const SPAWNED_BLOCKED_TOOLS = new Set(['spawn_agent']); // sub-agents cannot spawn sub-agents

class AgentSpawner {
    constructor() {
        this._active = new Map(); // id → { id, label, task, startedAt, promise, depth }
    }

    async spawn(task, label, onComplete, agentId, depth = 0) {
        if (depth >= MAX_DEPTH) {
            return { error: `Sub-agent depth limit (${MAX_DEPTH}) reached. Agents may not spawn further sub-agents.` };
        }
        if (this._active.size >= MAX_CONCURRENT) {
            return { error: `Too many background agents running (max ${MAX_CONCURRENT}). Wait for one to finish.` };
        }

        const id = `spawn_${Date.now()}`;
        const startedAt = Date.now();
        const profile = agentId ? AGENT_REGISTRY[agentId] : null;

        const augmentedTask = profile
            ? `${profile.systemPromptSuffix}\n\nYour task: ${task}`
            : task;

        const { useAgentTaskStore } = await import('./AgentTaskStore');
        useAgentTaskStore.getState().addTask({
            id, agentId: agentId || null, label, task,
            status: 'running', startedAt, depth
        });

        const promise = (async () => {
            try {
                const { agentLoop } = await import('./AgentLoop');
                const result = await agentLoop.run(augmentedTask, [], {
                    maxIterations: SPAWNED_MAX_ITERATIONS,
                    blockedTools: SPAWNED_BLOCKED_TOOLS,
                    depth: depth + 1,
                });
                return result;
            } catch (e) {
                return { type: 'text', content: `Spawn error: ${e.message}`, reply: `Spawn error: ${e.message}` };
            }
        })().then(result => {
            if (!this._active.has(id)) return result;
            this._active.delete(id);
            const elapsed = Math.round((Date.now() - startedAt) / 1000);
            useAgentTaskStore.getState().updateTask(id, { status: 'completed', result, completedAt: Date.now(), elapsed });
            onComplete?.({ id, label, result, elapsed, agentId });
            return result;
        }).catch(e => {
            this._active.delete(id);
            useAgentTaskStore.getState().updateTask(id, { status: 'failed', error: e.message });
            return { error: e.message };
        });

        this._active.set(id, { id, label, task, startedAt, promise, depth });
        return { id, label, agentId: agentId || null, status: 'running', message: `Background agent started: "${label || task.slice(0, 60)}"` };
    }

    kill(id) {
        if (!this._active.has(id)) return;
        this._active.delete(id);
        import('./AgentTaskStore').then(({ useAgentTaskStore }) => {
            useAgentTaskStore.getState().updateTask(id, { status: 'killed', completedAt: Date.now() });
        });
    }

    list() {
        return [...this._active.values()].map(({ id, label, task, startedAt, depth }) => ({
            id, label, task, depth,
            runningFor: Math.round((Date.now() - startedAt) / 1000)
        }));
    }

    count() { return this._active.size; }
}

export const agentSpawner = new AgentSpawner();
