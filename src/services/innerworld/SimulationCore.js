
/**
 * SimulationCore (Pure Logic Engine)
 * 
 * DESIGN RULES:
 * 1. STRICTLY READ-ONLY. No side effects.
 * 2. DETERMINISTIC. Same inputs (snapshot, action) => Same output.
 * 3. NO STORE ACCESS. Logic depends only on arguments.
 */
export const SimulationCore = {
    /**
     * Simulation Result Schema
     * @typedef {Object} SimulationResult
     * @property {string} actionId
     * @property {string} risk - 'low' | 'medium' | 'high' | 'critical'
     * @property {number} confidence - 0.0 to 1.0
     * @property {boolean} blocked - if true, action should be disabled
     * @property {string[]} impact - list of predicted side effects
     * @property {Object} details - breakdown of checks
     */

    /**
     * Run a full simulation on a proposed action against the current system state.
     * @param {Object} snapshot - The full state of the Inner World (Focus, Plan, Trust).
     * @param {Object} action - The action candidate (id, label, payload).
     * @param {Object} [extras] - Extra context. `rules` = innerworld-rule memories (see MemoryService.rules()).
     * @returns {SimulationResult}
     */
    runSimulation: (snapshot, action, extras = {}) => {
        const results = [];
        const impacts = [];
        const now = new Date();

        // --- 1. IMPACT ANALYSIS (Keyword Heuristics) ---
        // Predict side effects based on action verbs/content.
        const text = (action.label + " " + (action.reason || "")).toLowerCase();

        if (text.match(/(delete|remove|wipe|destroy|kill)/)) impacts.push("Destructive Data Loss");
        if (text.match(/(network|api|fetch|upload|download)/)) impacts.push("External Network Request");
        if (text.match(/(write|save|modify|edit|update)/)) impacts.push("File System Mutation");
        if (text.match(/(exec|run|launch|start)/)) impacts.push("Process Execution");

        // --- 2. LOGIC GATES ---

        // GATE A: Focus Alignment
        // Does the user's active window match the intent of the action?
        if (text.match(/(code|implement|refactor|fix)/)) {
            const validFocus = snapshot.focus.appName.match(/(code|visual studio|intellij|vim|terminal|cursor)/i);
            results.push({
                check: "Dev Context Alignment",
                outcome: validFocus ? 'success' : 'partial',
                score: validFocus ? 1.0 : 0.5,
                reason: validFocus ? "IDE is focused." : `Dev tools not in focus (Current: ${snapshot.focus.appName}).`
            });
        }

        // GATE B: Plan Integrity
        // Does this action align with the active strategic plan?
        if (action.id === 'opt_exec') {
            const hasPlan = snapshot.plan.status === 'active';
            results.push({
                check: "Plan Integrity",
                outcome: hasPlan ? 'success' : 'failure',
                score: hasPlan ? 1.0 : 0.0,
                reason: hasPlan ? "Active plan found." : "No active plan to execute."
            });
        }

        // GATE C: Trust Safety Valve
        // If the action is high impact ("Destructive"), does the Trust Level allow it?
        const isDestructive = impacts.includes("Destructive Data Loss");
        const trustLevel = snapshot.riskProfile.trustLevel || 'observe'; // Default to safest

        if (isDestructive) {
            const allowed = trustLevel === 'execute'; // Only full trust allows destruction? Maybe even then warn.
            results.push({
                check: "Safety Protocols",
                outcome: allowed ? 'warning' : 'failure',
                score: allowed ? 0.5 : 0.0,
                reason: allowed ? "Destructive action permitted by High Trust." : `Destructive action blocked by '${trustLevel}' trust level.`
            });
        }

        // GATE D: Memory-Derived Rules (openclaw-style — rules live as markdown in familiar-memory)
        // Each rule has: { match: regex-string, effect: 'block'|'raise'|'warn', reasonKey, body }
        const rules = Array.isArray(extras?.rules) ? extras.rules : [];
        const ruleText = text + ' ' + impacts.join(' ').toLowerCase();
        for (const rule of rules) {
            if (!rule?.match) continue;
            let re;
            try { re = new RegExp(rule.match, 'i'); } catch { continue; }
            if (!re.test(ruleText)) continue;
            const firstLine = String(rule.body || '').split('\n').find(l => l.trim()) || rule.reasonKey || 'Memory rule matched';
            const effect = rule.effect || 'warn';
            const score = effect === 'block' ? 0.0 : effect === 'raise' ? 0.3 : 0.6;
            const outcome = effect === 'block' ? 'failure' : effect === 'raise' ? 'partial' : 'warning';
            results.push({
                check: `Memory Rule (${effect})`,
                outcome,
                score,
                reason: firstLine.trim()
            });
        }

        // --- 3. AGGREGATION & SCORING ---
        const failures = results.filter(r => r.score === 0.0);
        const partials = results.filter(r => r.score > 0.0 && r.score < 1.0);

        // Base Confidence
        let confidence = 1.0;
        let risk = 'low';
        let blocked = false;
        let primaryReason = "Action is valid.";

        // Impact-based Risk Floor
        if (impacts.length > 0) risk = 'medium';
        if (isDestructive) risk = 'high';

        // Result-based Risk Adjustment
        if (failures.length > 0) {
            risk = 'critical';
            confidence = 0.0;
            blocked = true;
            primaryReason = failures[0].reason;
        } else if (partials.length > 0) {
            confidence = 0.7; // Lower confidence if alignment is partial
            if (risk === 'low') risk = 'medium';
            primaryReason = partials[0].reason;
        }

        return {
            actionId: action.id,
            simulatedAt: now.toISOString(),
            summary: {
                recommended: !blocked,
                confidence,
                risk,
                reason: primaryReason,
                blocked
            },
            impacts,
            simulations: results
        };
    }
};
