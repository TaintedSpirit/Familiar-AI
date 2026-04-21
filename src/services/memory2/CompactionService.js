/**
 * CompactionService — token-aware conversation history summarization.
 * When message history exceeds 70% of the model's context limit, the oldest
 * 40% of messages are summarized by the LLM and replaced with a system summary block.
 * Tool-call/tool-result pairs are never split.
 */

const TOKEN_LIMIT = 32_000;   // conservative default (most models support ≥32k)
const COMPACT_THRESHOLD = 0.7; // compact when > 70% full
const COMPACT_RATIO = 0.4;     // summarize the oldest 40%

function estimateTokens(messages) {
    let chars = 0;
    for (const m of messages) {
        chars += String(m.content || '').length;
        if (m.toolCalls) chars += JSON.stringify(m.toolCalls).length;
    }
    return Math.ceil(chars / 3.5); // ~3.5 chars per token
}

function findSafeSplitPoint(messages, splitAt) {
    // Don't split in the middle of a tool_call / tool_result pair.
    // Walk backward from splitAt until we find a 'user' message (safe boundary).
    let idx = splitAt;
    while (idx > 0 && messages[idx].role !== 'user') idx--;
    return Math.max(1, idx); // always keep at least 1 message
}

async function summarizeMessages(messages) {
    try {
        const { llmRouter } = await import('../llm/Router');
        const transcript = messages.map(m => {
            if (m.role === 'user') return `User: ${m.content}`;
            if (m.role === 'assistant') return `Assistant: ${m.content || '[tool call]'}`;
            if (m.role === 'tool') return `[Tool result for ${m.toolCallId}]: ${m.content}`;
            return `${m.role}: ${m.content}`;
        }).join('\n');

        const result = await llmRouter.query(
            `Summarize the following conversation history in 3-5 concise bullet points. Preserve all key decisions, facts, and context the agent needs to continue effectively. Do not editorialize.\n\n${transcript}`,
            [],
            null
        );
        return result?.content || result?.speech || transcript.slice(0, 800);
    } catch {
        return '[Conversation history compacted — earlier context summarized.]';
    }
}

export async function compactIfNeeded(messages) {
    const estimated = estimateTokens(messages);
    if (estimated < TOKEN_LIMIT * COMPACT_THRESHOLD) return messages;

    const splitAt = findSafeSplitPoint(messages, Math.floor(messages.length * COMPACT_RATIO));
    if (splitAt < 2) return messages; // not enough history to compact

    const toSummarize = messages.slice(0, splitAt);
    const toKeep = messages.slice(splitAt);

    const summary = await summarizeMessages(toSummarize);
    return [
        { role: 'user', content: `[CONTEXT SUMMARY — earlier conversation compacted]\n${summary}` },
        { role: 'assistant', content: 'Understood. Continuing with the summarized context.' },
        ...toKeep
    ];
}
