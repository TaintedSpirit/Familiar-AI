import { memoryClient } from './MemoryClient';
import { archiveSession } from './SessionMemoryHook';

/**
 * Bridges the session-scoped Zustand MemoryStore to the long-term file+SQLite layer.
 * Subscribes to store mutations and coalesces writes (5s debounce per project/kind).
 */

const DEBOUNCE_MS = 5000;
let attached = false;
let unsubscribe = null;

const pending = new Map(); // key -> { timer, items: [{text, projectId, kind}] }

function flushKey(key) {
    const bucket = pending.get(key);
    if (!bucket) return;
    pending.delete(key);
    const { items } = bucket;
    if (!items.length) return;
    const { projectId, kind } = items[0];
    const body = items.map(i => i.text).join('\n\n');
    const type = kind === 'decision' ? 'project' : 'reference';
    memoryClient.save({
        type,
        body,
        projectId: projectId || null,
        tags: [kind],
        source: kind
    }).catch(e => console.warn('[MemoryBridge] save failed', e?.message));
}

function queue({ text, projectId, kind }) {
    if (!text || !text.trim()) return;
    const key = `${projectId || 'null'}::${kind}`;
    let bucket = pending.get(key);
    if (!bucket) {
        bucket = { timer: null, items: [] };
        pending.set(key, bucket);
    }
    bucket.items.push({ text, projectId, kind });
    if (bucket.timer) clearTimeout(bucket.timer);
    bucket.timer = setTimeout(() => flushKey(key), DEBOUNCE_MS);
}

function diffLatest(prev, next, projectId, field, kind) {
    const pItems = prev?.find(p => p.id === projectId)?.[field] || [];
    const nItems = next?.find(p => p.id === projectId)?.[field] || [];
    if (nItems.length > pItems.length) {
        const added = nItems.slice(pItems.length);
        for (const item of added) {
            queue({ text: item.text || item.title || '', projectId, kind });
        }
    }
}

export const memoryBridge = {
    attach(useMemoryStore) {
        if (attached || !useMemoryStore) return;
        attached = true;
        let prevState = useMemoryStore.getState();
        unsubscribe = useMemoryStore.subscribe((state) => {
            try {
                const activeId = state.activeProjectId;
                const prevActiveId = prevState.activeProjectId;

                // Session archival: messages cleared (clearMessages called)
                const prevMsgs = prevState.projects?.find(p => p.id === prevActiveId)?.messages || [];
                const nextMsgs = state.projects?.find(p => p.id === activeId)?.messages || [];
                if (activeId === prevActiveId && prevMsgs.length >= 3 && nextMsgs.length === 0) {
                    const proj = prevState.projects?.find(p => p.id === prevActiveId);
                    archiveSession({ messages: prevMsgs, projectName: proj?.name }).catch(() => {});
                }

                // Session archival: project switched with messages present
                if (activeId !== prevActiveId) {
                    const prevProj = prevState.projects?.find(p => p.id === prevActiveId);
                    const prevProjMsgs = prevProj?.messages || [];
                    if (prevProjMsgs.length >= 3) {
                        archiveSession({ messages: prevProjMsgs, projectName: prevProj?.name }).catch(() => {});
                    }
                }

                diffLatest(prevState.projects, state.projects, activeId, 'memory', 'memory');
                diffLatest(prevState.projects, state.projects, activeId, 'keyDecisions', 'decision');
                // Thread creation: detect when threads list grew
                const pThreads = prevState.projects?.find(p => p.id === activeId)?.threads || [];
                const nThreads = state.projects?.find(p => p.id === activeId)?.threads || [];
                if (nThreads.length > pThreads.length) {
                    const added = nThreads.filter(t => !pThreads.find(p => p.id === t.id));
                    for (const t of added) {
                        queue({
                            text: `Thread started: ${t.title || '(untitled)'}${t.summary ? `\n\n${t.summary}` : ''}`,
                            projectId: activeId,
                            kind: 'thread'
                        });
                    }
                }
                prevState = state;
            } catch (e) {
                console.warn('[MemoryBridge] subscribe handler error', e?.message);
            }
        });
    },
    detach() {
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        attached = false;
        for (const [, bucket] of pending) {
            if (bucket.timer) clearTimeout(bucket.timer);
        }
        pending.clear();
    }
};
