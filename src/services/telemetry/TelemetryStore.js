import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Exact-match pricing per 1M tokens (USD). Exact match is tried first; substring
// heuristic below is the fallback for unknown model IDs.
const PRICING = {
    // OpenAI
    'gpt-4o':                          { in: 5.00,  out: 15.00 },
    'gpt-4o-mini':                     { in: 0.15,  out: 0.60  },
    'gpt-4.1':                         { in: 2.00,  out: 8.00  },
    'o3':                              { in: 10.00, out: 40.00 },
    'o4-mini':                         { in: 1.10,  out: 4.40  },
    // Anthropic
    'claude-sonnet-4-6':               { in: 3.00,  out: 15.00 },
    'claude-opus-4-7':                 { in: 15.00, out: 75.00 },
    'claude-haiku-4-5-20251001':       { in: 0.80,  out: 4.00  },
    'claude-3-5-sonnet-20240620':      { in: 3.00,  out: 15.00 },
    'claude-3-haiku-20240307':         { in: 0.25,  out: 1.25  },
    // Gemini
    'gemini-2.5-pro-preview-05-06':    { in: 1.25,  out: 10.00 },
    'gemini-2.5-flash-preview-05-20':  { in: 0.15,  out: 0.60  },
    'gemini-2.0-flash':                { in: 0.10,  out: 0.40  },
    'gemini-1.5-flash':                { in: 0.075, out: 0.30  },
    'gemini-1.5-pro':                  { in: 3.50,  out: 10.50 },
};

function resolvePricing(provider, model) {
    // 1. Exact match
    if (PRICING[model]) return { key: model, ...PRICING[model] };
    // 2. Substring heuristic fallback
    if (provider === 'gemini') {
        if (model.includes('2.5') && model.includes('pro')) return { key: 'gemini-2.5-pro-preview-05-06', ...PRICING['gemini-2.5-pro-preview-05-06'] };
        if (model.includes('2.5') || model.includes('flash')) return { key: 'gemini-2.5-flash-preview-05-20', ...PRICING['gemini-2.5-flash-preview-05-20'] };
        return { key: 'gemini-1.5-pro', ...PRICING['gemini-1.5-pro'] };
    }
    if (provider === 'anthropic') {
        if (model.includes('opus'))   return { key: 'claude-opus-4-7', ...PRICING['claude-opus-4-7'] };
        if (model.includes('haiku'))  return { key: 'claude-haiku-4-5-20251001', ...PRICING['claude-haiku-4-5-20251001'] };
        return { key: 'claude-sonnet-4-6', ...PRICING['claude-sonnet-4-6'] };
    }
    if (provider === 'openai') {
        if (model.includes('mini'))   return { key: 'gpt-4o-mini', ...PRICING['gpt-4o-mini'] };
        if (model.startsWith('o3'))   return { key: 'o3', ...PRICING['o3'] };
        if (model.startsWith('o4'))   return { key: 'o4-mini', ...PRICING['o4-mini'] };
        return { key: 'gpt-4o', ...PRICING['gpt-4o'] };
    }
    return null;
}

export const useTelemetryStore = create(
    persist(
        (set, get) => ({
            totalTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalCostUSD: 0,
            sessionStartedAt: Date.now(),
            sessionHistory: [],

            logUsage: (provider, model, inputTokens, outputTokens) => {
                const pricing = resolvePricing(provider, model);
                const costModel = pricing?.key ?? model;
                const cost = pricing
                    ? (inputTokens / 1_000_000) * pricing.in + (outputTokens / 1_000_000) * pricing.out
                    : 0;

                set(state => ({
                    inputTokens: state.inputTokens + inputTokens,
                    outputTokens: state.outputTokens + outputTokens,
                    totalTokens: state.totalTokens + inputTokens + outputTokens,
                    totalCostUSD: state.totalCostUSD + cost,
                    sessionHistory: [
                        { timestamp: Date.now(), provider, model: costModel, inputTokens, outputTokens, cost },
                        ...state.sessionHistory
                    ].slice(0, 1000)
                }));
            },

            clearTelemetry: () => set({
                totalTokens: 0,
                inputTokens: 0,
                outputTokens: 0,
                totalCostUSD: 0,
                sessionStartedAt: Date.now(),
                sessionHistory: []
            })
        }),
        {
            name: 'ai-familiar-telemetry'
        }
    )
);
