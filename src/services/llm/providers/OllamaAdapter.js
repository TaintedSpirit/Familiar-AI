import { BaseAdapter } from "./BaseAdapter";

/**
 * OllamaAdapter — Local inference via Ollama or LM Studio.
 *
 * Supports both the native Ollama chat API and LM Studio's OpenAI-compatible
 * endpoint.  No API key required (local models).
 *
 * Extracted from Router.js lines 385-424.
 */
export class OllamaAdapter extends BaseAdapter {
    /**
     * @param {'ollama'|'lm-studio'} [variant='ollama'] — which local endpoint to target.
     */
    constructor(variant = 'ollama') {
        super(variant);
        this._variant = variant;
    }

    /** Local providers are always "configured" — no keys needed. */
    isConfigured() {
        return true;
    }

    // ── Plain Chat ─────────────────────────────────────────────────────────

    async chat(prompt, contextMessages, systemPrompt, settings, onChunk) {
        const { model: selectedModel, temperature, topP } = settings;

        const isLMStudio = this._variant === 'lm-studio';
        const baseUrl = isLMStudio
            ? 'http://localhost:1234/v1/chat/completions'
            : 'http://localhost:11434/api/chat';

        const messages = [
            { role: 'system', content: systemPrompt },
            ...contextMessages,
            { role: 'user', content: prompt }
        ];

        const body = isLMStudio
            ? {
                model: selectedModel || 'local-model',
                messages,
                temperature: temperature || 0.7
            }
            : {
                model: selectedModel || 'mistral',
                messages,
                stream: false,
                options: {
                    temperature: temperature || 0.7,
                    top_p: topP || 0.95,
                }
            };

        const response = await this.fetchWithTimeout(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();

        if (isLMStudio) {
            return data.choices[0].message.content;
        } else {
            return data.message.content;
        }
    }

    // Tool use not supported for local models
    async chatWithTools(messages, tools, systemPrompt, settings) {
        return { type: 'text', content: 'Tool use requires Anthropic, OpenAI, or Gemini as the active provider.' };
    }
}
