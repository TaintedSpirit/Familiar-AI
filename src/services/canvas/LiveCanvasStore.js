import { create } from 'zustand';

export const useLiveCanvasStore = create((set) => ({
    content: null,  // { type: 'image'|'code'|'text', url?, body?, prompt? }
    visible: false,
    setContent: (content) => set({ content, visible: true }),
    setVisible: (visible) => set({ visible }),
    clear: () => set({ content: null, visible: false }),
}));
