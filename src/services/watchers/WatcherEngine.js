import { useWatcherStore } from './WatcherStore';
import { useWorkflowStore } from '../workflow/WorkflowStore';

class WatcherEngine {
    constructor() {
        this.intervalId = null;
        this.checkInterval = 5000; // Check every 5s
    }

    start() {
        if (this.intervalId) return;
        this.intervalId = setInterval(() => this.tick(), this.checkInterval);
        console.log("WatcherEngine started.");
    }

    stop() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = null;
    }

    async tick() {
        const { watchers, addNotification } = useWatcherStore.getState();
        const now = Date.now();

        for (const w of watchers) {
            if (!w.enabled) continue;

            // Simple Scheduling
            if (w.schedule === 'interval' && (now - w.lastCheck) < (w.intervalMs || 60000)) continue;

            // Execute Check
            try {
                let triggered = false;
                let message = "";

                if (w.type === 'timer') {
                    if (now >= w.targetTime) {
                        triggered = true;
                        message = `Timer: ${w.name}`;
                        // Disable after one-shot
                        useWatcherStore.getState().toggleWatcher(w.id, false);
                    }
                } else if (w.type === 'workflow') {
                    // Check for failures/loops
                    // Mock logic: assumes WorkflowStore tracks 'status'
                    // For now, just a placeholder
                }

                if (triggered) {
                    addNotification(message, w.priority || 'medium');
                }

                // Update last check
                // We'd update the store here, but creating a new array every tick is expensive.
                // ideally we only update if triggered or significantly delayed.

            } catch (e) {
                console.error(`Watcher ${w.name} failed`, e);
            }
        }
    }
}

export const watcherEngine = new WatcherEngine();
