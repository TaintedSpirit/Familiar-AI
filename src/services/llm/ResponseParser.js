/**
 * ResponseParser — post-processing of raw LLM completions.
 *
 * Handles hallucination detection, banned pattern sanitization, JSON extraction,
 * structured proposal/plan parsing, and workflow graph detection.
 *
 * Extracted from Router.js lines 17-27 (safeExtractJSON) and 486-625 (parse pipeline).
 */

import { ThinkScrubber } from "./ThinkScrubber";

// ── Safe JSON extraction ───────────────────────────────────────────────────

/**
 * Strip markdown code fences, then extract the first valid JSON object.
 * Never executes code — only parses.
 * @param {string} text
 * @returns {object|null}
 */
function safeExtractJSON(text) {
    const stripped = text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try {
        return JSON.parse(stripped.substring(start, end + 1));
    } catch {
        return null;
    }
}

// ── Hallucination guard ────────────────────────────────────────────────────

const BANNED_PATTERNS = [
    /\(Go\)\.\s*\(Tools\)\./i,
    /notify_user/i,
    /task_boundary/i,
    /Planning Mode/i,
    /run_command/i
];

/**
 * Detect banned patterns (hallucinated tool calls) in raw output.
 * @param {string} text
 * @returns {boolean}
 */
function hasBannedContent(text) {
    return BANNED_PATTERNS.some(p => p.test(text));
}

/**
 * Strip all banned patterns from text.
 * @param {string} text
 * @returns {string}
 */
function sanitize(text) {
    let clean = text;
    BANNED_PATTERNS.forEach(pattern => {
        clean = clean.replace(new RegExp(pattern, 'gi'), '');
    });
    return clean.replace(/\[INTENT:[^\]]+\]/g, '').trim();
}

// ── Main parse pipeline ────────────────────────────────────────────────────

/**
 * Parse a raw LLM completion into a structured response object.
 *
 * Processing order:
 * 1. Strip <think> tags (Reasoning models)
 * 2. Strip [INTENT:...] tags
 * 3. Check for hallucinated tool calls → safe fallback if detected
 * 4. Secondary regex cleanup
 * 5. Check for structured [PROPOSAL] / [PLAN] blocks
 * 6. Check for workflow JSON (graph operations or node definitions)
 * 7. Check for legacy PROPOSAL:/ACTION: markers
 * 8. Return plain text response
 *
 * @param {string} completion — raw completion text from the adapter.
 * @param {string} intent     — detected intent (used for graph routing).
 * @returns {{type: string, content: string, speech: string, data?: object}}
 */
export function parseResponse(completion, intent) {
    let finalDisplay = ThinkScrubber.scrub(completion);
    let finalSpeech = finalDisplay;

    // 1. Clean [INTENT] tags
    finalDisplay = finalDisplay.replace(/\[INTENT:[^\]]+\]/g, '').trim();
    finalSpeech = finalSpeech.replace(/\[INTENT:[^\]]+\]/g, '').trim();

    // 2. Hallucination guard
    if (hasBannedContent(completion)) {
        console.warn("[ResponseParser] Violation detected in output. Falling back to safe response.");
        finalDisplay = "I am focusing on our conversation. How can I help?";
        finalSpeech = finalDisplay;
    } else {
        // use scrubbed version
    }

    // 3. Secondary regex cleanup (belt-and-suspenders)
    finalDisplay = sanitize(finalDisplay);
    finalSpeech = sanitize(finalSpeech);

    // 4. Empty-after-sanitization fallback
    if (!finalDisplay || finalDisplay.length === 0) {
        console.warn("[ResponseParser] Response was empty after sanitization. Using fallback.");
        finalDisplay = "Ready.";
        finalSpeech = "Ready.";
    }

    // 5. Try extracting structured JSON (workflow graph)
    let graphData = null;
    try {
        graphData = safeExtractJSON(completion);
    } catch (e) {
        console.error("[ResponseParser] JSON extraction error:", e);
    }

    if (graphData) {
        if (graphData.operations && Array.isArray(graphData.operations)) {
            return {
                type: 'workflow_edit_proposal',
                content: graphData.summary || "Proposed changes to workflow.",
                data: graphData
            };
        } else if (intent === 'ENGINEER' || graphData.nodes) {
            return {
                type: 'workflow_proposal',
                content: "I have designed a workflow for you.",
                data: graphData
            };
        }
    }

    // 6. Check for structured [PROPOSAL] blocks
    const proposalMatch = completion.match(/\[PROPOSAL\]([\s\S]*?)\[\/PROPOSAL\]/);
    if (proposalMatch) {
        try {
            const proposalData = JSON.parse(proposalMatch[1]);
            return {
                type: 'proposal',
                content: finalDisplay.replace(proposalMatch[0], '').trim(),
                data: proposalData,
                speech: finalSpeech
            };
        } catch (e) {
            console.error("[ResponseParser] Proposal JSON parse error:", e);
        }
    }

    // 7. Check for structured [PLAN] blocks
    const planMatch = completion.match(/\[PLAN\]([\s\S]*?)\[\/PLAN\]/);
    if (planMatch) {
        try {
            const planData = JSON.parse(planMatch[1]);
            return {
                type: 'plan',
                content: finalDisplay.replace(planMatch[0], '').trim(),
                data: planData,
                speech: finalSpeech
            };
        } catch (e) {
            console.error("[ResponseParser] Plan JSON parse error:", e);
        }
    }

    // 8. Legacy proposal markers
    if (completion.includes('PROPOSAL:') || completion.includes('ACTION_REQUEST:') || completion.includes('ACTION:')) {
        return {
            type: 'proposal',
            content: finalDisplay,
            data: { title: "Suggested Action", raw: completion },
            speech: finalSpeech
        };
    }

    // 9. Plain text response
    return {
        type: 'text',
        content: finalDisplay,
        speech: finalSpeech
    };
}
