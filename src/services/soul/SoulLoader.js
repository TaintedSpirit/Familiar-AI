const DEFAULT_SOUL = `# Soul

**Name:** Antigravity
**Personality:** Curious, direct, warm. Never sycophantic.
**Values:** Honesty, efficiency, user autonomy.
**Tone:** Conversational but precise. Plain language.

## Constraints
- Never pretend to be human when sincerely asked
- Always confirm before taking irreversible actions
- Max 2-3 sentences for standard replies unless asked for detail
`;

class SoulLoader {
    constructor() {
        this._cache = null;
        this._loaded = false;
    }

    async load() {
        if (!window.electronAPI?.readSoulFiles) {
            this._cache = { 'soul.md': DEFAULT_SOUL, 'memory.md': '', 'goals.md': '', skills: {} };
            this._loaded = true;
            return;
        }
        try {
            // Load legacy soul files (familiar-memory/)
            const legacy = await window.electronAPI.readSoulFiles();

            // Load project-root files (Soul.md, User.md, memory.md, agent.md) — takes priority
            let root = {};
            try {
                if (window.electronAPI.projectMemory?.readRootFiles) {
                    root = await window.electronAPI.projectMemory.readRootFiles();
                }
            } catch (_) { }

            // Project-root Soul.md overrides familiar-memory/soul.md when present
            this._cache = {
                ...legacy,
                'soul.md': root['Soul.md']?.trim() ? root['Soul.md'] : legacy['soul.md'],
                'memory.md': root['memory.md']?.trim() ? root['memory.md'] : legacy['memory.md'],
                'goals.md': legacy['goals.md'],
                'user.md': root['User.md'] || '',
                'agent.md': root['agent.md'] || '',
            };
            this._loaded = true;
            console.log('[SoulLoader] Soul files loaded (project-root + familiar-memory).');
        } catch (e) {
            console.warn('[SoulLoader] Failed to load soul files, using defaults:', e);
            this._cache = { 'soul.md': DEFAULT_SOUL, 'memory.md': '', 'goals.md': '', skills: {} };
            this._loaded = true;
        }
    }

    getSoulContext() {
        if (!this._cache) return '';
        const soul = this._cache['soul.md'];
        const user = this._cache['user.md'];
        const memory = this._cache['memory.md'];
        const goals = this._cache['goals.md'];
        const agent = this._cache['agent.md'];

        let ctx = '';
        if (soul?.trim()) ctx += `\n*** SOUL (Identity) ***\n${soul}\n`;
        if (user?.trim()) ctx += `\n*** USER PROFILE ***\n${user}\n`;
        if (memory?.length > 50) ctx += `\n*** LONG-TERM MEMORY ***\n${memory}\n`;
        if (goals?.length > 50) ctx += `\n*** STANDING GOALS ***\n${goals}\n`;
        if (agent?.trim()) ctx += `\n*** AGENT RULES ***\n${agent}\n`;
        return ctx;
    }

    async appendToMemory(fact) {
        if (!window.electronAPI?.writeSoulFile) return;
        const existing = this._cache?.['memory.md'] || '';
        const date = new Date().toISOString().slice(0, 10);
        const updated = existing.trimEnd() + `\n- ${date}: ${fact}`;
        await window.electronAPI.writeSoulFile('memory.md', updated);
        if (this._cache) this._cache['memory.md'] = updated;

        // Also persist as an indexed long-term memory entry so FTS picks it up immediately.
        try {
            const { memoryClient } = await import('../memory2/MemoryClient');
            await memoryClient.save({ type: 'user', body: fact, source: 'soul-append', tags: ['soul'] });
        } catch (e) {
            console.warn('[SoulLoader] memory index write failed:', e?.message);
        }
    }

    async reload() {
        this._loaded = false;
        await this.load();
    }

    isLoaded() {
        return this._loaded;
    }
}

export const soulLoader = new SoulLoader();
