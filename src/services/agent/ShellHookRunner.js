import { useSettingsStore } from '../settings/SettingsStore';

const HOOKS_DIR_SUFFIX = '/.ai-familiar/hooks';

function getHooksDir() {
    try {
        const { useWorkspaceStore } = require('../workspace/WorkspaceStore');
        const active = useWorkspaceStore?.getState?.()?.activePath;
        if (active) return active + HOOKS_DIR_SUFFIX;
    } catch { /* no workspace store */ }
    return null;
}

async function discoverHooks() {
    if (!window.electronAPI?.listDir) return [];
    const hooksDir = getHooksDir();
    if (!hooksDir) return [];

    try {
        const entries = await window.electronAPI.listDir(hooksDir);
        const files = Array.isArray(entries) ? entries : (entries?.files ?? []);
        const jsFiles = files.filter(f => typeof f === 'string' ? f.endsWith('.js') : f?.name?.endsWith('.js'));
        const { hooksAllowlist = [] } = useSettingsStore.getState();

        return jsFiles
            .map(f => (typeof f === 'string' ? `${hooksDir}/${f}` : `${hooksDir}/${f.name}`))
            .filter(path => {
                const approved = hooksAllowlist.find(h => h.hookPath === path);
                return approved?.approved === true;
            });
    } catch {
        return [];
    }
}

async function runHook(hookPath, payload) {
    if (!window.electronAPI?.runHook) return { action: 'allow' };
    try {
        const raw = await window.electronAPI.runHook(hookPath, payload);
        if (!raw) return { action: 'allow' };
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return result;
    } catch (e) {
        console.warn('[ShellHooks] Hook error:', hookPath, e.message);
        return { action: 'allow' };
    }
}

export const shellHookRunner = {
    async runHooks(event, toolName, args) {
        const { hooksEnabled = false } = useSettingsStore.getState();
        if (!hooksEnabled) return { action: 'allow' };

        const hooks = await discoverHooks();
        if (hooks.length === 0) return { action: 'allow' };

        const payload = { event, toolName, args };
        const contextParts = [];

        for (const hookPath of hooks) {
            const result = await runHook(hookPath, payload);
            if (result?.action === 'block') {
                return { action: 'block', reason: result.reason ?? `Blocked by hook: ${hookPath}` };
            }
            if (result?.context) contextParts.push(result.context);
        }

        return { action: 'allow', context: contextParts.join('\n') || undefined };
    },

    async listDiscovered() {
        return discoverHooks();
    }
};
