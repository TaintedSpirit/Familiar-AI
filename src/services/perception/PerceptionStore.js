import { create } from 'zustand';

const MAX_HISTORY = 5;

function diffStates(prev, curr) {
    if (!prev) return { type: 'initial', added: curr.visible_text, removed: [], appChanged: false, titleChanged: false };

    const prevSet = new Set(prev.visible_text);
    const currSet = new Set(curr.visible_text);

    return {
        type: 'delta',
        added:        curr.visible_text.filter(t => !prevSet.has(t)),
        removed:      prev.visible_text.filter(t => !currSet.has(t)),
        appChanged:   prev.app          !== curr.app,
        titleChanged: prev.active_panel !== curr.active_panel,
    };
}

function isMeaningful(diff) {
    if (!diff || diff.type === 'initial') return true;
    return diff.appChanged || diff.titleChanged || diff.added.length > 2 || diff.removed.length > 2;
}

export const usePerceptionStore = create((set, get) => ({
    history:    [],     // last MAX_HISTORY PerceptionResults
    current:    null,   // PerceptionResult
    lastDiff:   null,   // diff object
    lastIntent: null,   // { intent, confidence, context }

    push(result) {
        const { current, history } = get();
        const diff = diffStates(current, result);
        set({
            current:  result,
            history:  [...history, result].slice(-MAX_HISTORY),
            lastDiff: diff,
        });
        return diff;
    },

    setIntent(intent) { set({ lastIntent: intent }); },

    getMeaningfulChange() {
        const { lastDiff } = get();
        return isMeaningful(lastDiff) ? lastDiff : null;
    },

    clear() { set({ history: [], current: null, lastDiff: null, lastIntent: null }); },
}));
