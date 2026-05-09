// Renderer-side wrapper around the claude-code:* IPC channels.
// One instance per run; subscribes to streams filtered by pid, unsubscribes on exit.

const MAX_BUFFER = 200_000; // truncate runaway output to keep memory + LLM context sane

export class ClaudeCodeRunner {
    constructor() {
        this._pid = null;
        this._unsubs = [];
    }

    /**
     * @param {string} task
     * @param {{ cwd?: string, permissionMode?: string, binPath?: string,
     *           onStdout?: (chunk: string, total: string) => void,
     *           onStderr?: (chunk: string, total: string) => void }} opts
     * @returns {Promise<{ stdout: string, stderr: string, code: number, signal: ?string, error?: string }>}
     */
    run(task, opts = {}) {
        const api = window.electronAPI?.claudeCode;
        if (!api) return Promise.resolve({ error: 'Claude Code IPC bridge unavailable. Restart Electron.' });

        return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';
            let started = false;

            const cleanup = () => {
                this._unsubs.forEach(u => { try { u(); } catch { /* ignore */ } });
                this._unsubs = [];
            };

            const append = (target, chunk) => {
                if (target.length + chunk.length > MAX_BUFFER) {
                    return target + chunk.slice(0, MAX_BUFFER - target.length) + '\n…[output truncated]';
                }
                return target + chunk;
            };

            this._unsubs.push(api.onStdout(({ pid, chunk }) => {
                if (pid !== this._pid) return;
                stdout = append(stdout, chunk);
                opts.onStdout?.(chunk, stdout);
            }));

            this._unsubs.push(api.onStderr(({ pid, chunk }) => {
                if (pid !== this._pid) return;
                stderr = append(stderr, chunk);
                opts.onStderr?.(chunk, stderr);
            }));

            this._unsubs.push(api.onExit((payload) => {
                if (payload.pid !== this._pid) return;
                cleanup();
                resolve({
                    stdout: payload.stdout ?? stdout,
                    stderr: payload.stderr ?? stderr,
                    code: payload.code,
                    signal: payload.signal ?? null,
                    error: payload.error,
                });
            }));

            api.start({
                task,
                cwd: opts.cwd,
                permissionMode: opts.permissionMode,
                binPath: opts.binPath,
            }).then(res => {
                if (res?.error) {
                    cleanup();
                    resolve({ stdout: '', stderr: '', code: -1, signal: null, error: res.error });
                    return;
                }
                this._pid = res.pid;
                started = true;
            }).catch(e => {
                cleanup();
                resolve({ stdout: '', stderr: '', code: -1, signal: null, error: e.message });
            });
        });
    }

    cancel() {
        if (!this._pid || !window.electronAPI?.claudeCode) return;
        window.electronAPI.claudeCode.cancel(this._pid).catch(() => {});
    }
}
