import { memoryClient } from './MemoryClient';

/**
 * Tool definition for exposing memory_search to the LLM via queryWithTools.
 *
 * Two shapes supported:
 *  - OpenAI/Anthropic tool spec via toolSchema
 *  - Google Gemini function-calling via geminiSchema
 *
 * The Router dispatches `memory_search` calls to runMemoryTool({query, limit, types}).
 */

export const memorySearchTool = {
    name: 'memory_search',
    description: 'Search the companion\'s long-term memory (BM25 over markdown entries). Use for user preferences, prior decisions, standing rules, and soul facts. Call BEFORE answering questions about user preferences or past context.',
    parameters: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Freeform search query.' },
            limit: { type: 'integer', description: 'Max results (default 5).' },
            types: {
                type: 'array',
                items: { type: 'string', enum: ['user', 'feedback', 'project', 'reference', 'soul', 'innerworld-rule'] },
                description: 'Filter by memory type. Omit for all.'
            }
        },
        required: ['query']
    }
};

export async function runMemoryTool({ query, limit = 5, types = null }) {
    const result = await memoryClient.search(query, { limit, types });
    return result.hits.map(h => ({
        type: h.type,
        snippet: h.snippet,
        path: h.path,
        score: h.score
    }));
}
