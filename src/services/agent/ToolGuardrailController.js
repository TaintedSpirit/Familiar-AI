const WARN_THRESHOLD = 2;
const BLOCK_THRESHOLD = 3;

// Read-only tools where identical results = no progress
const IDEMPOTENT_TOOLS = new Set([
    'web_search', 'scrape_url', 'get_screen_context', 'get_clipboard',
    'read_file', 'list_dir', 'read_skill', 'read_mcp_resource',
]);

function computeSignature(toolName, args) {
    const canonical = JSON.stringify(args ?? {}, Object.keys(args ?? {}).sort());
    return `${toolName}:${canonical}`;
}

function shallowEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object') return String(a) === String(b);
    const ka = Object.keys(a ?? {});
    const kb = Object.keys(b ?? {});
    if (ka.length !== kb.length) return false;
    return ka.every(k => a[k] === b[k]);
}

export class ToolGuardrailController {
    constructor() {
        this._exactStreak = new Map();
        this._toolFailStreak = new Map();
        this._idempotentStreak = new Map();
        this._lastResult = new Map();
    }

    resetForTurn() {
        this._exactStreak.clear();
        this._toolFailStreak.clear();
        this._idempotentStreak.clear();
        this._lastResult.clear();
    }

    beforeCall(toolName, args) {
        const sig = computeSignature(toolName, args);

        const exact = this._exactStreak.get(sig) ?? 0;
        if (exact >= BLOCK_THRESHOLD) {
            return { action: 'halt', reason: `Exact repeat loop detected on "${toolName}" (${exact} times same call)` };
        }

        const fails = this._toolFailStreak.get(toolName) ?? 0;
        if (fails >= BLOCK_THRESHOLD) {
            return { action: 'block', reason: `"${toolName}" has failed ${fails} times consecutively` };
        }
        if (fails >= WARN_THRESHOLD) {
            return { action: 'warn', reason: `"${toolName}" has failed ${fails} times — watch for loops` };
        }

        const idempotent = this._idempotentStreak.get(sig) ?? 0;
        if (idempotent >= BLOCK_THRESHOLD) {
            return { action: 'block', reason: `"${toolName}" returned identical results ${idempotent} times — no progress` };
        }

        return { action: 'allow' };
    }

    afterCall(toolName, args, result, error) {
        const sig = computeSignature(toolName, args);

        // Track exact repeat streak (count every call with same sig)
        this._exactStreak.set(sig, (this._exactStreak.get(sig) ?? 0) + 1);

        if (error) {
            this._toolFailStreak.set(toolName, (this._toolFailStreak.get(toolName) ?? 0) + 1);
        } else {
            this._toolFailStreak.set(toolName, 0);
        }

        // Idempotent check: only for read-only tools
        if (IDEMPOTENT_TOOLS.has(toolName)) {
            const prev = this._lastResult.get(sig);
            if (prev !== undefined && shallowEqual(prev, result)) {
                this._idempotentStreak.set(sig, (this._idempotentStreak.get(sig) ?? 0) + 1);
            } else {
                this._idempotentStreak.set(sig, 0);
            }
            this._lastResult.set(sig, result);
        }
    }
}

export const toolGuardrailController = new ToolGuardrailController();
