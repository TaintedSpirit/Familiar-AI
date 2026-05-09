import { getCheapModel } from '../llm/cheapModel';

const TOKEN_LIMIT = 32_000;
const COMPACT_THRESHOLD = 0.7;
const COMPACT_RATIO = 0.4;
const TAIL_PROTECT = 6;
const MIN_SUMMARY_CHARS = Math.round(500 * 3.5);
const MAX_SUMMARY_CHARS = Math.round(3000 * 3.5);

function estimateTokens(messages) {
    let chars = 0;
    for (const m of messages) {
        chars += String(m.content || '').length;
        if (m.toolCalls) chars += JSON.stringify(m.toolCalls).length;
    }
    return Math.ceil(chars / 3.5);
}

function findSafeSplitPoint(messages, splitAt) {
    let idx = splitAt;
    while (idx > 0 && messages[idx].role !== 'user') idx--;
    return Math.max(1, idx);
}

function pruneToolOutputs(messages) {
    return messages.map(m => {
        if (m.role === 'tool') {
            const len = String(m.content || '').length;
            return { ...m, content: `[tool output omitted — ${len} chars]` };
        }
        if (m.role === 'assistant' && m.toolCalls) {
            return {
                ...m,
                toolCalls: m.toolCalls.map(tc => ({
                    id: tc.id,
                    name: tc.name,
                    argKeys: Object.keys(tc.args ?? {})
                }))
            };
        }
        return m;
    });
}

async function summarizeMessages(messages) {
    try {
        const { llmRouter } = await import('../llm/Router');
        const { useSettingsStore } = await import('../settings/SettingsStore');
        const settings = useSettingsStore.getState();
        const cheap = getCheapModel(settings);

        const pruned = pruneToolOutputs(messages);
        const transcript = pruned.map(m => {
            if (m.role === 'user') return `User: ${m.content}`;
            if (m.role === 'assistant') return `Assistant: ${m.content || '[tool call]'}`;
            if (m.role === 'tool') return `[Tool ${m.toolCallId}]: ${m.content}`;
            return `${m.role}: ${m.content}`;
        }).join('\n');

        const result = await llmRouter.query(
            `Summarize the following conversation history concisely (3-7 bullet points). Preserve all key decisions, facts, tool results, and context the agent needs to continue. Do not editorialize or add commentary.\n\n${transcript}`,
            [],
            null,
            cheap ? { modelOverride: cheap } : {}
        );

        const summary = result?.content || result?.speech || '';
        if (summary.length < MIN_SUMMARY_CHARS) return null; // too sparse — skip
        return summary.slice(0, MAX_SUMMARY_CHARS);
    } catch {
        return null;
    }
}

export async function compactIfNeeded(messages) {
    const estimated = estimateTokens(messages);
    if (estimated < TOKEN_LIMIT * COMPACT_THRESHOLD) return messages;

    const rawSplit = Math.floor(messages.length * COMPACT_RATIO);
    const splitAt = findSafeSplitPoint(messages, Math.min(rawSplit, messages.length - TAIL_PROTECT));
    if (splitAt < 4) return messages;

    const toSummarize = messages.slice(0, splitAt);
    const toKeep = messages.slice(splitAt);

    const summary = await summarizeMessages(toSummarize);
    if (!summary) return messages; // summarization failed or too sparse

    return [
        { role: 'user', content: `[CONTEXT COMPACTION — REFERENCE ONLY]\n${summary}` },
        { role: 'assistant', content: 'Context compaction noted. Treating earlier context as reference material.' },
        ...toKeep
    ];
}
