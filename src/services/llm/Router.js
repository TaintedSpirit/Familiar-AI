import { GeminiAdapter } from "./providers/GeminiAdapter";
import { OpenAIAdapter } from "./providers/OpenAIAdapter";
import { AnthropicAdapter } from "./providers/AnthropicAdapter";
import { OllamaAdapter } from "./providers/OllamaAdapter";
import { buildChatPrompt, buildAgentPrompt } from "./SystemPromptBuilder";
import { parseResponse } from "./ResponseParser";
import { matchFastPath, detectIntent } from "./IntentClassifier";
import { useSettingsStore } from "../settings/SettingsStore";
import { useSafetyStore } from "../safety/SafetyStore";
import { useSpeechStore } from "../voice/SpeechStore";
import { ThinkScrubber } from "./ThinkScrubber";

/**
 * LLMRouter — thin orchestrator that delegates all provider-specific work
 * to adapter classes.
 *
 * Public API (unchanged — zero consumer changes needed):
 *   query(prompt, contextMessages, onChunk?)
 *   queryWithTools(messages, tools, onChunk?)
 *   transcribeAudio(audioBlob)
 *   synthesizeAudio(text)
 *
 * Previously 1259 lines. Now ~100. Adding a new provider = one adapter file
 * + one entry in the ADAPTERS map.
 */

const ADAPTERS = {
    gemini:      new GeminiAdapter(),
    openai:      new OpenAIAdapter(),
    anthropic:   new AnthropicAdapter(),
    ollama:      new OllamaAdapter('ollama'),
    'lm-studio': new OllamaAdapter('lm-studio'),
};

export class LLMRouter {
    constructor() {
        // Preserved for backward compat — init() is a no-op.
    }

    async init() {
        // Init logic handled dynamically in query to catch settings updates.
    }

    /**
     * Resolve a provider adapter by ID.
     * @param {string} provider
     * @returns {import("./providers/BaseAdapter").BaseAdapter | null}
     */
    _resolve(provider) {
        return ADAPTERS[provider] || null;
    }

    // ── Plain Chat ─────────────────────────────────────────────────────────

    async query(prompt, contextMessages, onChunk = null, options = {}) {
        try {
            const rawSettings = useSettingsStore.getState();
            const settings = options.modelOverride
                ? { ...rawSettings, model: options.modelOverride.model, aiProvider: options.modelOverride.provider }
                : rawSettings;

            // Fast-path commands (workflows, threads, clear canvas)
            const fast = matchFastPath(prompt);
            if (fast) return fast;

            // Detect intent → select persona
            const intent = detectIntent(prompt, settings.activePersona);

            // Build the full system prompt (gathers all context)
            const { systemPrompt, searchResults, websiteContent } = await buildChatPrompt(prompt, intent);

            // Resolve primary adapter
            const adapter = this._resolve(settings.aiProvider);
            if (!adapter) {
                return { type: 'text', content: `Provider "${settings.aiProvider}" is not configured.` };
            }
            if (!adapter.isConfigured(settings)) {
                return { type: 'text', content: `Please enter your ${settings.aiProvider} API Key in the Settings menu.` };
            }

            // Reset fallback state on fresh call
            settings.setFallbackState?.(false, null);

            // Wrap onChunk to strip <think> reasoning blocks from the UI
            const scrubHandle = ThinkScrubber.wrap(onChunk);
            const scrubbedOnChunk = scrubHandle?.callback ?? null;

            let completion;
            try {
                completion = await adapter.chat(prompt, contextMessages, systemPrompt, settings, scrubbedOnChunk);
            } catch (primaryErr) {
                // Attempt provider fallback on rate-limit / transient errors
                const errMsg = primaryErr?.message || String(primaryErr);
                const isTransient = primaryErr?.status === 429 || primaryErr?.status === 503 ||
                    /429|503|quota|rate.?limit|resource.?exhausted/i.test(errMsg);

                const fallbackAdapter = this._resolve(settings.secondaryAiProvider);
                const canFallback = isTransient && fallbackAdapter?.isConfigured(settings);

                if (canFallback) {
                    console.warn(`[Router] ${settings.aiProvider} unavailable. Falling back to ${settings.secondaryAiProvider}.`);
                    settings.setFallbackState?.(true, `${settings.aiProvider} error — using backup`);
                    useSafetyStore.getState().logExecution('provider_switch', null,
                        `Provider fallback: ${settings.aiProvider} → ${settings.secondaryAiProvider}. Reason: ${errMsg.substring(0, 120)}`, 'applied');
                    completion = await fallbackAdapter.chat(prompt, contextMessages, systemPrompt, settings, scrubbedOnChunk);
                } else {
                    throw primaryErr;
                }
            }
            scrubHandle?.flush?.();

            // Parse and return
            return parseResponse(completion, intent);

        } catch (e) {
            console.error("[Router] Query Fatal Error:", e);
            return {
                type: 'text',
                content: `Error: ${e.message}`,
                speech: "Error."
            };
        }
    }

    // ── Agentic Tool-Use ───────────────────────────────────────────────────

    async queryWithTools(messages, tools, onChunk = null) {
        // Sort tools alphabetically for deterministic prompt-cache hits
        const sortedTools = [...tools].sort((a, b) => a.name.localeCompare(b.name));

        const settings = useSettingsStore.getState();

        // Build agent system prompt
        const systemPrompt = await buildAgentPrompt(settings);

        // Resolve adapter
        const adapter = this._resolve(settings.aiProvider);
        if (!adapter) {
            return { type: 'text', content: 'Tool use requires a configured provider.' };
        }
        if (!adapter.isConfigured(settings)) {
            return { type: 'text', content: `${settings.aiProvider} API key required for agent mode.` };
        }

        return adapter.chatWithTools(messages, sortedTools, systemPrompt, settings);
    }

    // ── Audio Transcription (STT) ──────────────────────────────────────────

    async transcribeAudio(audioBlob) {
        const settings = useSettingsStore.getState();
        const { speechProvider } = useSpeechStore.getState();

        // Try the preferred provider first, then fall through alternatives
        const providerOrder = [speechProvider, 'openai', 'gemini'].filter(Boolean);
        const tried = new Set();

        for (const id of providerOrder) {
            if (tried.has(id)) continue;
            tried.add(id);

            const adapter = this._resolve(id);
            if (!adapter?.isConfigured(settings)) continue;

            try {
                console.log(`[Router] Transcribing via ${id}...`);
                return await adapter.transcribe(audioBlob, settings);
            } catch (err) {
                console.warn(`[Router] Transcription failed (${id}):`, err.message);
                // Continue to next provider
            }
        }

        throw new Error('No transcription provider available. Configure Gemini or OpenAI.');
    }

    // ── Audio Synthesis (TTS) ──────────────────────────────────────────────

    async synthesizeAudio(text) {
        const settings = useSettingsStore.getState();

        // TTS currently only supported via OpenAI
        const adapter = this._resolve('openai');
        if (!adapter?.isConfigured(settings)) {
            console.warn("[Router] No OpenAI Key for TTS");
            return null;
        }

        try {
            return await adapter.synthesize(text, settings);
        } catch (e) {
            console.error("[Router] TTS Error:", e);
            return null;
        }
    }
}

export const llmRouter = new LLMRouter();
