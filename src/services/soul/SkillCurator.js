import { skillLoader } from './SkillLoader';
import { getCheapModel } from '../llm/cheapModel';

const IDLE_THRESHOLD_MS = 2 * 60 * 60 * 1000;  // 2 hours
const RUN_INTERVAL_MS   = 7 * 24 * 60 * 60 * 1000; // 7 days
const CHECK_INTERVAL_MS = 30 * 60 * 1000;          // 30 min polling

const STATE_FILENAME = '.curator_state.json';

function getStatePath(projectRoot) {
    return `${projectRoot}/.ai-familiar/${STATE_FILENAME}`;
}

async function loadState(projectRoot) {
    try {
        if (!window.electronAPI?.readFile) return null;
        const raw = await window.electronAPI.readFile(getStatePath(projectRoot));
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function saveState(projectRoot, state) {
    try {
        if (!window.electronAPI?.writeFile) return;
        await window.electronAPI.writeFile(getStatePath(projectRoot), JSON.stringify(state, null, 2));
    } catch (e) {
        console.warn('[SkillCurator] Failed to save state:', e.message);
    }
}

function getProjectRoot() {
    try {
        const { useSettingsStore } = require('../settings/SettingsStore');
        const workspaces = useSettingsStore?.getState?.()?.workspaces ?? [];
        const active = workspaces.find(w => w.pinned) ?? workspaces[0];
        return active?.path ?? null;
    } catch {
        return null;
    }
}

class SkillCurator {
    constructor() {
        this._running = false;
        this._intervalId = null;
        this._state = null;
        this._projectRoot = null;
    }

    start() {
        if (this._intervalId) return;
        this._intervalId = setInterval(() => this._checkAndRun(), CHECK_INTERVAL_MS);
    }

    stop() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
    }

    async _checkAndRun() {
        try {
            const { scheduler } = await import('../scheduler/Scheduler');
            const lastActivity = scheduler.getLastActivityAt();
            if (await this.shouldRun(lastActivity)) {
                await this.run();
            }
        } catch (e) {
            console.warn('[SkillCurator] Check failed:', e.message);
        }
    }

    async shouldRun(lastActivityAt) {
        const root = getProjectRoot();
        if (!root) return false;

        const now = Date.now();
        if (now - lastActivityAt < IDLE_THRESHOLD_MS) return false;

        const state = await loadState(root);
        if (state?.lastRunAt && now - state.lastRunAt < RUN_INTERVAL_MS) return false;

        const skills = await skillLoader.list().catch(() => []);
        if (skills.length < 3) return false;

        return true;
    }

    async run() {
        if (this._running) return;
        this._running = true;

        const root = getProjectRoot();
        if (!root) { this._running = false; return; }

        try {
            const skills = await skillLoader.list();
            if (skills.length < 3) { this._running = false; return; }

            const { llmRouter } = await import('../llm/Router');
            const { useSettingsStore } = await import('../settings/SettingsStore');
            const settings = useSettingsStore.getState();
            const cheap = getCheapModel(settings);

            const skillSummaries = skills.map(s =>
                `- ${s.name}: ${s.description || '(no description)'} | when-to-use: ${s.whenToUse || '(unspecified)'}`
            ).join('\n');

            const result = await llmRouter.query(
                `Review these AI assistant skills and identify opportunities for improvement. Output a JSON array (no markdown, pure JSON) of objects with shape: { type: "duplicate"|"stale"|"merge", skills: [name, ...], reason: string }. Only include genuine issues. Never suggest deletion. If nothing to improve, return [].

Skills:
${skillSummaries}`,
                [],
                null,
                cheap ? { modelOverride: cheap } : {}
            );

            const raw = result?.content || '[]';
            let suggestions = [];
            try {
                const jsonStart = raw.indexOf('[');
                const jsonEnd = raw.lastIndexOf(']');
                if (jsonStart >= 0 && jsonEnd > jsonStart) {
                    suggestions = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
                }
            } catch { /* ignore parse errors */ }

            const existingState = await loadState(root);
            const newState = {
                lastRunAt: Date.now(),
                suggestions: [
                    ...(Array.isArray(suggestions) ? suggestions.map(s => ({ ...s, createdAt: Date.now() })) : []),
                    ...((existingState?.suggestions ?? []).filter(s =>
                        Date.now() - s.createdAt < 30 * 24 * 60 * 60 * 1000 // keep 30 days
                    ))
                ]
            };
            await saveState(root, newState);
            this._state = newState;

            console.log(`[SkillCurator] Run complete. ${newState.suggestions.length} suggestions.`);
        } catch (e) {
            console.warn('[SkillCurator] Run failed:', e.message);
        } finally {
            this._running = false;
        }
    }

    async getSuggestions() {
        const root = getProjectRoot();
        if (!root) return [];
        const state = await loadState(root);
        return state?.suggestions ?? [];
    }

    async getLastRunAt() {
        const root = getProjectRoot();
        if (!root) return null;
        const state = await loadState(root);
        return state?.lastRunAt ?? null;
    }

    async dismissSuggestion(index) {
        const root = getProjectRoot();
        if (!root) return;
        const state = await loadState(root);
        if (!state?.suggestions) return;
        state.suggestions.splice(index, 1);
        await saveState(root, state);
    }
}

export const skillCurator = new SkillCurator();
