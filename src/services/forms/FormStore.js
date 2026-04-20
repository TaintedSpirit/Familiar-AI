
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FORMS, getNextForm } from './FormRegistry';

export const useFormStore = create(
    persist(
        (set, get) => ({
            currentFormId: 'seed_blob',
            unlockedForms: ['seed_blob'],
            metrics: {
                sessions: 0,
                plansCompleted: 0,
                proposalsApproved: 0,
                undosUsed: 0,
                trustLevel: 'observe'
            },
            lastSuggestionAt: 0, // Timestamp to prevent spamming suggestions

            // Actions
            setCurrentForm: (id) => {
                if (get().unlockedForms.includes(id)) {
                    set({ currentFormId: id });
                }
            },

            unlockForm: (id) => set((state) => ({
                unlockedForms: [...new Set([...state.unlockedForms, id])]
            })),

            incrementMetric: (metric, amount = 1) => set((state) => ({
                metrics: {
                    ...state.metrics,
                    [metric]: (state.metrics[metric] || 0) + amount
                }
            })),

            setTrustLevel: (level) => set((state) => ({
                metrics: { ...state.metrics, trustLevel: level }
            })),

            checkEvolution: () => {
                const state = get();
                const current = FORMS[state.currentFormId];
                const next = getNextForm(state.currentFormId);

                if (!next || state.unlockedForms.includes(next.id)) return null;

                // Check Thresholds
                const met = Object.entries(next.thresholds).every(([key, val]) => {
                    if (key === 'trustLevel') {
                        // Custom logic for trust levels if strictly ordered, 
                        // but for now simple equality check or just map string to value
                        return state.metrics[key] === val;
                    }
                    return (state.metrics[key] || 0) >= val;
                });

                if (met) {
                    // Check cooldown (e.g. 1 suggestion per 24h or per session)
                    // For now, allow it if it hasn't been suggested in last 1 hour
                    if (Date.now() - state.lastSuggestionAt > 3600000) {
                        set({ lastSuggestionAt: Date.now() });
                        return next;
                    }
                }
                return null;
            }
        }),
        {
            name: 'ai-familiar-forms',
        }
    )
);
