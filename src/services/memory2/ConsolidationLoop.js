import { memoryClient } from './MemoryClient';

/**
 * "Dreaming" analog from openclaw — idle-triggered consolidation.
 *
 * Phases:
 *   light: count thread-title mentions in recent messages; promote hot items to project memories.
 *   REM:   cluster entries by tag overlap, emit a 3-bullet synthesis to DREAMS.md.
 *   deep:  once/day after local 02:00, condense DREAMS.md into 5 stable bullets on MEMORY.md.
 *
 * Kept intentionally simple — no LLM calls here. The agent can further refine via memory_search.
 */

const TICK_MS = 15 * 60 * 1000;   // 15 min
const IDLE_MS = 3 * 60 * 1000;    // 3 min since last activity

let ticker = null;
let lastActivityAt = Date.now();
let lastDeepDay = null;

function markActivity() { lastActivityAt = Date.now(); }

function topRepeated(strings, minCount = 3) {
    const counts = new Map();
    for (const s of strings) {
        if (!s) continue;
        const key = String(s).trim().toLowerCase();
        if (!key) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].filter(([, c]) => c >= minCount).sort((a, b) => b[1] - a[1]);
}

async function lightPhase(useMemoryStore) {
    const state = useMemoryStore.getState();
    const project = state.projects.find(p => p.id === state.activeProjectId);
    if (!project) return;
    const recentMessages = (project.messages || []).slice(-80);
    const threadTitles = (project.threads || []).map(t => t.title).filter(Boolean);

    const mentionCounts = [];
    for (const t of threadTitles) {
        const lc = t.toLowerCase();
        const hits = recentMessages.filter(m => (m.text || m.content || '').toLowerCase().includes(lc)).length;
        if (hits >= 3) mentionCounts.push({ title: t, hits });
    }

    for (const { title, hits } of mentionCounts) {
        await memoryClient.save({
            type: 'project',
            projectId: project.id,
            body: `Thread "${title}" has been referenced ${hits}× recently. Promoted to project memory.`,
            tags: ['consolidated', 'light'],
            source: 'consolidation'
        }).catch(() => { });
    }
}

async function remPhase() {
    // Pull recent reference entries; group by overlapping tags; write synthesis to DREAMS.md
    const { items } = await memoryClient.list({ type: 'reference', limit: 40 });
    if (!items || items.length < 3) return;
    const tagBuckets = new Map();
    for (const it of items) {
        for (const tag of (it.tags || [])) {
            if (!tagBuckets.has(tag)) tagBuckets.set(tag, []);
            tagBuckets.get(tag).push(it);
        }
    }
    const hotTags = [...tagBuckets.entries()].filter(([, list]) => list.length >= 3).slice(0, 3);
    if (!hotTags.length) return;

    const lines = [`### Dream ${new Date().toISOString()}`, ''];
    for (const [tag, list] of hotTags) {
        lines.push(`- **${tag}**: ${list.length} recent entries, latest — ${String(list[0].body || '').split('\n')[0].slice(0, 120)}`);
    }
    await memoryClient.save({
        type: 'derived',
        body: lines.join('\n'),
        tags: ['dream', 'consolidation'],
        source: 'consolidation',
        slug: `dream-${Date.now()}`
    }).catch(() => { });
}

async function deepPhase() {
    const now = new Date();
    if (now.getHours() < 2) return;
    const day = now.toISOString().slice(0, 10);
    if (lastDeepDay === day) return;

    const { items } = await memoryClient.list({ type: 'derived', limit: 20 });
    if (!items || !items.length) return;
    const titles = topRepeated(items.flatMap(it => (it.tags || [])), 2).slice(0, 5);
    if (!titles.length) return;

    const body = [
        `## Deep Consolidation ${day}`,
        '',
        ...titles.map(([t, c]) => `- ${t} (${c} occurrences)`)
    ].join('\n');
    await memoryClient.save({
        type: 'reference',
        body,
        tags: ['deep', 'consolidation', 'MEMORY'],
        source: 'consolidation',
        slug: `deep-${day}`
    }).catch(() => { });
    lastDeepDay = day;
}

export const consolidationLoop = {
    start(useMemoryStore) {
        if (ticker) return;
        ticker = setInterval(async () => {
            const idleFor = Date.now() - lastActivityAt;
            if (idleFor < IDLE_MS) return;
            try {
                await lightPhase(useMemoryStore);
                await remPhase();
                await deepPhase();
            } catch (e) {
                console.warn('[consolidationLoop] tick failed', e?.message);
            }
        }, TICK_MS);
    },
    stop() {
        if (ticker) clearInterval(ticker);
        ticker = null;
    },
    markActivity,
    async runOnce(useMemoryStore) {
        await lightPhase(useMemoryStore);
        await remPhase();
        await deepPhase();
    }
};
