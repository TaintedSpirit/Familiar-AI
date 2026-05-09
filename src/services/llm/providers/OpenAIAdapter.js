import { BaseAdapter } from "./BaseAdapter";
import { formatForOpenAI } from "../VisionFormatter";
import { useContextStore } from "../../context/ContextStore";
import { useSpeechStore } from "../../voice/SpeechStore";

/**
 * OpenAIAdapter — OpenAI (GPT) provider.
 *
 * Handles: chat completions, function calling, Whisper STT, TTS-1 synthesis.
 *
 * Extracted from Router.js: lines 338-383 (chat), 831-867 (tools),
 * 999-1046 (message converter), 1194-1255 (STT + TTS).
 *
 * BUG FIXES:
 * - Removed trailing space from Authorization header (was `Bearer ${key} `)
 * - Consistent model validation
 */
export class OpenAIAdapter extends BaseAdapter {
    constructor() {
        super('openai');
    }

    isConfigured(settings) {
        return !!settings.openaiApiKey;
    }

    // ── Plain Chat ─────────────────────────────────────────────────────────

    async chat(prompt, contextMessages, systemPrompt, settings, onChunk) {
        const { openaiApiKey, model: selectedModel, temperature } = settings;

        const openAIModel = (selectedModel && selectedModel.includes('gpt')) ? selectedModel : 'gpt-4o';

        const cleanHistory = contextMessages.map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: String(m.content || "")
        }));

        const { sharedContext } = useContextStore.getState();

        const response = await this.fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
                model: openAIModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...cleanHistory,
                    {
                        role: 'user',
                        content: formatForOpenAI(prompt, sharedContext)
                    }
                ],
                temperature: temperature || 0.7,
                max_tokens: 4000,
                stop: ["(Go)", "task_boundary", "thought", "notify_user"]
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(`OpenAI API Error: ${data.error.message} (Model: ${openAIModel})`);
        }

        // Log telemetry if usage exists
        if (data.usage) {
            import("../../telemetry/TelemetryStore").then(module => {
                module.useTelemetryStore.getState().logUsage(
                    'openai', openAIModel, data.usage.prompt_tokens, data.usage.completion_tokens
                );
            }).catch(e => console.error("Telemetry error:", e));
        }

        return data.choices[0].message.content;
    }

    // ── Tool-Use Chat ──────────────────────────────────────────────────────

    async chatWithTools(messages, tools, systemPrompt, settings) {
        const { openaiApiKey, model: selectedModel, temperature } = settings;

        const openAITools = tools.map(t => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.parameters }
        }));

        const { sharedContext } = useContextStore.getState();

        const response = await this.fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
                model: selectedModel?.startsWith('gpt') ? selectedModel : 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...this._toOpenAIMessages(messages, sharedContext)
                ],
                tools: openAITools,
                temperature: temperature || 0.7
            })
        });

        const data = await response.json();
        if (data.error) return { type: 'text', content: `OpenAI Error: ${data.error.message}` };

        if (data.usage) {
            import("../../telemetry/TelemetryStore").then(module => {
                module.useTelemetryStore.getState().logUsage(
                    'openai', selectedModel?.startsWith('gpt') ? selectedModel : 'gpt-4o', data.usage.prompt_tokens, data.usage.completion_tokens
                );
            }).catch(e => console.error("Telemetry error:", e));
        }

        const choice = data.choices[0];
        if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
            const toolCalls = choice.message.tool_calls.map(tc => ({
                id: tc.id,
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments)
            }));
            return { type: 'tool_calls', toolCalls };
        }

        return { type: 'text', content: choice.message.content || '' };
    }

    // ── Speech-to-Text (Whisper) ───────────────────────────────────────────

    async transcribe(audioBlob, settings) {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');
        formData.append('model', 'whisper-1');

        const response = await this.fetchWithTimeout('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${settings.openaiApiKey}` },
            body: formData
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data.text;
    }

    // ── Text-to-Speech (TTS-1) ─────────────────────────────────────────────

    async synthesize(text, settings) {
        const { voiceId } = useSpeechStore.getState();

        const response = await this.fetchWithTimeout('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${settings.openaiApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'tts-1',
                input: text,
                voice: voiceId || 'alloy'
            })
        });

        if (!response.ok) throw new Error("TTS Failed");
        return await response.blob();
    }

    // ── Message format converter ───────────────────────────────────────────

    _toOpenAIMessages(messages, sharedContext) {
        // First pass: convert all messages
        const converted = messages
            .filter(msg => msg.role !== 'system')
            .map((msg, i) => {
                if (msg.role === 'tool') {
                    return {
                        role: 'tool',
                        tool_call_id: msg.toolCallId || `tool_${i}`,
                        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '')
                    };
                }
                if (msg.toolCalls?.length) {
                    return {
                        role: 'assistant',
                        content: null,
                        tool_calls: msg.toolCalls.map(tc => ({
                            id: tc.id, type: 'function',
                            function: { name: tc.name, arguments: JSON.stringify(tc.args) }
                        }))
                    };
                }
                const isLastUser = msg.role === 'user' && !messages.slice(i + 1).some(m => m.role === 'user');
                const content = isLastUser
                    ? formatForOpenAI(msg.content || '', sharedContext)
                    : (msg.content || '');
                return { role: msg.role === 'assistant' ? 'assistant' : 'user', content };
            });

        // Second pass: remove orphaned tool messages
        // OpenAI strictly requires: assistant[tool_calls] → tool → tool → ... pattern
        const sanitized = [];
        for (let i = 0; i < converted.length; i++) {
            const msg = converted[i];
            if (msg.role === 'tool') {
                const prev = sanitized[sanitized.length - 1];
                if (prev?.role === 'assistant' && prev?.tool_calls?.length) {
                    sanitized.push(msg);
                } else {
                    console.warn('[OpenAIAdapter] Dropping orphaned tool message:', msg.tool_call_id);
                }
            } else {
                sanitized.push(msg);
            }
        }
        return sanitized;
    }
}
