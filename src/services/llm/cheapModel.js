/**
 * Returns the cheapest configured model ID + provider for background tasks
 * (compaction, curation, summarization). Prefers fast/cheap models over the
 * user's primary selection.
 */
export function getCheapModel(settings) {
    if (settings?.geminiApiKey) {
        return { provider: 'gemini', model: 'gemini-2.0-flash' };
    }
    if (settings?.openaiApiKey) {
        return { provider: 'openai', model: 'gpt-4o-mini' };
    }
    if (settings?.anthropicApiKey) {
        return { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' };
    }
    return null; // no cheap model available — caller falls back to default
}
