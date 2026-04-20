import { create } from 'zustand';
import { useMemoryStore } from '../memory/MemoryStore';
import { useContextStore } from '../context/ContextStore';
import { useVisionStore } from '../vision/VisionStore';
import { useFormStore } from '../forms/FormStore';
import { SimulationCore } from './SimulationCore';
import { getCachedRules } from '../memory2/MemoryClient';

// Non-blocking rules cache: kick off a refresh on module load, refresh on memory:changed.
let _latestRules = [];
(async () => {
    try { _latestRules = await getCachedRules(); } catch (_) { }
})();
if (typeof window !== 'undefined' && window.electronAPI?.memory?.onChanged) {
    try {
        window.electronAPI.memory.onChanged(async (payload) => {
            if (payload?.type === 'innerworld-rule' || payload?.op === 'delete') {
                try { _latestRules = await getCachedRules(0); } catch (_) { }
            }
        });
    } catch (_) { /* ignore */ }
}

export const useInnerWorldStore = create((set, get) => ({
    isOpen: false, // Default: Hidden (Inspection Only)

    // Canonical Snapshot (Schema Compliance)
    snapshot: {
        timestamp: new Date().toISOString(),
        focus: { appName: '', windowTitle: '' },
        thread: { id: '', title: '', state: 'inactive' },
        plan: { id: '', title: '', stepIndex: 0, stepCount: 0, status: 'inactive' },
        options: [],
        riskProfile: { level: 'low', reasons: [] },
        thresholds: { decisionRequired: false, riskDetected: false, stallDetected: false, completion: false },
        interventions: [],
        audit: { lastEvents: [] }
    },

    // Public Read-Only Contract (Companion Interface)
    publicState: {
        focus: { active: false, title: '' },
        mode: 'observe', // observe | assist | execute
        risk: 'low', // low | medium | high
        simulation: 'idle', // idle | running | complete
        blocked: false,
        allowedCommands: ['open inner world', 'explain', 'show reasoning'] // Default Whitelist
    },

    // Inner World Settings (View & permission View)
    settings: {
        hoverMenu: { enabled: true, delay: 350, style: 'minimal' }, // 200-800ms
        output: { microLanguage: false, visualSignals: true },
        permissions: { explain: true, showSimulation: true, showRisk: true },
        executionGate: { confirmationRequired: true }
    },

    setOpen: (isOpen) => {
        console.log(`[InnerWorldStore] setOpen called with: ${isOpen}`);
        set({ isOpen });
    },

    updateSettings: (partial) => set(s => ({ settings: { ...s.settings, ...partial } })),

    // THE BRAIN: Deterministic Evaluation Loop
    evaluate: () => {
        try {
            const now = new Date();
            const context = useContextStore.getState();
            const memory = useMemoryStore.getState();
            // const vision = useVisionStore.getState();
            const form = useFormStore.getState();

            const activeProject = memory.getActiveProject();
            const activePlan = context.activePlan;

            // 1. Focus & Data Prep
            // Priority: Active Plan > Active Thread (ID Check) > Window Focus
            let focusSource = 'SYSTEM';
            let focusTitle = context.activeTitle || 'None';
            let focusSubtitle = context.activeApp || 'Idle';

            // Resolve Active Thread via ID (Single Source of Truth) OR fallback to status
            // Note: activeProject.activeThreadId is the canonical source now.
            let activeThread = null;
            if (activeProject?.activeThreadId) {
                activeThread = activeProject.threads.find(t => t.id === activeProject.activeThreadId);
            }
            if (!activeThread) {
                activeThread = activeProject?.threads?.find(t => t.status === 'active') || null;
            }

            if (activePlan) {
                focusSource = 'PLAN';
                focusTitle = activePlan.goal;
                focusSubtitle = `Executing Step ${context.planProgress.currentStepIndex + 1}`;
            } else if (activeThread) {
                focusSource = 'THREAD';
                focusTitle = activeThread.title;
                focusSubtitle = "Active Session";
            }

            const focus = {
                appName: focusSubtitle,
                windowTitle: focusTitle,
                source: focusSource
            };


            const threadData = {
                id: activeThread?.id || 'none',
                title: activeThread?.title || 'No Active Thread',
                state: activeThread ? 'active' : 'inactive'
            };

            const planData = {
                id: activePlan ? 'current-plan' : 'none',
                title: activePlan?.goal || 'No Active Plan',
                stepIndex: context.planProgress.currentStepIndex,
                stepCount: activePlan?.steps?.length || 0,
                status: activePlan ? 'active' : 'inactive'
            };

            // 2. Risk Context
            let riskLevel = 'low';
            let riskReasons = [];
            const trustLevel = activeProject?.trustLevel || 'observe';

            // 3. Raw Option Generation
            const rawOptions = [];
            if (!activePlan) {
                rawOptions.push({ id: 'opt_plan', label: 'Draft Strategic Plan', reason: 'No guiding structure active.' });
                rawOptions.push({ id: 'opt_explore', label: 'Explore/Research', reason: 'Gather context.' });
            } else {
                rawOptions.push({ id: 'opt_exec', label: `Execute Step ${context.planProgress.currentStepIndex + 1}`, reason: 'Progress current plan.' });
                rawOptions.push({ id: 'opt_skip', label: 'Skip Step', reason: 'Bypass blocker.' });
                rawOptions.push({ id: 'opt_pivot', label: 'Pivot/Refactor Plan', reason: 'Change strategy.' });
            }
            // Test destructive case
            // rawOptions.push({ id: 'opt_nuke', label: 'Delete All Files', reason: 'Testing purposes.' });

            // 4. SIMULATION LOOP (Read-Only/Deterministic)
            // Pass essential state needed for logic gates
            const simulationContext = {
                focus,
                plan: planData,
                riskProfile: { trustLevel }
            };

            const validatedOptions = rawOptions.map(opt => {
                const result = SimulationCore.runSimulation(simulationContext, opt, { rules: _latestRules });
                return {
                    ...opt,
                    risk: result.summary.risk,
                    confidence: result.summary.confidence,
                    blocked: result.summary.blocked,
                    impact: result.impacts, // Exposing impacts to UI
                    simulation: result
                };
            });

            // 5. Final Aggregation
            const options = validatedOptions.sort((a, b) => b.confidence - a.confidence);

            // Aggregate Risk from Top Options
            if (options[0]?.risk === 'critical' || options[0]?.risk === 'high') {
                riskLevel = options[0].risk;
                riskReasons.push(`Top action '${options[0].label}' is ${riskLevel} risk: ${options[0].simulation.summary.reason}`);
            } else if (options.some(o => o.risk === 'high')) {
                riskLevel = 'medium'; // Warn if high risk exists but isn't top
                riskReasons.push("High risk alternatives detected.");
            }

            // 6. Interventions
            const thresholds = {
                decisionRequired: options.length > 0 && !context.currentIntent,
                riskDetected: riskLevel === 'high' || riskLevel === 'critical',
                stallDetected: false,
                completion: activePlan && context.planProgress.currentStepIndex >= activePlan.steps.length
            };

            const interventions = [];
            if (thresholds.riskDetected) {
                interventions.push({ type: 'warning', text: 'Critical Risk: Action blocked.', priority: 'critical' });
            }
            if (thresholds.completion) {
                interventions.push({ type: 'confirm', text: 'Plan complete. Close thread?', priority: 'conversation' });
            }

            const events = get().snapshot.audit.lastEvents;
            // 5. Update Snapshot & Public Contract
            const newSnapshot = {
                timestamp: now.toISOString(),
                focus: focus,
                thread: threadData,
                plan: planData,
                options: options, // Use validated options
                riskProfile: { level: riskLevel, reasons: riskReasons },
                thresholds: {
                    decisionRequired: thresholds.decisionRequired,
                    riskDetected: thresholds.riskDetected,
                    stallDetected: thresholds.stallDetected,
                    completion: thresholds.completion
                },
                interventions: interventions, // Use the newly generated interventions
                audit: { lastEvents: events } // Use the existing events
            };

            // Derive Public Contract (Companion View)
            const publicState = {
                focus: { active: focus.windowTitle !== 'None', title: focus.windowTitle },
                mode: trustLevel === 'autonomous' ? 'execute' : (trustLevel === 'assist' ? 'assist' : 'observe'),
                risk: riskLevel, // 'low' | 'medium' | 'high'
                simulation: thresholds.decisionRequired ? 'running' : 'idle', // Simplified mapping
                blocked: riskLevel === 'high' || riskLevel === 'critical', // High risk blocks execution
                allowedCommands: ['open inner world', 'explain', 'show reasoning'] // Whitelist base
            };

            set({
                snapshot: newSnapshot,
                publicState: publicState
            });

            // Auto-Open if Decision Required (Optional? User said "Panel subordinated")
            // if (decisionRequired && !get().isOpen) set({ isOpen: true });

        } catch (error) {
            console.error("[InnerWorldSTore] Evaluate Fatal Error:", error);
        }
    },

    getSnapshot: () => get().snapshot,

    // Helper for adding audit events
    logEvent: (type) => {
        const events = [{ type, at: new Date().toISOString() }, ...get().snapshot.audit.lastEvents].slice(0, 10);
        set(state => ({
            snapshot: {
                ...state.snapshot,
                audit: { lastEvents: events }
            }
        }));
    }
}));
