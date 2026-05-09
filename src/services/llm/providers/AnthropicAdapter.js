import { BaseAdapter } from "./BaseAdapter";
import { formatForAnthropic } from "../VisionFormatter";
import { useContextStore } from "../../context/ContextStore";

/**
 * AnthropicAdapter — Anthropic (Claude) provider.
 *
 * Handles: chat via Messages API, tool-use via tool_use/tool_result blocks.
 *
 * Extracted from Router.js: lines 426-478 (chat), 790-829 (tools),
 * 959-997 (message converter).
 *
 * BUG FIX: The original chat path referenced `anthropicApiKey` without
 * destructuring it from settings (line 427 used an undeclared variable).
 * Now correctly reads from the settings object.
 */
export class AnthropicAdapter extends BaseAdapter {
    constructor() {
        super('anthropic');
    }

    isConfigured(settings) {
        return !!settings.anthropicApiKey;  // FIX: correctly checks the key
    }

    // ── Plain Chat ─────────────────────────────────────────────────────────

    async chat(prompt, contextMessages, systemPrompt, settings, onChunk) {
        const { anthropicApiKey, model: selectedModel, temperature } = settings;

        const cleanHistory = contextMessages.map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: String(m.content || "")
        }));

        const { sharedContext } = useContextStore.getState();

        const response = await this.fetchWithTimeout('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': anthropicApiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: selectedModel || 'claude-3-sonnet-20240229',
                max_tokens: 4096,
                system: systemPrompt,
                messages: [
                    ...cleanHistory,
                    {
                        role: 'user',
                        content: formatForAnthropic(prompt, sharedContext)
                    }
                ],
                temperature: temperature || 0.7
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(`Anthropic Error: ${data.error.message}`);
        }

        if (data.usage) {
            import("../../telemetry/TelemetryStore").then(module => {
                module.useTelemetryStore.getState().logUsage(
                    'anthropic', selectedModel || 'claude-3-sonnet-20240229', data.usage.input_tokens, data.usage.output_tokens
                );
            }).catch(e => console.error("Telemetry error:", e));
        }

        return data.content[0].text;
    }

    // ── Tool-Use Chat ──────────────────────────────────────────────────────

    async chatWithTools(messages, tools, systemPrompt, settings) {
        const { anthropicApiKey, model: selectedModel, temperature } = settings;

        const anthropicTools = tools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters
        }));

        const { sharedContext } = useContextStore.getState();

        const response = await this.fetchWithTimeout('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': anthropicApiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: selectedModel?.startsWith('claude') ? selectedModel : 'claude-sonnet-4-6',
                max_tokens: 4096,
                system: systemPrompt,
                tools: anthropicTools,
                messages: this._toAnthropicMessages(messages, sharedContext),
                temperature: temperature || 0.7
            })
        });

        const data = await response.json();
        if (data.error) return { type: 'text', content: `Anthropic Error: ${data.error.message}` };

        if (data.usage) {
            import("../../telemetry/TelemetryStore").then(module => {
                module.useTelemetryStore.getState().logUsage(
                    'anthropic', selectedModel?.startsWith('claude') ? selectedModel : 'claude-sonnet-4-6', data.usage.input_tokens, data.usage.output_tokens
                );
            }).catch(e => console.error("Telemetry error:", e));
        }

        if (data.stop_reason === 'tool_use') {
            const toolCalls = data.content
                .filter(b => b.type === 'tool_use')
                .map(b => ({ id: b.id, name: b.name, args: b.input }));
            return { type: 'tool_calls', toolCalls };
        }

        const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
        return { type: 'text', content: text };
    }

    // ── Message format converter ───────────────────────────────────────────

    _toAnthropicMessages(messages, sharedContext) {
        const result = [];
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (msg.role === 'system') continue; // Anthropic system is a separate param

            if (msg.role === 'user') {
                // If it's the last user message, attach vision context
                const isLastUser = !messages.slice(i + 1).some(m => m.role === 'user');
                const content = isLastUser
                    ? formatForAnthropic(msg.content || '', sharedContext)
                    : (msg.content || '');
                result.push({ role: 'user', content });
            } else if (msg.role === 'assistant') {
                if (msg.toolCalls?.length) {
                    result.push({
                        role: 'assistant',
                        content: msg.toolCalls.map(tc => ({
                            type: 'tool_use', id: tc.id, name: tc.name, input: tc.args
                        }))
                    });
                } else {
                    result.push({ role: 'assistant', content: msg.content || '' });
                }
            } else if (msg.role === 'tool') {
                // Anthropic requires tool_result to follow an assistant message with tool_use
                const prev = result[result.length - 1];
                const prevHasToolUse = prev?.role === 'assistant' && Array.isArray(prev?.content) && prev.content.some(c => c.type === 'tool_use');
                if (prevHasToolUse) {
                    result.push({
                        role: 'user',
                        content: [{
                            type: 'tool_result',
                            tool_use_id: msg.toolCallId,
                            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '')
                        }]
                    });
                } else {
                    console.warn('[AnthropicAdapter] Dropping orphaned tool result:', msg.toolCallId);
                }
            }
        }
        return result;
    }
}
