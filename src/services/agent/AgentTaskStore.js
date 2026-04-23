import { create } from 'zustand';

export const useAgentTaskStore = create((set) => ({
    tasks: [],

    addTask: (task) => set((state) => ({
        tasks: [...state.tasks, task]
    })),

    updateTask: (id, patch) => set((state) => ({
        tasks: state.tasks.map(t => t.id === id ? { ...t, ...patch } : t)
    })),

    removeTask: (id) => set((state) => ({
        tasks: state.tasks.filter(t => t.id !== id)
    })),

    clearCompleted: () => set((state) => ({
        tasks: state.tasks.filter(t => t.status === 'running')
    })),
}));
