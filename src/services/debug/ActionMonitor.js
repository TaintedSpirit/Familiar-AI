export const ActionMonitor = {
    state: {
        activeId: null,
        startTime: 0,
        type: 'IDLE', // IDLE, INTENT_RECEIVED, ACTION_STARTED, ACTION_COMMITTED
        lastUpdate: 0
    },

    start(type) {
        const id = Date.now().toString();
        this.state = {
            activeId: id,
            startTime: Date.now(),
            type: 'ACTION_STARTED',
            lastUpdate: Date.now()
        };
        console.log(`[ActionMonitor] STARTED: ${type} (${id})`);
        return id;
    },

    update(status) {
        if (!this.state.activeId) return;
        this.state.type = status;
        this.state.lastUpdate = Date.now();
        console.log(`[ActionMonitor] UPDATE: ${status}`);
    },

    complete() {
        if (!this.state.activeId) return;
        const duration = Date.now() - this.state.startTime;
        console.log(`[ActionMonitor] COMPLETE: ${this.state.type} (${duration}ms)`);
        this.reset();
    },

    fail(reason) {
        if (!this.state.activeId) return;
        console.error(`[ActionMonitor] FAILED: ${reason}`);
        this.reset();
    },

    reset() {
        this.state = {
            activeId: null,
            startTime: 0,
            type: 'IDLE',
            lastUpdate: 0
        };
    },

    // Check if current action is stuck (no updates for N ms)
    isStuck(timeoutMs = 3000) {
        if (!this.state.activeId) return false;
        const delta = Date.now() - this.state.lastUpdate;
        const isStuck = delta > timeoutMs;
        if (isStuck) {
            console.warn(`[ActionMonitor] STUCK DETECTED: ${this.state.type} for ${delta}ms`);
        }
        return isStuck;
    }
};
