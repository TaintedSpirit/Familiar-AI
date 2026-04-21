class CronEngine {
    constructor() {
        this.jobs = new Map();  // id → { cron, intent, fields, timer }
        this.onFire = null;     // (intent, id) => void — set by consumer
    }

    register(id, cron, intent) {
        this.remove(id);
        const fields = this._parseCron(cron);
        if (!fields) {
            console.warn(`[CronEngine] Invalid cron expression: "${cron}"`);
            return;
        }
        this.jobs.set(id, { cron, intent, fields, timer: null });
        this._schedule(id);
    }

    remove(id) {
        const job = this.jobs.get(id);
        if (job?.timer) clearTimeout(job.timer);
        this.jobs.delete(id);
    }

    list() {
        return Array.from(this.jobs.entries()).map(([id, j]) => ({
            id,
            cron: j.cron,
            intent: j.intent,
        }));
    }

    _schedule(id) {
        const job = this.jobs.get(id);
        if (!job) return;
        const ms = this._nextFireMs(job.fields);
        if (ms === null) return;
        job.timer = setTimeout(() => {
            this.onFire?.(job.intent, id);
            this._schedule(id);  // re-arm
        }, ms);
    }

    _parseCron(cron) {
        const parts = cron.trim().split(/\s+/);
        if (parts.length !== 5) return null;
        const [min, hour, dom, month, dow] = parts;
        return { min, hour, dom, month, dow };
    }

    _nextFireMs(fields) {
        const now = new Date();
        const candidate = new Date(now);
        // Advance to next full minute
        candidate.setSeconds(0, 0);
        candidate.setMinutes(candidate.getMinutes() + 1);

        const MAX_STEPS = 525600; // 1 year in minutes
        for (let i = 0; i < MAX_STEPS; i++) {
            if (
                this._matches(fields.min, candidate.getMinutes()) &&
                this._matches(fields.hour, candidate.getHours()) &&
                this._matches(fields.dom, candidate.getDate()) &&
                this._matches(fields.month, candidate.getMonth() + 1) &&
                this._matches(fields.dow, candidate.getDay())
            ) {
                return candidate.getTime() - now.getTime();
            }
            candidate.setMinutes(candidate.getMinutes() + 1);
        }
        return null;
    }

    _matches(field, value) {
        if (field === '*') return true;
        // Handle lists: "1,2,3"
        if (field.includes(',')) return field.split(',').map(Number).includes(value);
        // Handle ranges: "1-5"
        if (field.includes('-')) {
            const [lo, hi] = field.split('-').map(Number);
            return value >= lo && value <= hi;
        }
        // Handle step: "*/5"
        if (field.startsWith('*/')) {
            const step = parseInt(field.slice(2), 10);
            return value % step === 0;
        }
        return parseInt(field, 10) === value;
    }
}

export const cronEngine = new CronEngine();
