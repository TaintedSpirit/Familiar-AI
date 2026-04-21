import { useMemoryStore } from '../memory/MemoryStore';

const QUIET_START = 23; // 11 PM
const QUIET_END = 8;    // 8 AM
const MIN_NUDGE_INTERVAL_MS = 30 * 60 * 1000; // 30 min between nudges

function isQuietHours() {
    const h = new Date().getHours();
    return h >= QUIET_START || h < QUIET_END;
}

class SchedulerService {
    constructor() {
        this.listeners = [];
        this.idleTimer = null;
        this.nudgeTimer = null;
        this.longTermTimer = null;

        this.shortIdleTime = 15000;    // 15s idle thought
        this.nudgeTime = 60000 * 2;   // 2m nudge
        this.ritualTime = 60000 * 30; // 30m ritual

        this._lastNudgedAt = 0; // track last nudge to enforce 30-min recency

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
        // Quiet hours: suppress all proactive messages
        if (isQuietHours()) return;

        // Recency check: don't nudge again within 30 minutes
        if (event === 'NUDGE') {
            if (Date.now() - this._lastNudgedAt < MIN_NUDGE_INTERVAL_MS) return;
            this._lastNudgedAt = Date.now();
        }

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
        let timeout;
        const debouncedReset = () => {
            this.notify('ACTIVITY_DETECTED', null);
            if (timeout) clearTimeout(timeout);
            this.clearTimers();
            timeout = setTimeout(() => this.reset(), 1000);
        };

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
