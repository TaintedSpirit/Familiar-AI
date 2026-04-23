import { create } from 'zustand';
import { useVisionStore } from '../vision/VisionStore';

export const useContextStore = create((set, get) => ({
    activeApp: null,
    activeTitle: null,
    activeUrl: null,
    lastUpdate: 0,

    // Awareness State
    awarenessEnabled: false,
    focusMode: { active: false, goal: null, endTime: null, threadId: null },

    // Intent Resolution State
    currentIntent: 'explain', // 'explain' | 'assist' | 'act' | 'clarify'

    // Shared Context (Snapshot)
    sharedContext: null, // { app, title, url, screenshotTimestamp }

    // Strategic Plan State
    activePlan: null,    // { goal, steps: [] }
    planProgress: {      // { currentStepIndex: 0, completedSteps: [], skippedSteps: [] }
        currentStepIndex: 0,
        completedSteps: [],
        skippedSteps: []
    },

    // Actions
    setLiveContext: (data) => set({
        activeApp: data.app,
        activeTitle: data.title,
        activeUrl: data.url,
        lastUpdate: Date.now()
    }),

    toggleAwareness: (enabled) => {
        set({ awarenessEnabled: enabled });
        if (enabled) window.electronAPI.send('start-awareness');
        else window.electronAPI.send('stop-awareness');
    },

    suspendAwareness: () => {
        // Force stop. Checking local 'awarenessEnabled' is unreliable if VisionStore controls the flag.
        // Even if not running, sending 'stop-awareness' is safe and ensures no polling occurs during drag.
        window.electronAPI.send('stop-awareness');
    },

    resumeAwareness: () => {
        // Restart polling if 'awarenessEnabled' is true
        if (get().awarenessEnabled) {
            window.electronAPI.send('start-awareness');
        }
    },

    setIntent: (intent) => set({ currentIntent: intent }),

    setFocusMode: (goal, durationMinutes, threadId) => set({
        focusMode: {
            active: true,
            goal,
            endTime: Date.now() + (durationMinutes * 60000),
            threadId
        }
    }),

    clearFocusMode: () => set({
        focusMode: { active: false, goal: null, endTime: null, threadId: null }
    }),

    captureContext: async () => {
        const visionStore = useVisionStore.getState();
        const result = await visionStore.captureNow(); // { screenshot, metadata } | null

        if (!result) {
            console.warn("[ContextStore] Capture failed or blocked by VisionStore.");
            return null;
        }

        const { screenshot, metadata } = result;

        // Atomically update live state from the capture — never stale after a manual capture
        if (metadata.app !== null) {
            set({ activeApp: metadata.app, activeTitle: metadata.title, activeUrl: metadata.url });
        }

        const state = get();
        const snapshot = {
            app: metadata.app ?? state.activeApp,
            title: metadata.title ?? state.activeTitle,
            url: metadata.url ?? state.activeUrl,
            timestamp: Date.now(),
            screenshot
        };

        set({ sharedContext: snapshot });
        return snapshot;
    },

    setSharedContext: (ctx) => set({ sharedContext: ctx }),
    clearContext: () => set({ sharedContext: null }),

    // Plan Actions
    setActivePlan: (plan) => set({
        activePlan: plan,
        planProgress: { currentStepIndex: 0, completedSteps: [], skippedSteps: [] }
    }),

    advancePlanStep: (status = 'completed') => set((state) => {
        if (!state.activePlan) return state;

        const currentIndex = state.planProgress.currentStepIndex;
        const newProgress = { ...state.planProgress };

        if (status === 'completed') newProgress.completedSteps.push(currentIndex);
        else if (status === 'skipped') newProgress.skippedSteps.push(currentIndex);

        return {
            planProgress: {
                ...newProgress,
                currentStepIndex: currentIndex + 1
            }
        };
    }),

    clearPlan: () => set({
        activePlan: null,
        planProgress: { currentStepIndex: 0, completedSteps: [], skippedSteps: [] }
    }),

    // Hook for initialization (call in App.jsx)
    init: () => {
        if (window.electronAPI && window.electronAPI.onContextUpdate) {
            window.electronAPI.onContextUpdate((data) => {
                get().setLiveContext(data);
            });
        }
    }
}));
