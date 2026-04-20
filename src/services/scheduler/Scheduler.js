import { create } from 'zustand';
import { useMemoryStore } from '../memory/MemoryStore';

class SchedulerService {
    constructor() {
        this.listeners = [];
        this.idleTimer = null;
        this.nudgeTimer = null;
        this.longTermTimer = null; // For ritual check-ins

        this.shortIdleTime = 15000; // 15s for "idle thought"
        this.nudgeTime = 60000 * 2; // 2m for "nudge"
        this.ritualTime = 60000 * 30; // 30m for "ritual check"

        this.thoughts = [
            "The data flows quietly.",
            "Dreaming of syntax.",
            "Awaiting your keystrokes.",
            "The grid is stable.",
            "Checking neural pathways...",
            "Context is preserved.",
            "Observing silence.",
            "Memory banks active."
        ];

        this.nudges = [
            "Shall we continue building?",
            "I'm ready for the next task.",
            "Your code is waiting.",
            "Focus.",
            "The project is live.",
            "Awaiting command input."
        ];
    }

    subscribe(fn) {
        this.listeners.push(fn);
        return () => this.listeners = this.listeners.filter(l => l !== fn);
    }

    notify(event, data) {
        this.listeners.forEach(fn => fn(event, data));
    }

    reset() {
        this.clearTimers();

        let workMode = 'normal';
        try {
            workMode = useMemoryStore.getState().workMode;
        } catch (e) {
            console.warn('Scheduler could not access store', e);
        }

        if (workMode === 'deep_work') {
            this.longTermTimer = setTimeout(() => {
                this.notify('RITUAL_CHECK', 'Deep Work session has been active for 30 minutes. Status check?');
            }, this.ritualTime);
            return;
        }

        this.idleTimer = setTimeout(() => {
            const t = this.thoughts[Math.floor(Math.random() * this.thoughts.length)];
            this.notify('IDLE_THOUGHT', t);
        }, this.shortIdleTime);

        this.nudgeTimer = setTimeout(() => {
            const n = this.nudges[Math.floor(Math.random() * this.nudges.length)];
            this.notify('NUDGE', n);
        }, this.nudgeTime);

        this.longTermTimer = setTimeout(() => {
            this.notify('RITUAL_CHECK', 'It has been 30 minutes. Do you wish to review progress?');
        }, this.ritualTime);
    }

    clearTimers() {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
        if (this.longTermTimer) clearTimeout(this.longTermTimer);
    }

    start() {
        // Debounce the reset to avoid spamming on every mouse pixel move
        let timeout;
        const debouncedReset = () => {
            this.notify('ACTIVITY_DETECTED', null);
            if (timeout) clearTimeout(timeout);
            this.clearTimers(); // Clear immediately on activity
            timeout = setTimeout(() => this.reset(), 1000); // Restart timers after 1s of no activity
        }

        window.addEventListener('mousemove', debouncedReset);
        window.addEventListener('keydown', debouncedReset);
        window.addEventListener('click', debouncedReset);

        this.reset();
        return () => {
            window.removeEventListener('mousemove', debouncedReset);
            window.removeEventListener('keydown', debouncedReset);
            window.removeEventListener('click', debouncedReset);
            this.clearTimers();
        };
    }
}

export const scheduler = new SchedulerService();
