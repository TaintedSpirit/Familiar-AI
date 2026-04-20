import { workflowEngine } from './WorkflowEngine';
import { audioEngine } from '../voice/AudioEngine';

const TIERS = {
    CRITICAL: 3, // Immediate: Failures, loops, destructive
    HIGH: 2,     // Max 1/run: Major inefficiencies (>30% wait), redundant retries
    MEDIUM: 1,   // Summary only: Minor improvements
    LOW: 0       // Internal log
};

class WorkflowStrategist {
    constructor() {
        this.history = [];
        this.nodeMetrics = {}; // { nodeId: { durations: [], errors: 0, executionCount: 0 } }
        this.currentRun = this.resetRun();

        this.onInsight = null; // Callback for UI
        this.lastInterventionTime = 0;

        // Listen to engine
        workflowEngine.subscribe((state, event) => this.analyze(state, event));

        this.loadState();
    }

    saveState() {
        if (typeof window === 'undefined') return;
        try {
            // Keep last 50 runs to manage size
            const trimmed = this.history.slice(-50);
            localStorage.setItem('workflow_strategist_history', JSON.stringify(trimmed));
        } catch (e) {
            console.error('[Strategist] Save failed', e);
        }
    }

    loadState() {
        if (typeof window === 'undefined') return;
        try {
            const raw = localStorage.getItem('workflow_strategist_history');
            if (raw) {
                this.history = JSON.parse(raw);
                console.log(`[Strategist] Restored ${this.history.length} run logs.`);
            }
        } catch (e) {
            console.error('[Strategist] Load failed', e);
        }
    }

    resetRun() {
        return {
            startTime: 0,
            interventions: 0,
            buffer: [], // Stores { tier, message }
            steps: [],
            nodeCounts: {}, // For loop detection
            totalWaitTime: 0
        };
    }

    setInsightHandler(callback) {
        this.onInsight = callback;
    }

    analyze(state, event) {
        if (!event) return;
        const { type, nodeId, output, error } = event;
        const now = Date.now();

        if (type === 'WORKFLOW_STARTED') {
            this.currentRun = this.resetRun();
            this.currentRun.startTime = now;
            this.nodeMetrics = {};
        }

        else if (type === 'NODE_STARTED') {
            this.currentRun.steps.push({ nodeId, start: now });

            // Loop Detection (Critical)
            this.currentRun.nodeCounts[nodeId] = (this.currentRun.nodeCounts[nodeId] || 0) + 1;
            if (this.currentRun.nodeCounts[nodeId] > 10) {
                this.assess(TIERS.CRITICAL, `Infinite loop detected at node ${nodeId}. Execution halted recommendation.`);
            }
        }

        else if (type === 'NODE_COMPLETED') {
            const step = this.currentRun.steps.find(s => s.nodeId === nodeId && !s.end);
            if (step) {
                step.end = now;
                const duration = step.end - step.start;
                this.#recordMetric(nodeId, duration, false);

                // Wait Time Analysis
                if (duration > 1000) {
                    this.currentRun.totalWaitTime += duration;
                }

                if (duration > 30000) {
                    this.assess(TIERS.HIGH, "Fixed wait times exceeding 30s. I can optimize this.");
                }
            }
        }

        else if (type === 'NODE_FAILED') {
            this.#recordMetric(nodeId, 0, true);
            this.currentRun.failures = true;
            this.assess(TIERS.CRITICAL, `Critical failure in node ${nodeId}: ${error?.message || 'Unknown error'}.`);
        }

        else if (type === 'NODE_WAITING_INPUT') {
            this.assess(TIERS.CRITICAL, "Approval required to proceed.");
        }

        else if (type === 'NODE_WAITING_TIMER') {
            // Logic for wait
        }

        else if (type === 'WORKFLOW_COMPLETED') {
            this.currentRun.endTime = now;
            this.currentRun.totalDuration = now - this.currentRun.startTime;
            this.history.push({ ...this.currentRun }); // Persist run
            this.saveState();

            this.analyzeTrends(); // Trend analysis
            this.postRunAnalysis();
        }
    }

    assess(tier, message) {
        // 1. Store finding
        this.currentRun.buffer.push({ tier, message, time: Date.now() });

        // 2. Decision Logic
        let shouldSpeak = false;

        if (tier === TIERS.CRITICAL) {
            shouldSpeak = true;
        } else if (tier === TIERS.HIGH) {
            // Max 1 per run
            if (this.currentRun.interventions < 1) {
                shouldSpeak = true;
            }
        }
        // Medium/Low handled in post-run or trend analysis (which calls assess)

        // Special Case: Trend Analysis (Post Run)
        // If we call assess AFTER run, currentRun.interventions might prevent it?
        // We allow ONE post-run insight if explicit trend found?
        // Let's stick to the rule: "One unsolicited intervention per run".
        // If we spoke during run, silence post-run trends?
        // Yes, to be non-intrusive.

        // 3. Execution
        if (shouldSpeak) {
            let category = 'proactive';
            if (tier === TIERS.CRITICAL) category = 'critical';

            this.speak(message, category);
            this.currentRun.interventions++;
            this.lastInterventionTime = Date.now();
        }
    }

    postRunAnalysis() {
        // Collect unsent High/Medium findings
        const pertinent = this.currentRun.buffer.filter(b => b.tier >= TIERS.MEDIUM);

        // Deduplicate
        const unique = [...new Set(pertinent.map(b => b.message))];

        console.log('[Strategist] Post Run Analysis.', {
            interventions: this.currentRun.interventions,
            bufferCount: pertinent.length,
            uniqueMessages: unique
        });

        if (unique.length === 0) return;

        // If we haven't spoken yet (interventions == 0), we can offer ONE summary.
        if (this.currentRun.interventions === 0) {
            // Prioritize Highest Tier
            const sorted = pertinent.sort((a, b) => b.tier - a.tier);
            const best = sorted[0];

            if (best) {
                console.log('[Strategist] Surfacing post-run insight:', best.message);
                this.speak(best.message);
                this.currentRun.interventions++;
            }
        }
    }

    analyzeTrends() {
        const runCount = this.history.length;
        if (runCount < 3) return;

        const last3 = this.history.slice(-3);
        const failures = last3.filter(r => r.failures).length;
        const durations = last3.map(r => r.totalDuration);

        console.log('[Strategist] Analyzing trends over last 3 runs:', durations, 'Failures:', failures);

        // 1. Recurrent Failure
        if (failures === 3) {
            this.assess(TIERS.HIGH, "I've noticed this sequence is hitting a wall lately. We might want to look at the logic together; I'm happy to help diagnose what's sticking.");
            return;
        }

        // 2. Stable Pattern (Template Opportunity)
        const avg = durations.reduce((a, b) => a + b, 0) / 3;
        const isStable = durations.every(d => Math.abs(d - avg) < (avg * 0.3));

        if (failures === 0 && isStable) {
            this.assess(TIERS.MEDIUM, "This workflow is running like clockwork now. Should we save this setup as a template for later?");
        }

        // 3. Latency Optimization
        const currentWaitRatio = this.currentRun.totalWaitTime / this.currentRun.totalDuration;
        if (currentWaitRatio > 0.5 && this.currentRun.totalDuration > 10000) {
            this.assess(TIERS.MEDIUM, "We're spending a lot of time waiting on this one. I can try to tighten up the schedule if you'd like.");
        }
    }

    #recordMetric(nodeId, duration, isError) {
        if (!this.nodeMetrics[nodeId]) {
            this.nodeMetrics[nodeId] = { durations: [], errors: 0 };
        }
        if (isError) {
            this.nodeMetrics[nodeId].errors++;
        } else {
            this.nodeMetrics[nodeId].durations.push(duration);
        }
    }

    speak(text, category = 'proactive') {
        if (this.onInsight) {
            this.onInsight(text);
        }
        audioEngine.speak({
            text,
            category,
            eventId: `strategist_${Date.now()}`
        });
    }
}

export const flowStrategist = new WorkflowStrategist();
