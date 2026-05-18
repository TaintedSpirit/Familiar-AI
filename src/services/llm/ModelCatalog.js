// Unified model catalog — maps display entries to { aiProvider, model } settings pairs.
// Each entry drives both dropdowns in CommandBar and Grimoire chat.

export const MODEL_CATALOG = [
    // ── Gemini ────────────────────────────────────────────────────────────────
    {
        id: 'gemini-25-pro',
        provider: 'gemini',
        modelId: 'gemini-2.5-pro-preview-05-06',
        label: 'Gemini 2.5 Pro',
        badge: 'New',
        group: 'Gemini',
    },
    {
        id: 'gemini-25-flash',
        provider: 'gemini',
        modelId: 'gemini-2.5-flash-preview-05-20',
        label: 'Gemini 2.5 Flash',
        badge: 'New',
        group: 'Gemini',
    },
    {
        id: 'gemini-20-flash',
        provider: 'gemini',
        modelId: 'gemini-2.0-flash',
        label: 'Gemini 2.0 Flash',
        group: 'Gemini',
    },
    {
        id: 'gemini-15-pro',
        provider: 'gemini',
        modelId: 'gemini-1.5-pro',
        label: 'Gemini 1.5 Pro',
        group: 'Gemini',
    },
    {
        id: 'gemini-15-flash',
        provider: 'gemini',
        modelId: 'gemini-1.5-flash',
        label: 'Gemini 1.5 Flash',
        group: 'Gemini',
    },

    // ── Anthropic ─────────────────────────────────────────────────────────────
    {
        id: 'claude-opus-47',
        provider: 'anthropic',
        modelId: 'claude-opus-4-7',
        label: 'Claude Opus 4.7',
        badge: 'Thinking',
        group: 'Claude',
    },
    {
        id: 'claude-sonnet-46',
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        label: 'Claude Sonnet 4.6',
        badge: 'Thinking',
        group: 'Claude',
    },
    {
        id: 'claude-haiku-45',
        provider: 'anthropic',
        modelId: 'claude-haiku-4-5-20251001',
        label: 'Claude Haiku 4.5',
        group: 'Claude',
    },
    {
        id: 'claude-cli-subscription',
        provider: 'claude-cli',
        modelId: 'claude-cli',
        label: 'Claude (Subscription)',
        badge: 'Subscription',
        group: 'Claude',
    },

    // ── OpenAI ────────────────────────────────────────────────────────────────
    {
        id: 'gpt-41',
        provider: 'openai',
        modelId: 'gpt-4.1',
        label: 'GPT-4.1',
        group: 'OpenAI',
    },
    {
        id: 'gpt-4o',
        provider: 'openai',
        modelId: 'gpt-4o',
        label: 'GPT-4o',
        group: 'OpenAI',
    },
    {
        id: 'gpt-4o-mini',
        provider: 'openai',
        modelId: 'gpt-4o-mini',
        label: 'GPT-4o Mini',
        group: 'OpenAI',
    },
    {
        id: 'o3',
        provider: 'openai',
        modelId: 'o3',
        label: 'o3',
        badge: 'Reasoning',
        group: 'OpenAI',
    },
    {
        id: 'o4-mini',
        provider: 'openai',
        modelId: 'o4-mini',
        label: 'o4 Mini',
        badge: 'Reasoning',
        group: 'OpenAI',
    },

    // ── Local ─────────────────────────────────────────────────────────────────
    {
        id: 'ollama-custom',
        provider: 'ollama',
        modelId: '',        // user fills in via custom input
        label: 'Ollama',
        badge: 'Local',
        group: 'Local',
        custom: true,       // shows a text input for the model name
    },
    {
        id: 'lmstudio-custom',
        provider: 'lm-studio',
        modelId: '',
        label: 'LM Studio',
        badge: 'Local',
        group: 'Local',
        custom: true,
    },
];

// Group entries for rendering
export const MODEL_GROUPS = [...new Set(MODEL_CATALOG.map(m => m.group))];

// Find catalog entry matching current settings (best effort)
export const findCurrentEntry = (aiProvider, modelId) => {
    if (!aiProvider) return null;
    return (
        MODEL_CATALOG.find(m => m.provider === aiProvider && m.modelId === modelId) ??
        MODEL_CATALOG.find(m => m.provider === aiProvider) ??
        null
    );
};

// Short label for the status bar (max ~24 chars)
export const shortLabel = (entry) => {
    if (!entry) return 'No model';
    if (entry.custom) return entry.label;
    return entry.label;
};

export const BADGE_COLORS = {
    New:       { bg: 'rgba(74,127,165,0.2)',  border: 'rgba(74,127,165,0.4)',  text: '#7ab0cc' },
    Thinking:  { bg: 'rgba(148,103,189,0.2)', border: 'rgba(148,103,189,0.4)', text: '#c09fd8' },
    Reasoning: { bg: 'rgba(148,103,189,0.2)', border: 'rgba(148,103,189,0.4)', text: '#c09fd8' },
    Local:     { bg: 'rgba(74,174,74,0.15)',  border: 'rgba(74,174,74,0.35)',  text: '#7dca7d' },
    Subscription: { bg: 'rgba(201,168,76,0.18)', border: 'rgba(201,168,76,0.4)', text: '#d8be7c' },
};
