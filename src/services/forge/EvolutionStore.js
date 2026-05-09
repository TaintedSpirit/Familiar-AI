// EvolutionStore — tracks Forge experiments, benchmark leaderboard, and the
// currently staged merge proposal. Persisted to memory/forge-state.json so
// state survives reloads while a proposal is awaiting review.

import { create } from 'zustand';

const STORAGE_KEY = 'forge:evolution-state';

const initial = {
    experiments: {},     // sandboxId → { goal, createdAt, status, benchmarks: [] }
    bestResults: {},     // componentName → { sandboxId, score, metric, ranAt }
    pendingMerge: null,  // { sandboxId, report, diff, stagedAt } | null
    history: [],         // [{ sandboxId, decision, mergedAt, summary }]
};

const loadPersisted = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return initial;
        const parsed = JSON.parse(raw);
        return { ...initial, ...parsed };
    } catch {
        return initial;
    }
};

const persist = (state) => {
    try {
        const { experiments, bestResults, pendingMerge, history } = state;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            experiments, bestResults, pendingMerge, history,
        }));
    } catch { /* non-fatal */ }
};

export const useEvolutionStore = create((set, get) => ({
    ...loadPersisted(),

    addExperiment: (sandboxId, goal) => {
        set((s) => ({
            experiments: {
                ...s.experiments,
                [sandboxId]: {
                    goal,
                    createdAt: Date.now(),
                    status: 'active',
                    benchmarks: [],
                },
            },
        }));
        persist(get());
    },

    recordBenchmark: (sandboxId, benchmark) => {
        set((s) => {
            const exp = s.experiments[sandboxId];
            if (!exp) return s;
            return {
                experiments: {
                    ...s.experiments,
                    [sandboxId]: {
                        ...exp,
                        benchmarks: [...exp.benchmarks, { ...benchmark, ranAt: Date.now() }],
                    },
                },
            };
        });
        persist(get());
    },

    updateBest: (componentName, sandboxId, score, metric) => {
        set((s) => {
            const cur = s.bestResults[componentName];
            if (cur && cur.score >= score) return s; // higher score = better
            return {
                bestResults: {
                    ...s.bestResults,
                    [componentName]: { sandboxId, score, metric, ranAt: Date.now() },
                },
            };
        });
        persist(get());
    },

    stagePendingMerge: ({ sandboxId, report, diff }) => {
        set({ pendingMerge: { sandboxId, report, diff, stagedAt: Date.now() } });
        persist(get());
    },

    clearPendingMerge: () => {
        set({ pendingMerge: null });
        persist(get());
    },

    recordDecision: (sandboxId, decision, summary) => {
        set((s) => ({
            history: [
                { sandboxId, decision, summary, mergedAt: Date.now() },
                ...s.history,
            ].slice(0, 100),
            pendingMerge: null,
            experiments: {
                ...s.experiments,
                [sandboxId]: s.experiments[sandboxId]
                    ? { ...s.experiments[sandboxId], status: decision === 'accepted' ? 'merged' : 'rejected' }
                    : s.experiments[sandboxId],
            },
        }));
        persist(get());
    },

    removeExperiment: (sandboxId) => {
        set((s) => {
            const next = { ...s.experiments };
            delete next[sandboxId];
            return { experiments: next };
        });
        persist(get());
    },
}));
