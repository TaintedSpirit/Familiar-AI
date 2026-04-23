import { toolRegistry } from './ToolRegistry';
import { toolExecutor } from './ToolExecutor';

const MAX_ITERATIONS = 15;

// Commands that the existing query() handles via fast-path regex — delegate these directly.
const FAST_PATH_PATTERNS = [
    /^(run|start|execute|begin)\s+(the\s+)?(workflow|sequence|graph)/i,
    /^(start|create|open|new|track)\s*(?:a\s+)?(?:new\s+)?thread/i,
    /^(keep\s+track\s+of\s+this)/i,
    /^(clear|wipe|delete|reset|empty)\s+(the\s+)?(workflow|sequence|graph|nodes|canvas)/i,
];

class AgentLoop {
    async run(prompt, conversationHistory, { onStep, onChunk } = {}) {
        const { llmRouter } = await import('../llm/Router');

        // Delegate fast-path commands to the original query() which handles them via regex
        if (FAST_PATH_PATTERNS.some(p => p.test(prompt.trim()))) {
            return llmRouter.query(prompt, conversationHistory, onChunk);
        }

        const tools = toolRegistry.getAll();

        // Internal message thread for the LLM (separate from UI store)
        let messages = [
            ...conversationHistory
                .map(m => {
                    const mapped = { role: m.role, content: m.content || null };
                    if (m.toolCalls) mapped.toolCalls = m.toolCalls;
                    if (m.toolCallId) mapped.toolCallId = m.toolCallId;
                    if (m.toolName) mapped.toolName = m.toolName;
                    return mapped;
                }),
            { role: 'user', content: prompt }
        ];

        // Compact history if approaching token limits
        try {
            const { compactIfNeeded } = await import('../memory2/CompactionService');
            onStep?.({ type: 'compacting', active: true });
            messages = await compactIfNeeded(messages);
            onStep?.({ type: 'compacting', active: false });
        } catch { /* non-fatal */ }

        for (let i = 0; i < MAX_ITERATIONS; i++) {
            let response;
            try {
                response = await llmRouter.queryWithTools(messages, tools, onChunk);
            } catch (err) {
                console.error('[AgentLoop] queryWithTools error:', err);
                return { type: 'text', content: `Agent error: ${err.message}`, reply: `Agent error: ${err.message}` };
            }

            if (response.type === 'text') {
                return { type: 'text', content: response.content, reply: response.content };
            }

            if (response.type === 'tool_calls' && response.toolCalls?.length) {
                for (const call of response.toolCalls) {
                    onStep?.({ type: 'tool_call', name: call.name, args: call.args, id: call.id });

                    const result = await toolExecutor.run(call.name, call.args);

                    onStep?.({ type: 'tool_result', name: call.name, result, id: call.id });

                    // Append to internal message thread
                    messages.push({
                        role: 'assistant',
                        content: null,
                        toolCalls: [call]
                    });
                    messages.push({
                        role: 'tool',
                        toolCallId: call.id,
                        toolName: call.name,
                        content: typeof result === 'string' ? result : JSON.stringify(result)
                    });
                }
                continue;
            }

            // Unexpected response
            break;
        }

        return {
            type: 'text',
            content: 'Task complete.',
            reply: 'Task complete.'
        };
    }
}

export const agentLoop = new AgentLoop();
