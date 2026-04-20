import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

export const useSafetyStore = create(
    persist(
        (set, get) => ({
            snapshots: [],
            executionLog: [],

            // 1. Create Snapshot
            createSnapshot: (type, data) => {
                const id = uuidv4();
                const snapshot = {
                    id,
                    timestamp: Date.now(),
                    type, // 'workflow', 'artifact'
                    data: JSON.parse(JSON.stringify(data)) // Deep copy safety
                };

                set(state => ({
                    snapshots: [snapshot, ...state.snapshots].slice(0, 50) // Keep last 50
                }));

                return id;
            },

            // 2. Log Execution
            logExecution: (proposalId, snapshotId, summary, status = 'applied') => {
                const id = uuidv4();
                const entry = {
                    id,
                    proposalId,
                    snapshotId,
                    timestamp: Date.now(),
                    summary,
                    status
                };

                set(state => ({
                    executionLog: [entry, ...state.executionLog].slice(0, 100) // Keep last 100 logs
                }));

                return id;
            },

            // 3. Undo Last Action
            // Returns the snapshot data to be restored by the caller
            undoLast: () => {
                const { executionLog, snapshots } = get();
                // Find last 'applied' action
                const lastAction = executionLog.find(e => e.status === 'applied');

                if (!lastAction) return { success: false, error: 'No actions to undo.' };

                const snapshot = snapshots.find(s => s.id === lastAction.snapshotId);
                if (!snapshot) return { success: false, error: 'Snapshot not found.' };

                // Mark as undone
                set(state => ({
                    executionLog: state.executionLog.map(e =>
                        e.id === lastAction.id ? { ...e, status: 'undone' } : e
                    )
                }));

                return { success: true, type: snapshot.type, data: snapshot.data, actionId: lastAction.id };
            },

            getRecentLogs: (limit = 5) => {
                return get().executionLog.slice(0, limit);
            },

            clearHistory: () => set({ snapshots: [], executionLog: [] })
        }),
        {
            name: 'ai-familiar-safety', // LocalStorage key
        }
    )
);
