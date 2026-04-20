import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

export const useWatcherStore = create(
    persist(
        (set, get) => ({
            watchers: [],
            notifications: [],
            isMuted: false,
            muteUntil: 0,

            // 1. Watcher Management
            addWatcher: (watcher) => set(state => ({
                watchers: [...state.watchers, {
                    id: uuidv4(),
                    enabled: true,
                    lastCheck: 0,
                    ...watcher
                }]
            })),

            removeWatcher: (id) => set(state => ({
                watchers: state.watchers.filter(w => w.id !== id)
            })),

            toggleWatcher: (id, enabled) => set(state => ({
                watchers: state.watchers.map(w => w.id === id ? { ...w, enabled } : w)
            })),

            // 2. Notifications
            addNotification: (text, priority = 'low') => {
                const state = get();
                const now = Date.now();

                // Check Mute
                if (state.isMuted && now < state.muteUntil && priority !== 'high') return;

                // Rate Limiting (1 per 10 mins unless high)
                if (priority !== 'high') {
                    const lastNotif = state.notifications[0];
                    if (lastNotif && (now - lastNotif.timestamp) < 10 * 60 * 1000) {
                        console.log("Notification throttled:", text);
                        return; // Drop it
                    }
                }

                set(prevState => ({
                    notifications: [{ id: uuidv4(), text, priority, timestamp: now, read: false }, ...prevState.notifications].slice(0, 50)
                }));
            },

            markRead: (id) => set(state => ({
                notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n)
            })),

            muteNotifications: (durationMs) => set({
                isMuted: true,
                muteUntil: Date.now() + durationMs
            }),

            clearNotifications: () => set({ notifications: [] }),

            unmute: () => set({ isMuted: false, muteUntil: 0 })
        }),
        {
            name: 'ai-familiar-watchers'
        }
    )
);
