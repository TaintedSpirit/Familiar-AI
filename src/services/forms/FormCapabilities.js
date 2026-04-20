
import { useFormStore } from './FormStore';
import { FORMS } from './FormRegistry';

export const FormCapabilities = {
    getAll: () => {
        const { unlockedForms, currentFormId } = useFormStore.getState();
        return Object.values(FORMS).map(f => ({
            ...f,
            unlocked: unlockedForms.includes(f.id),
            active: currentFormId === f.id
        }));
    },

    getCurrent: () => {
        const { currentFormId } = useFormStore.getState();
        return FORMS[currentFormId] || FORMS['seed_blob'];
    },

    setForm: (formId) => {
        // Validation handled by store logic usually, but here we can enforce unlocks
        const { unlockedForms } = useFormStore.getState();
        if (unlockedForms.includes(formId)) {
            useFormStore.getState().setCurrentForm(formId);
            return true;
        }
        return false;
    },

    // For LLM Injection
    getPromptContext: () => {
        const { unlockedForms, currentFormId } = useFormStore.getState();
        const currentName = FORMS[currentFormId]?.name || currentFormId;

        // Concise list of AVAILABLE forms
        const available = Object.values(FORMS)
            .filter(f => unlockedForms.includes(f.id))
            .map(f => f.name)
            .join(', ');

        return {
            current: currentName,
            available_count: unlockedForms.length,
            available_names: available,
            all_known_count: Object.keys(FORMS).length
        };
    }
};
