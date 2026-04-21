/**
 * Thin wrapper over the main-process memory IPC.
 * All methods are async and return Promises matching the handlers in electron/memory/MemoryIpc.cjs.
 *
 * When run outside Electron (e.g. plain `vite` dev for web preview), the API gracefully no-ops
 * so unit code paths don't explode — saves return a synthetic id but nothing is persisted.
 */

const api = () => (typeof window !== 'undefined' ? window.electronAPI?.memory : null);
const stub = () => {
    if (typeof console !== 'undefined') console.warn('[memoryClient] electronAPI.memory unavailable — operating in no-op mode');
};

export const memoryClient = {
    available() { return !!api(); },

    async save(args) {
        const m = api(); if (!m) { stub(); return { id: `stub-${Date.now()}`, path: '(stub)', hash: '' }; }
        return m.save(args);
    },
    async update(args) {
        const m = api(); if (!m) { stub(); return null; }
        return m.update(args);
    },
    async delete(args) {
        const m = api(); if (!m) { stub(); return { ok: false }; }
        return m.delete(args);
    },
    async get(args) {
        const m = api(); if (!m) return null;
        return m.get(args);
    },
    async search(query, opts = {}) {
        const m = api(); if (!m) return { hits: [], total: 0 };
        return m.search({ query, ...opts });
    },
    async list(opts = {}) {
        const m = api(); if (!m) return { items: [] };
        return m.list(opts);
    },
    async rules() {
        const m = api(); if (!m) return { rules: [] };
        return m.rules();
    },
    async stats() {
        const m = api(); if (!m) return { count: 0, byType: {}, lastIndexed: 0 };
        return m.stats();
    },
    async getDir() {
        const m = api(); if (!m) return null;
        return m.getDir();
    },
    async rescan() {
        const m = api(); if (!m) return { indexed: 0, removed: 0 };
        return m.rescan();
    },
    onChanged(callback) {
        const m = api(); if (!m) return () => { };
        return m.onChanged(callback);
    }
};

/** Cached rules with TTL so SimulationCore can call this on every evaluate() cheaply. */
let _rulesCache = null;
let _rulesAt = 0;
export async function getCachedRules(ttlMs = 5 * 60 * 1000) {
    const now = Date.now();
    if (_rulesCache && now - _rulesAt < ttlMs) return _rulesCache;
    try {
        const { rules } = await memoryClient.rules();
        _rulesCache = rules || [];
        _rulesAt = now;
        return _rulesCache;
    } catch (e) {
        console.warn('[memoryClient] rules() failed', e?.message);
        return _rulesCache || [];
    }
}

export function invalidateRulesCache() {
    _rulesCache = null;
    _rulesAt = 0;
}

// Invalidate rule cache whenever any innerworld-rule memory changes
if (typeof window !== 'undefined' && window.electronAPI?.memory?.onChanged) {
    try {
        window.electronAPI.memory.onChanged((payload) => {
            if (payload?.type === 'innerworld-rule' || payload?.op === 'delete') invalidateRulesCache();
        });
    } catch (_) { /* ignore */ }
}

// ── Project-root memory client ──────────────────────────────────────────────

const pmApi = () => (typeof window !== 'undefined' ? window.electronAPI?.projectMemory : null);

export const projectMemoryClient = {
    available() { return !!pmApi(); },

    async search(query, opts = {}) {
        const m = pmApi(); if (!m) return { hits: [], total: 0 };
        return m.search({ query, ...opts });
    },
    async searchHybrid(query, opts = {}) {
        const m = pmApi(); if (!m) return { hits: [], total: 0, mode: 'unavailable' };
        return m.searchHybrid({ query, ...opts });
    },
    async setEmbeddingKey(key) {
        const m = pmApi(); if (!m || !key) return;
        return m.setEmbeddingKey(key);
    },
    async getDailyLog(date) {
        const m = pmApi(); if (!m) return null;
        return m.getDailyLog(date);
    },
    async writeDailyLog(date, content) {
        const m = pmApi(); if (!m) return { ok: false };
        return m.writeDailyLog(date, content);
    },
    async readRootFiles() {
        const m = pmApi(); if (!m) return {};
        return m.readRootFiles();
    },
    async writeRootFile(name, content) {
        const m = pmApi(); if (!m) return { ok: false };
        return m.writeRootFile(name, content);
    },
    async getRoot() {
        const m = pmApi(); if (!m) return null;
        return m.getRoot();
    },
    async stats() {
        const m = pmApi(); if (!m) return { total: 0, byType: {} };
        return m.stats();
    },
    async rescan() {
        const m = pmApi(); if (!m) return { indexed: 0, removed: 0 };
        return m.rescan();
    },
};
