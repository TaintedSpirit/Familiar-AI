import { toolRegistry } from './ToolRegistry';
import { toolExecutor } from './ToolExecutor';
import { toolGuardrailController } from './ToolGuardrailController';

const MAX_ITERATIONS = 15;

const FAST_PATH_PATTERNS = [
    /^(run|start|execute|begin)\s+(the\s+)?(workflow|sequence|graph)/i,
    /^(start|create|open|new|track)\s*(?:a\s+)?(?:new\s+)?thread/i,
    /^(keep\s+track\s+of\s+this)/i,
    /^(clear|wipe|delete|reset|empty)\s+(the\s+)?(workflow|sequence|graph|nodes|canvas)/i,
];

class AgentLoop {
    async run(prompt, conversationHistory, { onStep, onChunk, maxIterations, blockedTools, depth = 0, sandboxId = null } = {}) {
        const { llmRouter } = await import('../llm/Router');
        const limit = maxIterations ?? MAX_ITERATIONS;
        const blocked = blockedTools ?? new Set();

        if (FAST_PATH_PATTERNS.some(p => p.test(prompt.trim()))) {
            return llmRouter.query(prompt, conversationHistory, onChunk);
        }

        const tools = toolRegistry.getAll();

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

        try {
            const { compactIfNeeded } = await import('../memory2/CompactionService');
            onStep?.({ type: 'compacting', active: true });
            messages = await compactIfNeeded(messages);
            onStep?.({ type: 'compacting', active: false });
        } catch { /* non-fatal */ }

        toolGuardrailController.resetForTurn();

        for (let i = 0; i < limit; i++) {
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
                    // Depth-enforced blocked tools (e.g. sub-agents can't spawn sub-agents)
                    if (blocked.has(call.name)) {
                        onStep?.({ type: 'tool_result', name: call.name, result: '[BLOCKED]', id: call.id });
                        messages.push({ role: 'assistant', content: null, toolCalls: [call] });
                        messages.push({
                            role: 'tool',
                            toolCallId: call.id,
                            toolName: call.name,
                            content: `[BLOCKED] Tool "${call.name}" is not available in this agent context.`
                        });
                        continue;
                    }

                    // Guardrail loop detection
                    const guard = toolGuardrailController.beforeCall(call.name, call.args);
                    if (guard.action === 'halt') {
                        console.warn('[AgentLoop] Guardrail HALT:', guard.reason);
                        return { type: 'text', content: `Agent halted: ${guard.reason}`, reply: `Agent halted: ${guard.reason}` };
                    }
                    if (guard.action === 'block') {
                        onStep?.({ type: 'guardrail_block', name: call.name, reason: guard.reason });
                        messages.push({ role: 'assistant', content: null, toolCalls: [call] });
                        messages.push({
                            role: 'tool',
                            toolCallId: call.id,
                            toolName: call.name,
                            content: `[GUARDRAIL] Tool blocked: ${guard.reason}`
                        });
                        continue;
                    }
                    if (guard.action === 'warn') {
                        console.warn('[AgentLoop] Guardrail WARN:', guard.reason);
                        onStep?.({ type: 'guardrail_warn', name: call.name, reason: guard.reason });
                    }

                    onStep?.({ type: 'tool_call', name: call.name, args: call.args, id: call.id });
                    // Sticky sandbox: once forge_create_sandbox returns, subsequent FS ops in this
                    // loop route to that sandbox until forge_destroy_sandbox or loop exit.
                    const result = await toolExecutor.run(call.name, call.args, { sandboxId });
                    if (call.name === 'forge_create_sandbox' && result?.sandboxId) {
                        sandboxId = result.sandboxId;
                        onStep?.({ type: 'sandbox_active', sandboxId });
                    }
                    if (call.name === 'forge_destroy_sandbox' && result?.success && sandboxId === call.args?.sandboxId) {
                        sandboxId = null;
                    }
                    toolGuardrailController.afterCall(call.name, call.args, result, result?.error);
                    onStep?.({ type: 'tool_result', name: call.name, result, id: call.id });

                    messages.push({ role: 'assistant', content: null, toolCalls: [call] });
                    messages.push({
                        role: 'tool',
                        toolCallId: call.id,
                        toolName: call.name,
                        content: typeof result === 'string' ? result : JSON.stringify(result)
                    });
                }
                continue;
            }

            break;
        }

        return { type: 'text', content: 'Task complete.', reply: 'Task complete.' };
    }
}

export const agentLoop = new AgentLoop();
