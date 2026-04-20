import { create } from 'zustand';

const FRESHNESS_THRESHOLD = 60 * 1000; // 60 seconds
const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

export const useVisionStore = create((set, get) => ({
    lastCaptureAt: 0,
    lastCaptureSource: null, // 'manual' | 'interval'
    visionSummary: null, // Text description of the screen (from LLM)
    visionStatus: 'none', // 'none' | 'visualizing' | 'live' | 'stale'
    isAwarenessEnabled: true, // Default ON

    // Raw Data (Optional - Keep minimal)
    currentScreenshot: null, // Base64

    // Actions
    toggleAwareness: () => set(s => ({ isAwarenessEnabled: !s.isAwarenessEnabled })),

    setCapture: (screenshot, source = 'manual') => set({
        lastCaptureAt: Date.now(),
        lastCaptureSource: source,
        currentScreenshot: screenshot,
        visionStatus: 'live' // Fresh immediately
    }),

    setStatus: (status) => set({ visionStatus: status }),

    updateFreshness: () => {
        const { lastCaptureAt, visionStatus } = get();
        if (lastCaptureAt === 0) {
            if (visionStatus !== 'none') set({ visionStatus: 'none' });
            return;
        }

        const age = Date.now() - lastCaptureAt;

        if (age <= FRESHNESS_THRESHOLD) {
            if (visionStatus !== 'live') set({ visionStatus: 'live' });
        } else {
            if (visionStatus !== 'stale') set({ visionStatus: 'stale' });
        }
    },

    // Interface with Electron
    captureNow: async () => {
        const { isAwarenessEnabled } = get();
        if (!isAwarenessEnabled) {
            console.warn("[VisionStore] Capture blocked: Awareness disabled.");
            set({ visionStatus: 'none' });
            return null;
        }

        try {
            // Signal "Visualizing" state (e.g. for UI loaders)
            set({ visionStatus: 'visualizing' });

            if (window.electronAPI && window.electronAPI.captureContextSnapshot) {
                const screenshot = await window.electronAPI.captureContextSnapshot();
                get().setCapture(screenshot, 'manual');
                return screenshot;
            }
        } catch (error) {
            console.error("Vision Capture Failed:", error);
            set({ visionStatus: 'stale' }); // Fallback
        }
    },

    // Start a heartbeat to update status
    startHeartbeat: () => {
        const interval = setInterval(() => {
            get().updateFreshness();
        }, 5000); // Check every 5s
        return () => clearInterval(interval);
    }
}));
