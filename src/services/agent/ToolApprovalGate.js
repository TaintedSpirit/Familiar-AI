/**
 * ToolApprovalGate — per-tool policy gating before execution.
 *
 * Resolution order:
 *  1. MCP tools → always allow
 *  2. toolPolicies[name] === 'deny'  → block immediately
 *  3. toolPolicies[name] === 'allow' → pass immediately
 *  4. autonomyLevel ≥ 80             → pass (high autonomy = trust all)
 *  5. write_file + allowedWritePaths → pass if path is whitelisted
 *  6. SENSITIVE_TOOLS                → native confirm dialog
 *  7. Everything else                → pass
 */

const SAFE_TOOLS = new Set([
    'web_search', 'scrape_url', 'get_screen_context', 'get_clipboard',
    'read_file', 'list_dir', 'update_memory', 'schedule_task',
    'remove_scheduled_task', 'generate_image', 'spawn_agent', 'list_spawns',
]);

const SENSITIVE_TOOLS = new Set([
    'write_file', 'run_command', 'execute_sandboxed',
]);

async function getSettings() {
    try {
        const { useSettingsStore } = await import('../settings/SettingsStore');
        return useSettingsStore.getState();
    } catch {
        return {};
    }
}

export const toolApprovalGate = {
    async requestApproval(toolName, args) {
        if (toolName.startsWith('mcp_')) return true;
        if (SAFE_TOOLS.has(toolName)) return true;

        const settings = await getSettings();
        const { toolPolicies = {}, allowedWritePaths = [], autonomyLevel = 50 } = settings;

        // Explicit policy check
        const policy = toolPolicies[toolName];
        if (policy === 'deny') return false;
        if (policy === 'allow') return true;

        // High autonomy — trust everything
        if (autonomyLevel >= 80) return true;

        // write_file path whitelist
        if (toolName === 'write_file' && allowedWritePaths.length > 0) {
            const target = (args?.path || '').replace(/\\/g, '/');
            const allowed = allowedWritePaths.some(dir =>
                target.startsWith(dir.replace(/\\/g, '/'))
            );
            if (allowed) return true;
        }

        if (!SENSITIVE_TOOLS.has(toolName)) return true;

        // Show native confirm for sensitive tools without an explicit policy
        const argPreview = Object.entries(args || {})
            .slice(0, 2)
            .map(([k, v]) => `${k}: ${String(v).slice(0, 80)}`)
            .join('\n');

        return window.confirm(`Allow agent to run: ${toolName}\n\n${argPreview}\n\nApprove?`);
    }
};
