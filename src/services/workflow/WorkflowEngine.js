import { v4 as uuidv4 } from 'uuid';

/**
 * WORKFLOW ENGINE - STATE MACHINE
 * 
 * States: IDLE, RUNNING, PAUSED, WAITING_FOR_INPUT, COMPLETED, FAILED
 * Events: START, NODE_COMPLETE, ERROR, APPROVE, RETRY, STOP
 */
class WorkflowEngine {
    constructor() {
        // Graph Data
        this.nodes = [];
        this.edges = [];

        // Machine State
        this.status = 'idle'; // idle | running | paused | waiting_for_input | waiting_for_timer | completed | failed
        this.memory = {}; // Node outputs: { [nodeId]: { ...data } }
        this.processQueue = []; // Nodes ready to execute
        this.activeNodeId = null; // Currently executing node
        this.error = null;

        // Timer Persistence: { [nodeId]: endTime (ms timestamp) }
        this.timers = {};
        // Active JS Timeouts (not persisted): { [nodeId]: timeoutId }
        this.activeTimeouts = {};

        // Listeners for UI/AI updates
        this.listeners = [];

        // External Dependencies
        this.router = null;

        // Pending code executions awaiting user approval: { [nodeId]: string }
        this.pendingCode = {};

        // Load persist
        this.loadState();
    }

    setRouter(router) {
        this.router = router;
        console.log('[Engine] LLM Router injected.');
    }

    saveState() {
        if (typeof window === 'undefined') return;
        try {
            const state = {
                status: this.status,
                memory: this.memory,
                processQueue: this.processQueue,
                activeNodeId: this.activeNodeId,
                error: this.error ? this.error.message : null,
                nodes: this.nodes,
                edges: this.edges,
                timers: this.timers // Persist end-times
            };
            localStorage.setItem('workflow_engine_state', JSON.stringify(state));
        } catch (e) {
            console.error("[Engine] Failed to save state:", e);
        }
    }

    loadState() {
        if (typeof window === 'undefined') return;
        try {
            const raw = localStorage.getItem('workflow_engine_state');
            if (!raw) return;

            const state = JSON.parse(raw);
            this.status = state.status;
            this.memory = state.memory || {};
            this.processQueue = state.processQueue || [];
            this.activeNodeId = state.activeNodeId;
            this.error = state.error ? new Error(state.error) : null;
            this.nodes = state.nodes || [];
            this.edges = state.edges || [];
            this.timers = state.timers || {};

            // Restore Timers
            Object.entries(this.timers).forEach(([nodeId, endTime]) => {
                const now = Date.now();
                const remaining = endTime - now;
                console.log(`[Engine] Restoring timer for ${nodeId}. Remaining: ${remaining}ms`);

                if (remaining <= 0) {
                    // Expired while offline
                    if (this.status === 'running' || this.status === 'waiting_for_timer') {
                        // We can't resume immediately if constructor isn't done, but usually OK in JS event loop
                        // Safest is to transition to running and let tick pick it up or fire callback
                        // We'll mimic the timeout callback
                        setTimeout(() => this.#handleTimerComplete(nodeId), 100);
                    }
                } else {
                    this.activeTimeouts[nodeId] = setTimeout(() => this.#handleTimerComplete(nodeId), remaining);
                }
            });

            // Safety: If it was running when closed, pause it so it doesn't auto-run unexpectedly on load
            // If it was waiting for timer, it should remain in that state, and the timer restore handles it.
            if (this.status === 'running') {
                this.status = 'paused'; // Pause to allow user to decide to resume
            }
        } catch (e) {
            console.error("[Engine] Failed to load state:", e);
        }
    }

    // --- Public Control Methods ---

    /**
     * Initialize and start a new workflow execution
     */
    start(nodes, edges) {
        this.#reset();
        this.nodes = nodes;
        this.edges = edges;

        // Find Start Nodes (Degree 0)
        const targets = new Set(this.edges.map(e => e.target));
        const startNodes = this.nodes.filter(n => !targets.has(n.id));

        if (startNodes.length === 0) {
            this.#transition('failed', null, new Error("No start nodes found (cyclic or empty graph)."));
            return;
        }

        this.processQueue.push(...startNodes);
        this.#transition('running');
        this.#tick();
    }

    /**
     * Resume execution from PAUSED or WAITING_FOR_INPUT state (APPROVE)
     * @param {any} inputData Data to provide if resuming from a user input state
     */
    resume(inputData = null) {
        if (this.status === 'paused') {
            this.#transition('running');
            this.#tick();
        } else if (this.status === 'waiting_for_input' && this.activeNodeId) {
            console.log(`[Engine] Resuming/Approving node ${this.activeNodeId}`);
            const nodeId = this.activeNodeId;
            this.activeNodeId = null;

            // If a codeExecute node was waiting for approval, run its code now
            if (this.pendingCode[nodeId]) {
                const code = this.pendingCode[nodeId];
                delete this.pendingCode[nodeId];

                const logs = [];
                const sandboxConsole = {
                    log: (...args) => logs.push(args.map(String).join(' ')),
                    error: (...args) => logs.push('[ERR] ' + args.join(' ')),
                    warn: (...args) => logs.push('[WARN] ' + args.join(' '))
                };

                try {
                    const fn = new Function('console', 'input', code);
                    const result = fn(sandboxConsole, inputData);
                    this.#handleNodeSuccess(nodeId, {
                        result: result !== undefined ? result : null,
                        logs,
                        approved: true,
                        timestamp: new Date().toISOString()
                    });
                } catch (e) {
                    this.#transition('failed', nodeId, new Error(`Code Error: ${e.message}`));
                }
                return;
            }

            this.#handleNodeSuccess(nodeId, {
                ...inputData,
                approved: true,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Reject a pending decision
     * @param {string} reason 
     */
    reject(reason = 'User rejected') {
        if (this.status === 'waiting_for_input' && this.activeNodeId) {
            console.log(`[Engine] Rejecting node ${this.activeNodeId}: ${reason}`);
            this.#transition('failed', this.activeNodeId, new Error(`Decision Rejected: ${reason}`));
        }
    }

    pause() {
        if (this.status === 'running') {
            this.#transition('paused');
        }
    }

    stop() {
        this.#transition('idle');
        this.#reset();
    }

    cancel() {
        this.#transition('idle'); // Or 'cancelled' if we had that state, but 'idle' resets
        this.#reset();
    }

    /**
     * Subscribe to state changes
     */
    subscribe(callback) {
        this.listeners.push(callback);
        return () => this.listeners = this.listeners.filter(l => l !== callback);
    }

    /**
     * Get a snapshot of the current state for the UI or AI
     */
    getSnapshot() {
        const activeNode = this.nodes.find(n => n.id === this.activeNodeId);

        let waitInfo = null;
        if (this.status === 'waiting_for_input' && activeNode) {
            waitInfo = { type: 'input', prompt: activeNode.data.prompt || "Approval Needed" };
        } else if (this.status === 'waiting_for_timer' && activeNode && this.timers[activeNode.id]) {
            const msLeft = Math.max(0, this.timers[activeNode.id] - Date.now());
            waitInfo = {
                type: 'timer',
                msLeft,
                endsAt: new Date(this.timers[activeNode.id]).toISOString(),
                desc: `Waiting for ${(msLeft / 1000).toFixed(1)}s`
            };
        }

        return {
            status: this.status,
            activeNodeId: this.activeNodeId,
            waitingContext: waitInfo,
            queueLength: this.processQueue.length,
            results: this.memory,
            error: this.error ? this.error.message : null
        };
    }

    // --- Timer Logic ---

    /**
     * Failsafe: Check for expired timers manually.
     * Useful if setTimeout is throttled by browser backgrounding.
     */
    checkTimers() {
        const now = Date.now();
        Object.entries(this.timers).forEach(([nodeId, endTime]) => {
            if (endTime <= now) {
                console.log(`[Engine] Force-completing expired timer for ${nodeId}`);
                this.#handleTimerComplete(nodeId);
            }
        });
    }

    #startTimer(nodeId, durationMs) {
        const endTime = Date.now() + durationMs;
        this.timers[nodeId] = endTime;
        this.activeTimeouts[nodeId] = setTimeout(() => this.#handleTimerComplete(nodeId), durationMs);

        this.saveState();
        this.#transition('waiting_for_timer', nodeId);
    }

    #handleTimerComplete(nodeId) {
        console.log(`[Engine] Timer complete for ${nodeId}`);
        delete this.timers[nodeId];
        delete this.activeTimeouts[nodeId];

        // Logic to resume
        this.#handleNodeSuccess(nodeId, {
            triggeredAt: new Date().toISOString(),
            timerDetails: "Completed"
        });
    }

    // --- Private Execution Logic ---

    #reset() {
        this.status = 'idle';
        this.memory = {};
        this.processQueue = [];
        this.activeNodeId = null;
        this.error = null;
        this.nodes = [];
        this.edges = [];
        this.timers = {};
        this.activeTimeouts = {};
        this.saveState();
        this.#emitChange();
    }

    async #tick() {
        if (this.status !== 'running') return;

        // Check if done
        if (this.processQueue.length === 0 && !this.activeNodeId) {
            this.#transition('completed');
            return;
        }

        // If busy, wait (Sequential Execution enforcement for now)
        // Multi-threading can be enabled by removing this check, but complicates state.
        if (this.activeNodeId) return;

        const node = this.processQueue.shift();
        if (!node) return;

        this.activeNodeId = node.id;

        // EVENT: NODE STARTED
        this.#emitChange({ type: 'NODE_STARTED', nodeId: node.id });

        try {
            // 1. Resolve Inputs
            const inputs = this.#resolveInputs(node.id);

            // 2. Execute Logic
            await this.#executeNodeLogic(node, inputs);

            // Note: #handleNodeSuccess is called by #executeNodeLogic unless it pauses/waits
        } catch (err) {
            this.#transition('failed', node.id, err);
        }
    }

    #resolveInputs(nodeId) {
        const incomingEdges = this.edges.filter(e => e.target === nodeId);
        const inputs = {};
        incomingEdges.forEach(e => {
            // Merge parent outputs
            const parentData = this.memory[e.source];
            if (parentData) {
                Object.assign(inputs, parentData);
            }
        });
        return inputs;
    }

    async #executeNodeLogic(node, inputData) {
        console.log(`[Engine] Executing ${node.type} (${node.id})`);

        // Special State: Human Approval
        if (node.type === 'humanApproval' || node.type === 'waiting_for_input') {
            this.#transition('waiting_for_input', node.id);
            return; // Stops tick loop. Must be Resumed.
        }

        // Standard Nodes
        let output = {};

        switch (node.type) {
            case 'javascript':
                // Safe-ish Exec
                try {
                    const func = new Function('input', `return (${node.data.code})(input)`);
                    // Assuming code is "input => { ... }" or similar, or just block
                    // Actually let's assume body of function:
                    const funcBody = new Function('input', node.data.code.includes('return') ? node.data.code : `return ${node.data.code}`);
                    output = funcBody(inputData);
                } catch (e) {
                    throw new Error(`JS Error: ${e.message}`);
                }
                break;

            case 'httpRequest':
                const response = await fetch(node.data.url, {
                    method: node.data.method || 'GET',
                    headers: node.data.headers || { 'Content-Type': 'application/json' },
                    body: node.data.method !== 'GET' ? JSON.stringify(node.data.body) : undefined
                });
                output = await response.json();
                break;

            case 'codeExecute': {
                // Substitute {{key}} template vars from inputData
                let rawCode = node.data.code || 'return input;';
                Object.entries(inputData).forEach(([k, v]) => {
                    rawCode = rawCode.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), JSON.stringify(v));
                });

                // Store code and gate on user approval
                this.pendingCode[node.id] = rawCode;
                this.#emitChange({ type: 'CODE_PROPOSAL', nodeId: node.id, code: rawCode, label: node.data.label });
                this.#transition('waiting_for_input', node.id);
                return; // Halts tick — resume() will execute the code
            }

            case 'llmCall':
                // Call actual LLM via Router (if injected via setRouter)
                const promptTemplate = node.data.context || "Analyze this input.";

                // Prepare context for the LLM
                // We stringify the input data to give the LLM something to work with
                const inputContent = JSON.stringify(inputData, null, 2);
                const fullPrompt = `${promptTemplate}\n\nInput Data:\n${inputContent}`;

                console.log(`[Engine] Invoking LLM Node ${node.id}...`);

                if (this.router) {
                    try {
                        // Use the router's query method. 
                        // contextMessages can be minimal or include a system "persona" for the node if defined
                        const result = await this.router.query(fullPrompt, []);

                        // result is expected to be { type: 'text'|'proposal', content: string, ... }
                        const text = typeof result === 'string' ? result : (result.content || '');
                        output = {
                            raw: result,
                            content: text,
                            role: 'assistant',
                            timestamp: Date.now()
                        };
                    } catch (err) {
                        throw new Error(`LLM Execution Failed: ${err.message}`);
                    }
                } else {
                    console.warn("[Engine] No LLM Router injected. Falling back to simulation.");
                    console.log("[Engine] Simulating LLM Call...");
                    await new Promise(r => setTimeout(r, 2000));

                    output = {
                        role: 'assistant',
                        content: `[SIMULATION - NO ROUTER] \nBased on your prompt: "${promptTemplate}", I have processed: ${inputContent.substring(0, 50)}...`,
                        simulated: true
                    };
                }
                break;

            case 'storage':
                const key = node.data.key || 'workflow_data';
                const operation = node.data.operation || 'SET'; // GET | SET

                if (operation === 'GET') {
                    const val = localStorage.getItem(key);
                    try {
                        output = { [key]: JSON.parse(val), raw: val };
                    } catch {
                        output = { [key]: val, raw: val };
                    }
                } else {
                    const valToStore = node.data.value || inputData;
                    localStorage.setItem(key, JSON.stringify(valToStore));
                    output = { success: true, stored: valToStore };
                }
                break;

            case 'trigger':
                output = { ...inputData, triggered: true, timestamp: Date.now() };
                break;

            case 'scheduler':
            case 'wait':
                // Persistent Timer Logic
                const duration = parseInt(node.data.duration) || 5000;
                console.log(`[Engine] Starting timer: ${duration}ms`);
                this.#startTimer(node.id, duration);
                return; // HALT TICK, resume via callback

            default:
                output = { ...inputData, ...node.data };
        }

        this.#handleNodeSuccess(node.id, output);
    }

    #handleNodeSuccess(nodeId, outputData) {
        // 1. Store Result
        this.memory[nodeId] = outputData;

        // EVENT: NODE COMPLETED
        this.#emitChange({ type: 'NODE_COMPLETED', nodeId, output: outputData });

        // 2. Clear Active
        if (this.activeNodeId === nodeId) this.activeNodeId = null;

        // 3. Find Children
        const childrenIds = this.edges
            .filter(e => e.source === nodeId)
            .map(e => e.target);

        // 4. Check Readiness of Children
        // A child is ready if ALL its parents have executed.
        childrenIds.forEach(childId => {
            const parents = this.edges
                .filter(e => e.target === childId)
                .map(e => e.source);

            const allParentsDone = parents.every(pid => this.memory[pid] !== undefined);

            if (allParentsDone) {
                const childNode = this.nodes.find(n => n.id === childId);
                // Prevent duplicates in queue
                if (childNode && !this.processQueue.find(q => q.id === childId)) {
                    this.processQueue.push(childNode);
                }
            }
        });

        this.saveState(); // PERSIST

        // 5. Continue
        if (this.status === 'running') {
            this.#tick();
        } else if (this.status === 'waiting_for_input' || this.status === 'waiting_for_timer') {
            this.#transition('running'); // Auto-resume if we just finished the waiting node
            this.#tick();
        }
    }

    #transition(newStatus, nodeId = null, error = null) {
        console.log(`[Engine] Transition: ${this.status} -> ${newStatus}`);
        const prevStatus = this.status;
        this.status = newStatus;
        if (error) this.error = error;

        this.saveState();

        // Map transitions to events
        let event = { type: 'STATE_CHANGE', from: prevStatus, to: newStatus };

        if (newStatus === 'completed') event = { type: 'WORKFLOW_COMPLETED' };
        if (newStatus === 'failed') event = { type: 'WORKFLOW_FAILED', error: error?.message };
        if (newStatus === 'waiting_for_input') event = { type: 'NODE_WAITING_INPUT', nodeId };
        if (newStatus === 'waiting_for_timer') event = { type: 'NODE_WAITING_TIMER', nodeId };
        if (newStatus === 'running' && prevStatus === 'paused') event = { type: 'WORKFLOW_RESUMED' };

        this.#emitChange(event);
    }

    #emitChange(event = null) {
        const state = this.getSnapshot();
        this.listeners.forEach(cb => cb(state, event));
    }

}

export const workflowEngine = new WorkflowEngine();
