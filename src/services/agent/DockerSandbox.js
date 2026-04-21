/**
 * DockerSandbox — ephemeral container execution for untrusted code.
 *
 * When the agent runs a command flagged as high-risk (shell code, npm builds,
 * Python scripts, etc.) and Docker is enabled in settings, this service spins
 * up an Alpine/Node/Python container, executes the code inside it with strict
 * resource caps, captures output, and destroys the container — leaving the
 * host filesystem untouched.
 */

const CONTAINER_TIMEOUT_MS = 15000;
const MEMORY_LIMIT = '128m';
const CPU_LIMIT = '0.5';

// Commands / patterns that warrant sandboxing
const SANDBOX_PATTERNS = [
    /\bpython\b/i,
    /\bnode\b|\bnpm\b|\bnpx\b/i,
    /\bpip\b/i,
    /\beval\b/i,
    /\brm\s+-rf\b/,
    /\bcurl\b.*\|\s*(ba)?sh/i,
    /\bwget\b.*\|\s*(ba)?sh/i,
    /&&|\|\|/,          // chained commands — more likely to be complex/risky
    />\s*\/dev\/null/,  // output suppression (suspicious)
];

function selectImage(command) {
    if (/\bpython3?\b/i.test(command)) return 'python:3.12-alpine';
    if (/\bnode\b|\bnpm\b|\bnpx\b/i.test(command)) return 'node:20-alpine';
    return 'alpine:latest';
}

function isSandboxCandidate(command) {
    return SANDBOX_PATTERNS.some(re => re.test(command));
}

class DockerSandboxService {
    constructor() {
        this._available = null; // null = unchecked
    }

    async isAvailable() {
        if (this._available !== null) return this._available;
        try {
            if (!window.electronAPI?.runCommand) { this._available = false; return false; }
            const { stdout } = await window.electronAPI.runCommand('docker info --format "{{.ServerVersion}}"');
            this._available = !!(stdout || '').trim();
        } catch {
            this._available = false;
        }
        return this._available;
    }

    /**
     * Execute an arbitrary shell command inside an ephemeral Docker container.
     * @param {string} command  Shell command to run inside the container
     * @param {string} [image]  Override the Docker image (auto-selected by default)
     * @returns {{ ok: boolean, stdout: string, stderr: string, sandboxed: boolean }}
     */
    async run(command, image) {
        const img = image || selectImage(command);

        // Escape single quotes in command for sh -c '...'
        const escaped = command.replace(/'/g, `'\\''`);

        const dockerCmd = [
            'docker run --rm',
            '--network=none',           // No network access
            `--memory=${MEMORY_LIMIT}`,
            `--cpus=${CPU_LIMIT}`,
            '--read-only',              // Read-only root filesystem
            '--tmpfs /tmp:size=32m',    // Writable tmp only
            '--cap-drop=ALL',           // Drop all Linux capabilities
            '--security-opt=no-new-privileges',
            img,
            `sh -c '${escaped}'`
        ].join(' ');

        try {
            const result = await Promise.race([
                window.electronAPI.runCommand(dockerCmd),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Sandbox container timed out')), CONTAINER_TIMEOUT_MS)
                )
            ]);
            return { ok: true, stdout: result.stdout || '', stderr: result.stderr || '', sandboxed: true };
        } catch (e) {
            return { ok: false, stdout: '', stderr: e.message, sandboxed: true, error: e.message };
        }
    }

    /** Decide whether to sandbox this command given current settings. */
    async shouldSandbox(command) {
        const { useSettingsStore } = await import('../settings/SettingsStore');
        if (!useSettingsStore.getState().dockerEnabled) return false;
        if (!isSandboxCandidate(command)) return false;
        return this.isAvailable();
    }
}

export const dockerSandbox = new DockerSandboxService();
export { isSandboxCandidate };
