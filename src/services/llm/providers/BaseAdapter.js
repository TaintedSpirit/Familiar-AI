import { FETCH_TIMEOUT_MS } from "../../constants";

/**
 * BaseAdapter — abstract interface that every LLM provider must implement.
 *
 * Subclasses override only the methods they support.  The Router never touches
 * provider-specific APIs directly — it always goes through this contract.
 */
export class BaseAdapter {
    constructor(id) {
        /** @type {string} Provider identifier, e.g. 'gemini', 'openai'. */
        this.id = id;
    }

    // ── Capability checks ──────────────────────────────────────────────────

    /**
     * @param {object} settings — full settings store snapshot.
     * @returns {boolean} true if this adapter has the credentials it needs.
     */
    isConfigured(settings) {
        throw new Error(`${this.id}: isConfigured() not implemented`);
    }

    // ── Core methods ───────────────────────────────────────────────────────

    /**
     * Plain chat completion.
     * @param {string}   prompt          — the user's latest message.
     * @param {Array}    contextMessages — conversation history.
     * @param {string}   systemPrompt    — fully assembled system prompt.
     * @param {object}   settings        — settings snapshot.
     * @param {Function|null} onChunk    — streaming callback (receives accumulated text).
     * @returns {Promise<string>} The raw completion text.
     */
    async chat(prompt, contextMessages, systemPrompt, settings, onChunk) {
        throw new Error(`${this.id}: chat() not implemented`);
    }

    /**
     * Tool-use / function-calling completion.
     * @param {Array}  messages     — full message thread including tool results.
     * @param {Array}  tools        — sorted tool definitions.
     * @param {string} systemPrompt — fully assembled system prompt.
     * @param {object} settings     — settings snapshot.
     * @returns {Promise<{type: 'text'|'tool_calls', content?: string, toolCalls?: Array}>}
     */
    async chatWithTools(messages, tools, systemPrompt, settings) {
        return { type: 'text', content: `Tool use is not supported by the ${this.id} provider.` };
    }

    /**
     * Speech-to-text transcription.
     * @param {Blob}   audioBlob — audio data.
     * @param {object} settings  — settings snapshot.
     * @returns {Promise<string>} Transcribed text.
     */
    async transcribe(audioBlob, settings) {
        throw new Error(`${this.id}: transcribe() not supported`);
    }

    /**
     * Text-to-speech synthesis.
     * @param {string} text     — text to speak.
     * @param {object} settings — settings snapshot.
     * @returns {Promise<Blob|null>} Audio blob, or null if unsupported.
     */
    async synthesize(text, settings) {
        return null;
    }

    // ── Shared utilities ───────────────────────────────────────────────────

    /**
     * Fetch with automatic timeout and abort.
     * Inherited by all adapters so they don't re-implement this boilerplate.
     */
    fetchWithTimeout(url, options = {}) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        return fetch(url, { ...options, signal: controller.signal })
            .finally(() => clearTimeout(id));
    }
}
