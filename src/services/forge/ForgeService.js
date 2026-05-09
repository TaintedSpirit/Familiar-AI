// ForgeService — sandbox lifecycle, path-guard, and benchmark runner for the
// Recursive Self-Evolution Engine. Runs in the renderer; heavy FS operations
// (clone, diff, benchmark spawn) are delegated to the main process via IPC.
//
// Sandbox dir layout:
//   <projectRoot>/sandboxes/sb_<id>/
//     ├── src/  electron/  public/  package.json  ...   (cloned)
//     └── .forge.json                                   (sandbox metadata)

import { useSettingsStore } from '../settings/SettingsStore';

const SAFE_ID = /^sb_[a-z0-9_]+$/;

class ForgeService {
    constructor() {
        // sandboxId → { rootPath, productionRoot, goal, createdAt }
        this._sandboxes = new Map();
    }

    _projectRoot() {
        const cwd = useSettingsStore.getState().claudeCodeCwd;
        if (!cwd) throw new Error('Project root not set. Set claudeCodeCwd in Settings.');
        return cwd;
    }

    /**
     * Create a new sandbox: clones src/, electron/, public/, package.json, package-lock.json
     * into <projectRoot>/sandboxes/sb_<id>/. Returns { sandboxId, rootPath, productionRoot }.
     */
    async createSandbox(goal) {
        if (!window.electronAPI?.forge?.createSandbox) {
            return { error: 'forge IPC not available' };
        }
        const productionRoot = this._projectRoot();
        const result = await window.electronAPI.forge.createSandbox({ productionRoot, goal });
        if (result?.error) return result;
        const { sandboxId, rootPath } = result;
        this._sandboxes.set(sandboxId, {
            rootPath, productionRoot, goal, createdAt: Date.now(),
        });
        return { sandboxId, rootPath, productionRoot, goal };
    }

    get(sandboxId) {
        if (!SAFE_ID.test(sandboxId)) return null;
        return this._sandboxes.get(sandboxId) || null;
    }

    list() {
        return [...this._sandboxes.entries()].map(([id, sb]) => ({ sandboxId: id, ...sb }));
    }

    async destroySandbox(sandboxId) {
        const sb = this.get(sandboxId);
        if (!sb) return { error: `Unknown sandbox: ${sandboxId}` };
        if (!window.electronAPI?.forge?.destroySandbox) {
            return { error: 'forge IPC not available' };
        }
        const result = await window.electronAPI.forge.destroySandbox({
            sandboxId, rootPath: sb.rootPath,
        });
        if (result?.error) return result;
        this._sandboxes.delete(sandboxId);
        return { success: true, sandboxId };
    }

    /**
     * Resolve a path under a sandbox. If the agent passes:
     *   - a path inside productionRoot → rewritten to the sandbox equivalent
     *   - a relative path → resolved against rootPath
     *   - any path outside both → rejected
     */
    resolveSandboxPath(sandboxId, requestedPath) {
        const sb = this.get(sandboxId);
        if (!sb) throw new Error(`Unknown sandbox: ${sandboxId}`);

        const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '');
        const root = norm(sb.rootPath);
        const prod = norm(sb.productionRoot);
        const req  = norm(requestedPath || '');

        if (!req) throw new Error('Empty path');
        if (req.includes('..')) throw new Error(`Sandbox escape attempt: ${requestedPath}`);

        // Absolute path inside productionRoot → rewrite to sandbox.
        if (req.toLowerCase().startsWith(prod.toLowerCase())) {
            const rel = req.slice(prod.length).replace(/^\/+/, '');
            return `${root}/${rel}`.replace(/\/+/g, '/');
        }
        // Already inside sandbox root.
        if (req.toLowerCase().startsWith(root.toLowerCase())) {
            return req;
        }
        // Treat anything else as relative to sandbox root.
        if (!/^[a-zA-Z]:/.test(req) && !req.startsWith('/')) {
            return `${root}/${req}`.replace(/\/+/g, '/');
        }
        throw new Error(`Path outside sandbox: ${requestedPath}`);
    }

    async diffSandbox(sandboxId) {
        const sb = this.get(sandboxId);
        if (!sb) return { error: `Unknown sandbox: ${sandboxId}` };
        if (!window.electronAPI?.forge?.diffSandbox) {
            return { error: 'forge IPC not available' };
        }
        return await window.electronAPI.forge.diffSandbox({
            sandboxId, rootPath: sb.rootPath, productionRoot: sb.productionRoot,
        });
    }

    /**
     * Run a benchmark inside the sandbox. The agent must have placed a benchmark
     * script at sandboxes/sb_<id>/benchmarks/<suite>.mjs that prints a single line
     * of JSON to stdout. Wallclock cap is enforced in main.
     */
    async runBenchmark(sandboxId, suite = 'default') {
        const sb = this.get(sandboxId);
        if (!sb) return { error: `Unknown sandbox: ${sandboxId}` };
        if (!window.electronAPI?.forge?.runBenchmark) {
            return { error: 'forge IPC not available' };
        }
        const result = await window.electronAPI.forge.runBenchmark({
            sandboxId, rootPath: sb.rootPath, suite,
        });
        if (!result?.error) {
            sb.lastBenchmark = { ...result, suite, ranAt: Date.now() };
        }
        return result;
    }

    /**
     * Returns the most recent benchmark for a sandbox, or null. Used by ToolExecutor
     * to gate forge_propose_evolution.
     */
    lastBenchmark(sandboxId) {
        const sb = this.get(sandboxId);
        return sb?.lastBenchmark || null;
    }

    /**
     * Apply a sandbox's changes to production. Triggers a native confirm dialog
     * in main, then copies files and reloads. The user gate is in main.
     */
    async applyEvolution(sandboxId, summary) {
        const sb = this.get(sandboxId);
        if (!sb) return { error: `Unknown sandbox: ${sandboxId}` };
        if (!window.electronAPI?.forge?.applyEvolution) {
            return { error: 'forge IPC not available' };
        }
        return await window.electronAPI.forge.applyEvolution({
            sandboxId,
            rootPath: sb.rootPath,
            productionRoot: sb.productionRoot,
            summary,
        });
    }
}

export const forgeService = new ForgeService();
