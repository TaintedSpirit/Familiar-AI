/**
 * AgentSpawner — runs background agent tasks concurrently without blocking
 * the main conversation. Results are delivered via WatcherStore notifications.
 *
 * Max 3 concurrent spawns to avoid hammering the API.
 */

const MAX_CONCURRENT = 3;

class AgentSpawner {
    constructor() {
        this._active = new Map(); // id → { id, label, task, startedAt, promise }
    }

    /**
     * Spawn a background agent for a task.
     * Returns immediately with a spawn ID; result is delivered via onComplete.
     */
    async spawn(task, label, onComplete) {
        if (this._active.size >= MAX_CONCURRENT) {
            return { error: `Too many background agents running (max ${MAX_CONCURRENT}). Wait for one to finish.` };
        }

        const id = `spawn_${Date.now()}`;
        const startedAt = Date.now();

        const promise = (async () => {
            try {
                const { agentLoop } = await import('./AgentLoop');
                const result = await agentLoop.run(task, [], {});
                return result;
            } catch (e) {
                return { type: 'text', content: `Spawn error: ${e.message}`, reply: `Spawn error: ${e.message}` };
            }
        })().then(result => {
            this._active.delete(id);
            const elapsed = Math.round((Date.now() - startedAt) / 1000);
            const summary = result?.reply || result?.content || 'Task complete.';
            onComplete?.({ id, label, result, elapsed });
            return result;
        }).catch(e => {
            this._active.delete(id);
            return { error: e.message };
        });

        this._active.set(id, { id, label, task, startedAt, promise });
        return { id, label, status: 'running', message: `Background agent started: "${label || task.slice(0, 60)}"` };
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
