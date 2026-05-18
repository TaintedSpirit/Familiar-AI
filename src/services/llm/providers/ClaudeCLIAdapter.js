import { BaseAdapter } from "./BaseAdapter";

/**
 * ClaudeCLIAdapter — routes chat through the local `claude` CLI binary so
 * the user's Claude subscription is used instead of API billing.
 *
 * Spawns the binary via the existing `claude-code:start` IPC channel
 * (electron/main.mjs) with `--print --permission-mode acceptEdits`,
 * streams stdout into onChunk, and resolves with the full transcript.
 *
 * Tool-use is prompt-engineered: the CLI has no native tool_use bridge,
 * so the schema is appended to the prompt and the model is instructed to
 * emit a strict JSON envelope when it wants to call a tool.
 */
export class ClaudeCLIAdapter extends BaseAdapter {
    constructor() {
        super('claude-cli');
    }

    isConfigured(settings) {
        const bin = settings?.claudeCliBinPath?.trim();
        if (!bin) return false;
        return settings?.claudeCliLoggedIn === true;
    }

    // ── Plain Chat ─────────────────────────────────────────────────────────

    async chat(prompt, contextMessages, systemPrompt, settings, onChunk) {
        const transcript = this._flattenTranscript(systemPrompt, contextMessages, prompt);
        const { stdout } = await this._runCli(transcript, settings, onChunk);
        return stdout;
    }

    // ── Tool-Use Chat (prompt-engineered) ──────────────────────────────────

    async chatWithTools(messages, tools, systemPrompt, settings) {
        const toolBlock = this._buildToolBlock(tools);
        const transcript = this._flattenTranscript(systemPrompt + '\n\n' + toolBlock, messages, null);
        const { stdout } = await this._runCli(transcript, settings, null);

        const parsed = this._tryParseToolCalls(stdout);
        if (parsed) return { type: 'tool_calls', toolCalls: parsed };
        return { type: 'text', content: stdout.trim() };
    }

    // ── Internals ──────────────────────────────────────────────────────────

    _flattenTranscript(systemPrompt, history, finalPrompt) {
        const parts = [];
        if (systemPrompt) parts.push(`System: ${systemPrompt}`);

        const list = Array.isArray(history) ? history : [];
        for (const m of list) {
            if (!m) continue;
            const role = m.role === 'assistant' ? 'Assistant'
                       : m.role === 'system'    ? 'System'
                       : m.role === 'tool'      ? `ToolResult(${m.toolCallId || ''})`
                       :                          'User';
            const content = typeof m.content === 'string'
                ? m.content
                : (m.toolCalls?.length
                    ? `[tool_calls] ${JSON.stringify(m.toolCalls)}`
                    : JSON.stringify(m.content || ''));
            parts.push(`${role}: ${content}`);
        }

        if (finalPrompt) parts.push(`User: ${finalPrompt}`);
        parts.push('Assistant:');
        return parts.join('\n\n');
    }

    _buildToolBlock(tools) {
        const schema = tools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
        }));
        return [
            'You have access to the following tools:',
            JSON.stringify(schema, null, 2),
            '',
            'If you need to call a tool, respond ONLY with a JSON object on a single line, with no prose, no markdown fences, and no explanation:',
            '{"tool_calls":[{"name":"<tool_name>","arguments":{...}}]}',
            'Otherwise, reply with a normal natural-language answer and do not mention this protocol.',
        ].join('\n');
    }

    _tryParseToolCalls(raw) {
        if (!raw) return null;
        const text = raw.trim();

        // Strip optional ``` fences
        const fenced = text.match(/^```(?:json)?\s*([\s\S]+?)\s*```$/);
        const candidate = fenced ? fenced[1] : text;

        // Find the first {...} block that mentions tool_calls
        const idx = candidate.indexOf('{');
        if (idx === -1) return null;
        const slice = candidate.slice(idx);
        if (!/tool_calls/.test(slice)) return null;

        let parsed;
        try { parsed = JSON.parse(slice); }
        catch {
            // Try trimming trailing junk
            const lastBrace = slice.lastIndexOf('}');
            if (lastBrace === -1) return null;
            try { parsed = JSON.parse(slice.slice(0, lastBrace + 1)); }
            catch { return null; }
        }

        if (!parsed || !Array.isArray(parsed.tool_calls)) return null;
        return parsed.tool_calls.map((tc, i) => ({
            id: `claude_cli_${Date.now()}_${i}`,
            name: tc.name,
            args: tc.arguments || tc.args || {},
        }));
    }

    _runCli(task, settings, onChunk) {
        const api = (typeof window !== 'undefined') ? window.electronAPI?.claudeCode : null;
        if (!api?.start) {
            return Promise.reject(new Error('Claude CLI bridge unavailable (window.electronAPI.claudeCode missing).'));
        }

        const binPath = settings?.claudeCliBinPath?.trim() || 'claude';
        const permissionMode = 'acceptEdits';

        return new Promise((resolve, reject) => {
            let pid = null;
            let stdoutAcc = '';
            let stderrAcc = '';
            let unsubOut = () => {};
            let unsubErr = () => {};
            let unsubExit = () => {};

            unsubOut = api.onStdout((payload) => {
                if (!payload || payload.pid !== pid) return;
                stdoutAcc += payload.chunk || '';
                if (typeof onChunk === 'function') {
                    try { onChunk(stdoutAcc); } catch (e) { console.warn('[ClaudeCLI] onChunk error', e); }
                }
            });
            unsubErr = api.onStderr((payload) => {
                if (!payload || payload.pid !== pid) return;
                stderrAcc += payload.chunk || '';
            });
            unsubExit = api.onExit((payload) => {
                if (!payload || payload.pid !== pid) return;
                unsubOut(); unsubErr(); unsubExit();
                if (payload.code === 0) {
                    resolve({ stdout: payload.stdout || stdoutAcc, stderr: payload.stderr || stderrAcc });
                } else {
                    const msg = (payload.stderr || stderrAcc || `claude CLI exited with code ${payload.code}`).trim();
                    console.error('[ClaudeCLI] CLI exited non-zero', { code: payload.code, signal: payload.signal, stderr: msg });
                    reject(new Error(`Claude CLI Error: ${msg}`));
                }
            });

            api.start({ task, permissionMode, binPath, viaStdin: true })
                .then((res) => {
                    if (!res || res.error || !res.pid) {
                        unsubOut(); unsubErr(); unsubExit();
                        reject(new Error(res?.error || 'claude-code:start returned no pid'));
                        return;
                    }
                    pid = res.pid;
                })
                .catch((e) => {
                    unsubOut(); unsubErr(); unsubExit();
                    reject(e);
                });
        });
    }
}
