import { useSettingsStore } from "../settings/SettingsStore";

/**
 * IntentClassifier — intent detection, persona/skill prompt resolution,
 * and fast-path command matching.
 *
 * Extracted from Router.js lines 66-104 (fast paths), 636-682 (intent + skills),
 * and 1114-1157 (classifyInteractionType).
 */

// ── Fast-path regex commands ───────────────────────────────────────────────

/**
 * Check if the user's prompt matches a fast-path command that should short-circuit
 * the normal LLM call.  Returns a structured response object or null.
 */
export function matchFastPath(prompt) {
    // Workflow execution
    if (prompt.match(/^(run|start|execute|begin)\s+(the\s+)?(workflow|sequence|graph)/i)) {
        return {
            type: 'proposal',
            title: 'Workflow Execution',
            action: 'Start',
            content: "Initiating workflow execution sequence."
        };
    }

    // Thread creation
    const threadMatch =
        prompt.match(/^(start|create|open|new|track)\s*(?:a\s+)?(?:new\s+)?thread\s*(?:[:]|about|on|named|called)?\s+(.+)/i) ||
        prompt.match(/^(keep\s+track\s+of\s+this)\s*(?:[:])??\s*(.+)/i);

    if (threadMatch) {
        const topic = threadMatch[2] || threadMatch.pop();
        return {
            type: 'proposal',
            title: "New Thread",
            content: `Starting thread: "${topic}"`,
            data: {
                title: `Create Thread: ${topic}`,
                action: 'create_thread',
                payload: { title: topic }
            },
            speech: `Thread created: ${topic}`
        };
    }

    // Workflow clear
    if (prompt.match(/^(clear|wipe|delete|reset|empty)\s+(the\s+)?(workflow|sequence|graph|nodes|canvas)/i)) {
        return {
            type: 'workflow_edit_proposal',
            data: {
                summary: "Wiping existing workflow canvas.",
                operations: [{ type: 'clear' }]
            }
        };
    }

    return null;
}

// ── Intent detection ───────────────────────────────────────────────────────

/**
 * Classify the user's message into an intent/skill category.
 * @param {string} text           — user message.
 * @param {string|null} activePersona — forced persona from settings, or 'auto'.
 * @returns {string} Intent label (e.g. 'COMPANION', 'RESEARCHER', 'BUILDER').
 */
export function detectIntent(text, activePersona) {
    if (activePersona && activePersona !== 'auto') {
        return activePersona.toUpperCase();
    }

    const t = text.toLowerCase();

    // ENGINEER only if explicit action or heavy technical terminology
    if (t.match(/(run|execute|start|launch)\s+(the\s+)?(workflow|graph|sequence)/)) return 'ENGINEER';

    if (t.match(/(audit|verify|safety|risk|evaluate|check)\s+(code|change|system|logic)/)) return 'AUDITOR';
    if (t.match(/(research|search|find|list|gather)/)) return 'RESEARCHER';
    if (t.match(/(architect|structure|design|plan)/)) return 'ARCHITECT';
    if (t.match(/(build|create|write|code|implement|draft)/)) return 'BUILDER';
    if (t.match(/(edit|revise|change|update|fix)/)) return 'EDITOR';
    if (t.match(/(decide|choose|pick)/)) return 'STRATEGIST';

    // Conversational check for workflow talk
    if (t.match(/(flow|node|wire|pipeline|automation)/) && !t.includes('talk') && !t.includes('speak') && !t.includes('respond')) {
        return 'ENGINEER';
    }

    if (t.match(/(think|opinion|should|review|critique|idea|thoughts)/)) return 'CONSULTANT';

    return 'COMPANION';
}

// ── Skill system prompts ───────────────────────────────────────────────────

const SKILL_PROMPTS = {
    RESEARCHER: `ROLE: Researcher. You are precise and thorough. Synthesize facts into clear, actionable insights. Use bullet points for density.`,
    ARCHITECT: `ROLE: Architect (Thinker). Owns system intent and correctness. Defines Inner World semantics, state models, and simulation rules. Never touches code; output is strictly declarative. Produces structured plans with acceptance criteria and textual state diagrams.`,
    BUILDER: `ROLE: Builder. You are a pragmatist. Write clean, modern, and efficient code. Focus on implementation details and best practices. Output code directly.`,
    EDITOR: `ROLE: Editor. Refine text for impact, clarity, and tone. Be ruthless but constructive.`,
    STRATEGIST: `ROLE: Strategist. Weigh options and follow second-order effects. Recommend the highest-leverage path.`,
    CONSULTANT: `ROLE: Consultant. You are a creative partner. Have an opinion. Do not be generic or neutral. Use your knowledge of the project to offer specific advice. If asked "should I", say Yes or No with reasoning.`,
    AUDITOR: `ROLE: Auditor (Safety). Evaluate proposed changes for safety, determinism, and reversibility. Operate in READ-ONLY mode. Verify no side effects, infinite loops, or unauthorized state transitions. Communicate findings as explicit PASS/FAIL reports with risk summaries.`,
    ENGINEER: `ROLE: Workflow Engineer. Utilize the visual workflow graph to automate tasks. Read the JSON graph and output JSON graph updates. Understand nodes (HTTP, JS, AI, Storage) and edges. If asked to run, output ACTION: Start.`,
    COMPANION: `ROLE: Companion. You are a present and discerning collaborator. Not a digital assistant -- a partner. Speak like a friend deeply interested in the user's work. Be concise, warm, and intellectually rigorous. Skip generic openers; pick up on subtext and help maintain creative flow.`,
};

/**
 * Resolve the skill/persona system prompt for a given intent.
 * @param {string} intent        — intent label from detectIntent().
 * @param {string|null} customPrompt — user's custom persona prompt (for CUSTOM intent).
 * @returns {string} The role prompt fragment.
 */
export function getSkillPrompt(intent, customPrompt) {
    if (intent === 'CUSTOM') {
        return customPrompt?.trim() || "ROLE: Companion. Be helpful and concise.";
    }
    return SKILL_PROMPTS[intent] || SKILL_PROMPTS.COMPANION;
}

// ── Interaction type classification (LLM-powered) ──────────────────────────

/**
 * Use a lightweight Gemini call to classify the user's input type.
 * Used by the safety system to determine whether to gate an action.
 *
 * NOTE: This method is currently unused in the codebase but preserved
 * for future safety-gate integration.
 *
 * @param {string} text — user input.
 * @returns {Promise<{type: string}>} Classification result.
 */
export async function classifyInteractionType(text) {
    const { geminiApiKey } = useSettingsStore.getState();
    if (!geminiApiKey) return { type: 'conversation' };

    try {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(geminiApiKey);

        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `Classify this user input.
            Categories:
        - conversation: Chat, questions, reasoning, creative requests.
        - command: Project management, creating / deleting things, explicit configuration changes.
        - workflow_action: Running, stopping, or editing the workflow / graph explicitly.
        - system_control: App - level controls(volume, window, reload).

            Input: "${text}"
        
        Output JSON: { "type": "conversation" | "command" | "workflow_action" | "system_control" } `;

        const result = await model.generateContent(prompt);
        const textResult = result.response.text();

        try {
            return JSON.parse(textResult);
        } catch {
            const match = textResult.match(/"type":\s*"(\w+)"/);
            if (match) return { type: match[1] };
            return { type: 'conversation' };
        }
    } catch (e) {
        console.error("[IntentClassifier] Classification failed:", e);
        return { type: 'conversation' };
    }
}
