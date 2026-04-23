import { AGENT_REGISTRY } from './AgentRegistry';

const MAX_CONCURRENT = 3;

class AgentSpawner {
    constructor() {
        this._active = new Map(); // id → { id, label, task, startedAt, promise }
    }

    async spawn(task, label, onComplete, agentId) {
        if (this._active.size >= MAX_CONCURRENT) {
            return { error: `Too many background agents running (max ${MAX_CONCURRENT}). Wait for one to finish.` };
        }

        const id = `spawn_${Date.now()}`;
        const startedAt = Date.now();
        const profile = agentId ? AGENT_REGISTRY[agentId] : null;

        // Prepend specialist instructions to the task prompt
        const augmentedTask = profile
            ? `${profile.systemPromptSuffix}\n\nYour task: ${task}`
            : task;

        // Register in AgentTaskStore — captured in closure for the promise callbacks below
        const { useAgentTaskStore } = await import('./AgentTaskStore');
        useAgentTaskStore.getState().addTask({
            id, agentId: agentId || null, label, task,
            status: 'running', startedAt
        });

        const promise = (async () => {
            try {
                const { agentLoop } = await import('./AgentLoop');
                const result = await agentLoop.run(augmentedTask, [], {});
                return result;
            } catch (e) {
                return { type: 'text', content: `Spawn error: ${e.message}`, reply: `Spawn error: ${e.message}` };
            }
        })().then(result => {
            if (!this._active.has(id)) return result; // killed — skip announce
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

        this._active.set(id, { id, label, task, startedAt, promise });
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
        return [...this._active.values()].map(({ id, label, task, startedAt }) => ({
            id, label, task,
            runningFor: Math.round((Date.now() - startedAt) / 1000)
        }));
    }

    count() { return this._active.size; }
}

export const agentSpawner = new AgentSpawner();
