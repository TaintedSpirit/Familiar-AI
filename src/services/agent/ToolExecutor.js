import { useContextStore } from '../context/ContextStore';
import { soulLoader } from '../soul/SoulLoader';
import { skillLoader } from '../soul/SkillLoader';
import { mcpLoader } from './MCPLoader';
import { dockerSandbox } from './DockerSandbox';
import { cronEngine } from '../watchers/CronEngine';
import { useSettingsStore } from '../settings/SettingsStore';
import { toolApprovalGate } from './ToolApprovalGate';
import { agentSpawner } from './AgentSpawner';
import { AGENT_REGISTRY } from './AgentRegistry';
import { forgeService } from '../forge/ForgeService';
import { useEvolutionStore } from '../forge/EvolutionStore';

const BENCHMARK_FRESHNESS_MS = 5 * 60 * 1000;

export const toolExecutor = {
    async run(name, args, ctx = {}) {
        try {
            // Gate sensitive tools before execution
            const approved = await toolApprovalGate.requestApproval(name, args);
            if (!approved) return { error: `Tool "${name}" was denied by the user.` };

            // Shell hook pre-call intercept
            const settings = useSettingsStore.getState();
            if (settings.hooksEnabled) {
                try {
                    const { shellHookRunner } = await import('./ShellHookRunner');
                    const hookResult = await shellHookRunner.runHooks('pre_tool', name, args);
                    if (hookResult.action === 'block') {
                        return { error: `[Hook] Tool "${name}" blocked: ${hookResult.reason}` };
                    }
                    if (hookResult.context) {
                        args = { ...args, _hookContext: hookResult.context };
                    }
                } catch (hookErr) {
                    console.warn('[ToolExecutor] Shell hook error:', hookErr.message);
                }
            }

            if (name.startsWith('mcp_')) {
                return await mcpLoader.executeTool(name, args);
            }
            switch (name) {
                case 'web_search':          return await searchWeb(args.query);
                case 'scrape_url':          return await scrapeUrl(args.url);
                case 'get_screen_context':  return await getScreenContext();
                case 'get_clipboard':       return await getClipboard();
                case 'read_file':           return await readFile(args.path, ctx.sandboxId);
                case 'write_file':          return await writeFile(args.path, args.content, ctx.sandboxId);
                case 'list_dir':            return await listDir(args.path, ctx.sandboxId);
                case 'run_command':         return await runCommand(args.command);
                case 'forge_create_sandbox':   return await forgeCreateSandbox(args.goal);
                case 'forge_run_benchmarks':   return await forgeRunBenchmarks(args.sandboxId, args.suite);
                case 'forge_diff_sandbox':     return await forgeDiffSandbox(args.sandboxId);
                case 'forge_propose_evolution':return await forgeProposeEvolution(args.sandboxId, args.report);
                case 'forge_destroy_sandbox':  return await forgeDestroySandbox(args.sandboxId);
                case 'execute_sandboxed':   return await executeSandboxed(args.command, args.language);
                case 'update_memory':       return await updateMemory(args.fact);
                case 'generate_image':      return await generateImage(args.prompt, args.size);
                case 'schedule_task':       return await scheduleTask(args.cron, args.intent, args.id);
                case 'remove_scheduled_task': return await removeScheduledTask(args.id);
                case 'spawn_agent':         return await spawnAgent(args.task, args.label, args.agentId);
                case 'list_spawns':         return agentSpawner.list();
                case 'read_skill':         return await skillLoader.readSkillForTool(args.name);
                case 'read_mcp_resource':  return await mcpLoader.readResource(args.uri, args.serverName);
                case 'run_claude_code':     return await runClaudeCode(args.task, args.cwd, args.permissionMode);
                case 'run_codex':           return await runCodex(args.task, args.cwd, args.approvalMode);
                default:                    return { error: `Unknown tool: ${name}` };
            }
        } catch (err) {
            console.error(`[ToolExecutor] Error in tool "${name}":`, err);
            return { error: err.message };
        }
    }
};

async function searchWeb(query) {
    try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const res = await fetch(url);
        const data = await res.json();

        const parts = [];
        if (data.AbstractText) parts.push(data.AbstractText);
        if (data.Answer) parts.push(`Answer: ${data.Answer}`);
        if (data.RelatedTopics?.length) {
            data.RelatedTopics.slice(0, 5).forEach(t => {
                if (t.Text) parts.push(t.Text);
            });
        }
        return parts.length ? parts.join('\n\n') : `No instant results for "${query}". Try scrape_url with a specific page.`;
    } catch (e) {
        return `Search unavailable: ${e.message}`;
    }
}

async function scrapeUrl(url) {
    if (!window.electronAPI?.scrapeUrl) return { error: 'scrapeUrl IPC not available' };
    const content = await window.electronAPI.scrapeUrl(url);
    return content ? content.substring(0, 4000) : 'Failed to fetch URL or empty response.';
}

async function getScreenContext() {
    try {
        // Force capture regardless of awareness toggle — agent explicitly asked to see
        const visionStore = (await import('../vision/VisionStore')).useVisionStore.getState();
        const { analyzeScreen }      = await import('../perception/PerceptionEngine.js');
        const { usePerceptionStore } = await import('../perception/PerceptionStore.js');
        const { inferIntent }        = await import('../perception/IntentInferrer.js');

        let screenshot = null;
        let metadata   = null;

        try {
            if (window.electronAPI?.captureContextSnapshot) {
                const atomic = await window.electronAPI.captureContextSnapshot();
                if (atomic) {
                    ({ screenshot, metadata } = atomic);
                    visionStore.setCapture(screenshot, 'manual');
                }
            }
        } catch (captureErr) {
            console.warn('[ToolExecutor] Screenshot capture failed:', captureErr.message);
        }

        if (!screenshot) {
            return [
                `Active Application: ${metadata?.app || 'Unknown'}`,
                `Window Title: ${metadata?.title || 'Unknown'}`,
                'Screenshot capture failed — describe based on window title only.',
            ].join('\n');
        }

        // Get live cursor position
        let cursor = { x: 0, y: 0 };
        try {
            if (window.electronAPI?.getCursorPosition) cursor = await window.electronAPI.getCursorPosition();
        } catch {}

        // Structured perception — OCR + element detection
        const perception = await analyzeScreen(screenshot, metadata, cursor);

        // State memory + change detection
        const perceptionStore = usePerceptionStore.getState();
        const diff   = perceptionStore.push(perception);
        const intent = inferIntent(perception, perceptionStore.history);
        perceptionStore.setIntent(intent);

        // Update ContextStore for Router image attachment and system prompt injection
        useContextStore.getState().setSharedContext({
            app: metadata.app,
            title: metadata.title,
            url: metadata.url,
            timestamp: Date.now(),
            screenshot,
            perception,
            intent,
        });
        useContextStore.getState().setLiveContext({
            app: metadata.app, title: metadata.title, url: metadata.url,
        });

        // Build structured tool result for the LLM
        const topText  = perception.visible_text.slice(0, 8).join(' | ') || '(none detected)';
        const elements = perception.ui_elements
            .map(e => `${e.type}:${e.text || e.placeholder || e.href}`)
            .join(', ');
        const changeNote = diff?.appChanged
            ? `Change detected: switched to ${perception.app}`
            : diff?.added?.length
            ? `New content: ${diff.added.slice(0, 3).join(' | ')}`
            : null;

        const structured = {
            app:               perception.app,
            active_panel:      perception.active_panel,
            visible_text:      perception.visible_text.slice(0, 20),
            ui_elements:       perception.ui_elements,
            has_error:         perception.has_error,
            cursor,
            intent:            intent.intent,
            intent_confidence: intent.confidence,
            timestamp:         perception.timestamp,
        };

        return [
            `SCREEN PERCEPTION REPORT`,
            `Active App:    ${perception.app}`,
            `Window:        ${perception.active_panel}`,
            metadata?.url ? `URL:           ${metadata.url}` : null,
            `Visible Text:  ${topText}`,
            elements       ? `UI Elements:   ${elements}` : null,
            `Intent:        ${intent.intent} (${Math.round(intent.confidence * 100)}% confidence)`,
            changeNote     || null,
            perception.has_error ? `⚠ Error content detected on screen` : null,
            `Cursor:        x=${cursor.x}, y=${cursor.y}`,
            `\nFull structured data:\n${JSON.stringify(structured, null, 2)}`,
            `\nScreenshot attached for visual confirmation.`,
        ].filter(Boolean).join('\n');
    } catch (e) {
        return { error: e.message };
    }
}

async function getClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        return text || '(clipboard is empty)';
    } catch {
        return { error: 'Clipboard read permission denied. User must grant clipboard access.' };
    }
}

function routeSandboxPath(filePath, sandboxId, { allowReadFallthrough = false } = {}) {
    if (!sandboxId) return filePath;
    try {
        return forgeService.resolveSandboxPath(sandboxId, filePath);
    } catch (e) {
        if (allowReadFallthrough) return filePath;
        throw e;
    }
}

async function readFile(filePath, sandboxId) {
    if (!window.electronAPI?.readFile) return { error: 'readFile IPC not available' };
    // Reads outside the sandbox are allowed (so the agent can compare against production).
    const path = routeSandboxPath(filePath, sandboxId, { allowReadFallthrough: true });
    return await window.electronAPI.readFile(path);
}

async function writeFile(filePath, content, sandboxId) {
    if (!window.electronAPI?.writeFile) return { error: 'writeFile IPC not available' };
    let path;
    try {
        path = routeSandboxPath(filePath, sandboxId);
    } catch (e) {
        return { error: e.message };
    }
    await window.electronAPI.writeFile(path, content);
    return { success: true, path, sandboxed: !!sandboxId };
}

async function listDir(dirPath, sandboxId) {
    if (!window.electronAPI?.listDir) return { error: 'listDir IPC not available' };
    const path = routeSandboxPath(dirPath, sandboxId, { allowReadFallthrough: true });
    return await window.electronAPI.listDir(path);
}

async function runCommand(command) {
    if (!window.electronAPI?.runCommand) return { error: 'runCommand IPC not available' };

    // ── GUARDRAILS: Block destructive shell commands ──
    const DESTRUCTIVE_PATTERNS = [
        /rm\s+-r/i,            // Recursive remove (Unix)
        /del\s+\/[sSqQ]/i,     // Recursive delete (Windows)
        /format\s+[a-z]:/i,    // Format drive (Windows)
        /mkfs/i,               // Format drive (Unix)
        />\s*\/dev\/sd[a-z]/i, // Overwrite block device
        /dd\s+if=.*of=\/dev\//i // dd to block device
    ];

    if (DESTRUCTIVE_PATTERNS.some(p => p.test(command))) {
        console.warn(`[Guardrails] Blocked destructive command: ${command}`);
        return { 
            error: `Command blocked by Guardrails: Destructive pattern detected.`,
            workflow_action_required: "humanApproval",
            suggestion: "Request user approval or use safe alternatives."
        };
    }

    // Auto-route to Docker sandbox when enabled + command looks risky
    if (await dockerSandbox.shouldSandbox(command)) {
        const result = await dockerSandbox.run(command);
        return { ...result, note: '(executed in isolated Docker container)' };
    }

    return await window.electronAPI.runCommand(command);
}

async function executeSandboxed(command, language) {
    if (!window.electronAPI?.runCommand) return { error: 'runCommand IPC not available' };
    const available = await dockerSandbox.isAvailable();
    if (!available) return { error: 'Docker is not available on this system. Install Docker Desktop to use sandboxed execution.' };

    const imageMap = { python: 'python:3.12-alpine', node: 'node:20-alpine', sh: 'alpine:latest' };
    const image = imageMap[language] || 'alpine:latest';
    return dockerSandbox.run(command, image);
}

async function updateMemory(fact) {
    await soulLoader.appendToMemory(fact);
    return { success: true, remembered: fact };
}

async function generateImage(prompt, size = '1024x1024') {
    const { openaiApiKey, stabilityApiKey, imageGenProvider } = useSettingsStore.getState();

    if (imageGenProvider === 'stability' && stabilityApiKey) {
        return generateStabilityImage(prompt, stabilityApiKey);
    }

    if (!openaiApiKey) return { error: 'No OpenAI API key configured. Add one in Settings → Media.' };

    try {
        const res = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${openaiApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size, response_format: 'url' })
        });
        const data = await res.json();
        if (data.error) return { error: data.error.message };
        const url = data.data?.[0]?.url;
        if (!url) return { error: 'No image returned from API' };

        // Push to LiveCanvas store
        try {
            const { useLiveCanvasStore } = await import('../canvas/LiveCanvasStore');
            useLiveCanvasStore.getState().setContent({ type: 'image', url, prompt });
        } catch (_) { }

        return { type: 'image', url, prompt, size };
    } catch (e) {
        return { error: `Image generation failed: ${e.message}` };
    }
}

async function generateStabilityImage(prompt, apiKey) {
    try {
        const res = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ text_prompts: [{ text: prompt }], cfg_scale: 7, height: 1024, width: 1024, samples: 1 })
        });
        const data = await res.json();
        const b64 = data.artifacts?.[0]?.base64;
        if (!b64) return { error: 'No image from Stability AI' };
        const url = `data:image/png;base64,${b64}`;

        try {
            const { useLiveCanvasStore } = await import('../canvas/LiveCanvasStore');
            useLiveCanvasStore.getState().setContent({ type: 'image', url, prompt });
        } catch (_) { }

        return { type: 'image', url, prompt };
    } catch (e) {
        return { error: `Stability AI failed: ${e.message}` };
    }
}

async function scheduleTask(cron, intent, id) {
    if (!cron || !intent) return { error: 'cron expression and intent are required' };
    const jobId = id || `job_${Date.now()}`;
    cronEngine.register(jobId, cron, intent);
    return { success: true, id: jobId, cron, intent, message: `Scheduled: "${intent}" at ${cron}` };
}

async function removeScheduledTask(id) {
    if (!id) return { error: 'id is required' };
    cronEngine.remove(id);
    return { success: true, id };
}

async function spawnAgent(task, label, agentId) {
    if (!task) return { error: 'task is required' };
    return agentSpawner.spawn(task, label, async (outcome) => {
        const summary = outcome.result?.reply || outcome.result?.content || 'Task complete.';
        const profile = agentId ? AGENT_REGISTRY[agentId] : null;
        const agentName = profile ? `${profile.archetype} (${profile.name})` : 'Background Agent';
        const taskLabel = outcome.label || task.slice(0, 40);

        // WatcherStore notification for the activity ticker
        const { useWatcherStore } = await import('../watchers/WatcherStore');
        useWatcherStore.getState().addNotification(
            `[${agentName}: ${taskLabel}] ${summary.slice(0, 120)} (${outcome.elapsed}s)`,
            'medium'
        );

        // Inject AGENT_ANNOUNCE into the conversation so the Familiar sees the result in context
        try {
            const { useMemoryStore } = await import('../memory/MemoryStore');
            useMemoryStore.getState().addMessage({
                role: 'assistant',
                content: `[AGENT_ANNOUNCE] ${agentName} completed "${taskLabel}" in ${outcome.elapsed}s.\n\nResult:\n${summary}`,
                isAgentAnnounce: true,
            });
        } catch { /* non-fatal if store is unavailable */ }
    }, agentId);
}

// ─── Forge — Recursive Self-Evolution ────────────────────────────────────────

async function forgeCreateSandbox(goal) {
    if (!goal || !goal.trim()) return { error: 'goal is required' };
    const result = await forgeService.createSandbox(goal);
    if (result?.error) return result;
    useEvolutionStore.getState().addExperiment(result.sandboxId, goal);
    return result;
}

async function forgeRunBenchmarks(sandboxId, suite) {
    if (!sandboxId) return { error: 'sandboxId is required' };
    const result = await forgeService.runBenchmark(sandboxId, suite || 'default');
    if (result?.error) return result;
    useEvolutionStore.getState().recordBenchmark(sandboxId, result);
    return result;
}

async function forgeDiffSandbox(sandboxId) {
    if (!sandboxId) return { error: 'sandboxId is required' };
    return await forgeService.diffSandbox(sandboxId);
}

async function forgeProposeEvolution(sandboxId, report) {
    if (!sandboxId) return { error: 'sandboxId is required' };
    if (!report || !report.summary || !report.metric || report.baseline == null) {
        return { error: 'report.summary, report.metric, and report.baseline are required' };
    }

    // Gate: must have a recent, non-regressing benchmark.
    const last = forgeService.lastBenchmark(sandboxId);
    if (!last) {
        return { error: 'No benchmark on file. Call forge_run_benchmarks first.' };
    }
    if (Date.now() - last.ranAt > BENCHMARK_FRESHNESS_MS) {
        return { error: `Benchmark is stale (>${BENCHMARK_FRESHNESS_MS / 60000} min). Re-run forge_run_benchmarks.` };
    }
    const measured = last[report.metric];
    if (measured == null || typeof measured !== 'number') {
        return { error: `Benchmark did not report metric "${report.metric}". Available: ${Object.keys(last).join(', ')}` };
    }
    const higherIsBetter = !!report.higherIsBetter;
    const regressed = higherIsBetter ? (measured < report.baseline) : (measured > report.baseline);
    if (regressed) {
        return {
            error: `Benchmark regressed on "${report.metric}": measured=${measured}, baseline=${report.baseline}. Proposal blocked.`,
            measured, baseline: report.baseline,
        };
    }

    const diff = await forgeService.diffSandbox(sandboxId);
    if (diff?.error) return diff;

    useEvolutionStore.getState().stagePendingMerge({
        sandboxId,
        report: { ...report, measured, ranAt: last.ranAt, suite: last.suite },
        diff,
    });

    return {
        success: true,
        sandboxId,
        message: `Evolution proposal staged. The user must accept it via the Forge → Evolution tab to apply.`,
        measured,
        baseline: report.baseline,
        files_changed: diff?.files?.length ?? 0,
    };
}

async function forgeDestroySandbox(sandboxId) {
    if (!sandboxId) return { error: 'sandboxId is required' };
    const result = await forgeService.destroySandbox(sandboxId);
    if (result?.error) return result;
    useEvolutionStore.getState().removeExperiment(sandboxId);
    return result;
}

// ─── Claude Code CLI ─────────────────────────────────────────────────────────
// Active runners keyed by run id so the chat UI can cancel them later.
const activeClaudeRuns = new Map();
export function cancelClaudeRun(id) {
    const runner = activeClaudeRuns.get(id);
    if (runner) runner.cancel();
}
export function listClaudeRuns() {
    return [...activeClaudeRuns.keys()];
}

async function runClaudeCode(task, cwd, permissionMode) {
    if (!task || !task.trim()) return { error: 'task is required' };

    const { ClaudeCodeRunner } = await import('./ClaudeCodeRunner');
    const settings = useSettingsStore.getState();
    const runner = new ClaudeCodeRunner();

    const id = `claude_${Date.now()}`;
    activeClaudeRuns.set(id, runner);

    // Stream stdout into the active tool message so the user sees live progress
    let toolMessageId = null;
    try {
        const { useActivityStore } = await import('./ActivityStore');
        const recent = useActivityStore.getState().activities;
        const lastWorking = [...recent].reverse().find(a => a.name === 'run_claude_code' && a.status === 'working');
        toolMessageId = lastWorking?.id || null;
    } catch { /* non-fatal */ }

    const updatePartial = async (partial) => {
        if (!toolMessageId) return;
        try {
            const { useMemoryStore } = await import('../memory/MemoryStore');
            useMemoryStore.getState().updateMessage(toolMessageId, { partial });
        } catch { /* non-fatal */ }
    };

    try {
        const result = await runner.run(task, {
            cwd: cwd || settings.claudeCodeCwd || undefined,
            permissionMode: permissionMode || settings.claudeCodePermissionMode || 'acceptEdits',
            binPath: settings.claudeCodePath || 'claude',
            onStdout: (_chunk, total) => updatePartial(total),
        });

        if (result.error) return { error: result.error, stderr: result.stderr };
        if (result.code !== 0) {
            return {
                error: `Claude Code exited with code ${result.code}`,
                stdout: result.stdout,
                stderr: result.stderr,
            };
        }
        return { stdout: result.stdout, stderr: result.stderr || undefined, code: 0 };
    } finally {
        activeClaudeRuns.delete(id);
    }
}

// ─── OpenAI Codex CLI ────────────────────────────────────────────────────────
const activeCodexRuns = new Map();
export function cancelCodexRun(id) {
    const runner = activeCodexRuns.get(id);
    if (runner) runner.cancel();
}
export function listCodexRuns() {
    return [...activeCodexRuns.keys()];
}

async function runCodex(task, cwd, approvalMode) {
    if (!task || !task.trim()) return { error: 'task is required' };

    const { CodexRunner } = await import('./CodexRunner');
    const settings = useSettingsStore.getState();
    const runner = new CodexRunner();

    const id = `codex_${Date.now()}`;
    activeCodexRuns.set(id, runner);

    let toolMessageId = null;
    try {
        const { useActivityStore } = await import('./ActivityStore');
        const recent = useActivityStore.getState().activities;
        const lastWorking = [...recent].reverse().find(a => a.name === 'run_codex' && a.status === 'working');
        toolMessageId = lastWorking?.id || null;
    } catch { /* non-fatal */ }

    const updatePartial = async (partial) => {
        if (!toolMessageId) return;
        try {
            const { useMemoryStore } = await import('../memory/MemoryStore');
            useMemoryStore.getState().updateMessage(toolMessageId, { partial });
        } catch { /* non-fatal */ }
    };

    try {
        const result = await runner.run(task, {
            cwd: cwd || settings.codexCwd || undefined,
            approvalMode: approvalMode || settings.codexApprovalMode || 'auto-edit',
            binPath: settings.codexPath || 'codex',
            onStdout: (_chunk, total) => updatePartial(total),
        });

        if (result.error) return { error: result.error, stderr: result.stderr };
        if (result.code !== 0) {
            return {
                error: `Codex exited with code ${result.code}`,
                stdout: result.stdout,
                stderr: result.stderr,
            };
        }
        return { stdout: result.stdout, stderr: result.stderr || undefined, code: 0 };
    } finally {
        activeCodexRuns.delete(id);
    }
}
