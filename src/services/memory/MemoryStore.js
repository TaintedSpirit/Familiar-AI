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

export const useMemoryStore = create(persist((set, get) => ({
    projects: [
        {
            id: 'default',
            name: 'Living Desktop Companion',
            created: Date.now(),
            messages: [],
            memory: [],
            keyDecisions: [],
            artifacts: [],
            threads: [], // { id, title, origin, status, lastActivityAt, summary }
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
        return {
            projects: [...state.projects, {
                id: newId,
                name,
                created: Date.now(),
                messages: [],
                memory: [], // Context ingestion
                keyDecisions: [],
                artifacts: []
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

    // Active Project Data Mutators
    addMessage: (msg) => set((state) => ({
        projects: state.projects.map(p => p.id === state.activeProjectId ?
            { ...p, messages: [...p.messages, msg] } : p
        )
    })),

    clearMessages: () => set((state) => ({
        projects: state.projects.map(p => p.id === state.activeProjectId ?
            { ...p, messages: [] } : p
        )
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
    name: 'ai-familiar-storage', // unique name
}));

// Attach the long-term memory bridge once the store is ready.
if (typeof window !== 'undefined') {
    attachBridge(useMemoryStore);
}
