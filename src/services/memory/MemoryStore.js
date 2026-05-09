import { create } from 'zustand';
import { persist } from 'zustand/middleware';
// import { useInnerWorldStore } from '../innerworld/InnerWorldStore'; // Removed to break circular dependency

// Long-term memory bridge: mirrors key events into the markdown+SQLite layer.
let _bridgeAttached = false;
async function attachBridge(store) {
    if (_bridgeAttached) return;
    _bridgeAttached = true;
    try {
        const { memoryBridge } = await import('../memory2/MemoryBridge');
        memoryBridge.attach(store);
    } catch (e) {
        console.warn('[MemoryStore] bridge attach failed:', e?.message);
    }
}

function makeGeneralThread(projectId, existingMessages = []) {
    return {
        id: `thread_general_${projectId}`,
        title: 'General',
        messages: existingMessages,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
    };
}

function getActiveThread(state) {
    const proj = state.projects.find(p => p.id === state.activeProjectId);
    if (!proj) return null;
    return proj.chatThreads?.find(t => t.id === proj.activeChatThreadId) ?? proj.chatThreads?.[0] ?? null;
}

export const useMemoryStore = create(persist((set, get) => ({
    projects: [
        {
            id: 'default',
            name: 'Living Desktop Companion',
            created: Date.now(),
            messages: [], // legacy compat — no longer written to
            chatThreads: [makeGeneralThread('default')],
            activeChatThreadId: 'thread_general_default',
            memory: [],
            keyDecisions: [],
            artifacts: [],
            threads: [], // { id, title, origin, status, lastActivityAt, summary } — agent task threads
            activeVoiceId: null, // Overrides global setting if set
            trustLevel: 'observe' // 'observe' | 'assist' | 'execute'
        }
    ],
    activeProjectId: 'default',
    workMode: 'normal', // 'normal' | 'deep_work'

    // Selectors helpers
    getActiveProject: () => {
        const state = get();
        return state.projects.find(p => p.id === state.activeProjectId);
    },

    // Actions
    createProject: (name) => set((state) => {
        const newId = Date.now().toString();
        const generalThread = makeGeneralThread(newId);
        return {
            projects: [...state.projects, {
                id: newId,
                name,
                created: Date.now(),
                messages: [],
                chatThreads: [generalThread],
                activeChatThreadId: generalThread.id,
                memory: [],
                keyDecisions: [],
                artifacts: [],
                threads: [],
            }],
            activeProjectId: newId
        };
    }),

    setWorkMode: (mode) => set({ workMode: mode }),

    switchProject: (projectId) => set({ activeProjectId: projectId }),

    updateProject: (projectId, updates) => set((state) => ({
        projects: state.projects.map(p => p.id === projectId ? { ...p, ...updates } : p)
    })),

    deleteProject: (projectId) => set((state) => {
        // Prevent deleting the last project
        if (state.projects.length <= 1) return state;

        const newProjects = state.projects.filter(p => p.id !== projectId);
        // If we deleted the active project, switch to the first one available
        let newActive = state.activeProjectId;
        if (state.activeProjectId === projectId) {
            newActive = newProjects[0].id;
        }

        return {
            projects: newProjects,
            activeProjectId: newActive
        };
    }),

    // Transient streaming state (not persisted)
    streamingText: null,
    setStreamingText: (text) => set({ streamingText: text }),
    clearStreamingText: () => set({ streamingText: null }),

    // ── Chat Thread Management ─────────────────────────────────────────────────

    addChatThread: (title) => set((state) => {
        const newId = `thread_${Date.now()}`;
        const newThread = {
            id: newId,
            title: title || 'New Chapter',
            messages: [],
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
        };
        return {
            projects: state.projects.map(p => p.id === state.activeProjectId ? {
                ...p,
                chatThreads: [...(p.chatThreads || []), newThread],
                activeChatThreadId: newId,
            } : p)
        };
    }),

    switchChatThread: (threadId) => set((state) => ({
        projects: state.projects.map(p => p.id === state.activeProjectId ?
            { ...p, activeChatThreadId: threadId } : p
        )
    })),

    deleteChatThread: (threadId) => set((state) => {
        const proj = state.projects.find(p => p.id === state.activeProjectId);
        if (!proj || (proj.chatThreads || []).length <= 1) return state; // guard: keep last thread
        const remaining = (proj.chatThreads || []).filter(t => t.id !== threadId);
        const newActiveId = proj.activeChatThreadId === threadId ? remaining[0].id : proj.activeChatThreadId;
        return {
            projects: state.projects.map(p => p.id === state.activeProjectId ? {
                ...p,
                chatThreads: remaining,
                activeChatThreadId: newActiveId,
            } : p)
        };
    }),

    renameChatThread: (threadId, newTitle) => set((state) => ({
        projects: state.projects.map(p => p.id === state.activeProjectId ? {
            ...p,
            chatThreads: (p.chatThreads || []).map(t => t.id === threadId ? { ...t, title: newTitle } : t),
        } : p)
    })),

    // Active Project Data Mutators
    addMessage: (msg) => set((state) => ({
        projects: state.projects.map(p => {
            if (p.id !== state.activeProjectId) return p;
            const threadId = p.activeChatThreadId;
            return {
                ...p,
                chatThreads: (p.chatThreads || []).map(t => t.id === threadId
                    ? { ...t, messages: [...t.messages, msg], lastActivityAt: Date.now() }
                    : t
                )
            };
        })
    })),

    updateMessage: (id, updates) => set((state) => ({
        projects: state.projects.map(p => {
            if (p.id !== state.activeProjectId) return p;
            const threadId = p.activeChatThreadId;
            return {
                ...p,
                chatThreads: (p.chatThreads || []).map(t => t.id === threadId
                    ? { ...t, messages: t.messages.map(m => m.id === id ? { ...m, ...updates } : m) }
                    : t
                )
            };
        })
    })),

    clearMessages: () => set((state) => ({
        projects: state.projects.map(p => {
            if (p.id !== state.activeProjectId) return p;
            const threadId = p.activeChatThreadId;
            return {
                ...p,
                chatThreads: (p.chatThreads || []).map(t => t.id === threadId
                    ? { ...t, messages: [], lastActivityAt: Date.now() }
                    : t
                )
            };
        })
    })),

    addMemory: (text) => set((state) => ({
        projects: state.projects.map(p => p.id === state.activeProjectId ?
            { ...p, memory: [...p.memory, { id: Date.now(), text, timestamp: new Date() }] } : p
        )
    })),

    addDecision: (decision) => set((state) => ({
        projects: state.projects.map(p => p.id === state.activeProjectId ?
            { ...p, keyDecisions: [...p.keyDecisions, { id: Date.now(), text: decision }] } : p
        )
    })),

    addArtifact: (artifact) => set((state) => ({
        projects: state.projects.map(p => p.id === state.activeProjectId ?
            { ...p, artifacts: [...p.artifacts, { id: Date.now(), ...artifact }] } : p
        )
    })),

    updateArtifact: (artifactId, content) => set((state) => ({
        projects: state.projects.map(p => {
            if (p.id !== state.activeProjectId) return p;
            return {
                ...p,
                artifacts: p.artifacts.map(a => a.id === artifactId ? { ...a, content } : a)
            };
        })
    })),

    setProjectTrustLevel: (level) => set((state) => ({
        projects: state.projects.map(p => p.id === state.activeProjectId ?
            { ...p, trustLevel: level } : p
        )
    })),

    // Thread Management
    addThread: (thread) => {
        const newThreadId = Date.now().toString();
        set((state) => ({
            projects: state.projects.map(p => p.id === state.activeProjectId ?
                {
                    ...p,
                    activeThreadId: newThreadId,
                    threads: [{ id: newThreadId, status: 'active', lastActivityAt: Date.now(), ...thread }, ...p.threads]
                } : p
            )
        }));

        console.log(`[MEMORY] Thread Created: ${thread.title} (${newThreadId})`);

        // Trigger Inner World Update (Deferred to ensure State Commit)
        setTimeout(async () => {
            console.log("[MEMORY] Triggering InnerWorld evaluation...");
            const { useInnerWorldStore } = await import('../innerworld/InnerWorldStore');
            useInnerWorldStore.getState().evaluate();
        }, 0);
    },

    updateThread: (threadId, updates) => set((state) => ({
        projects: state.projects.map(p => {
            if (p.id !== state.activeProjectId) return p;
            return {
                ...p,
                threads: p.threads.map(t => t.id === threadId ? { ...t, ...updates, lastActivityAt: Date.now() } : t)
            };
        })
    })),

    closeThread: (threadId) => set((state) => ({
        projects: state.projects.map(p => {
            if (p.id !== state.activeProjectId) return p;
            return {
                ...p,
                threads: p.threads.map(t => t.id === threadId ? { ...t, status: 'completed', lastActivityAt: Date.now() } : t)
            };
        })
    }))
}), {
    name: 'ai-familiar-storage',
    onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Migrate projects that predate chatThreads
        state.projects = state.projects.map(p => {
            if (p.chatThreads) return p; // already migrated
            const generalThread = {
                id: `thread_general_${p.id}`,
                title: 'General',
                messages: p.messages || [],
                createdAt: p.created || Date.now(),
                lastActivityAt: Date.now(),
            };
            return {
                ...p,
                chatThreads: [generalThread],
                activeChatThreadId: generalThread.id,
                messages: [],
            };
        });
    },
}));

// Attach the long-term memory bridge once the store is ready.
if (typeof window !== 'undefined') {
    attachBridge(useMemoryStore);
}
