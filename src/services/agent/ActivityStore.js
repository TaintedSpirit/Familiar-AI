import { create } from 'zustand';

const MAX_ACTIVITIES = 10;

/**
 * ActivityStore — tracks the live stream of agent tool executions.
 * Consumed by the ActivityTicker (above command bar) and ToolBlock (in chat).
 */
export const useActivityStore = create((set, get) => ({
    /** Array of { id, name, args, result, status, timestamp } */
    activities: [],

    /** True while CompactionService is running */
    isCompacting: false,

    /** Push a new tool call (status: 'working') */
    addToolCall: (step) => set(state => ({
        activities: [
            ...state.activities.slice(-(MAX_ACTIVITIES - 1)),
            {
                id: step.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: step.name,
                args: step.args || {},
                result: null,
                status: 'working',
                timestamp: Date.now(),
            }
        ]
    })),

    /** Update an existing tool call with its result */
    resolveToolCall: (id, result, error = false) => set(state => ({
        activities: state.activities.map(a =>
            a.id === id
                ? { ...a, result, status: error ? 'error' : 'success', resolvedAt: Date.now() }
                : a
        )
    })),

    /** Set the compacting spinner state */
    setCompacting: (bool) => set({ isCompacting: bool }),

    /** Clear all activities (called at the start of a new prompt) */
    clear: () => set({ activities: [], isCompacting: false }),

    /** Set the compaction state (for long-term memory maintenance) */
    isCompacting: false,
    setCompacting: (active) => set({ isCompacting: active }),

    /** Get only the activities from the current prompt */
    getActive: () => get().activities.filter(a => a.status === 'working'),
}));
