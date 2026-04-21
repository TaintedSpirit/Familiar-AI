import { useContextStore } from '../context/ContextStore';
import { soulLoader } from '../soul/SoulLoader';
import { mcpLoader } from './MCPLoader';
import { dockerSandbox } from './DockerSandbox';
import { cronEngine } from '../watchers/CronEngine';
import { useSettingsStore } from '../settings/SettingsStore';
import { toolApprovalGate } from './ToolApprovalGate';
import { agentSpawner } from './AgentSpawner';

export const toolExecutor = {
    async run(name, args) {
        try {
            // Gate sensitive tools before execution
            const approved = await toolApprovalGate.requestApproval(name, args);
            if (!approved) return { error: `Tool "${name}" was denied by the user.` };

            if (name.startsWith('mcp_')) {
                return await mcpLoader.executeTool(name, args);
            }
            switch (name) {
                case 'web_search':          return await searchWeb(args.query);
                case 'scrape_url':          return await scrapeUrl(args.url);
                case 'get_screen_context':  return await getScreenContext();
                case 'get_clipboard':       return await getClipboard();
                case 'read_file':           return await readFile(args.path);
                case 'write_file':          return await writeFile(args.path, args.content);
                case 'list_dir':            return await listDir(args.path);
                case 'run_command':         return await runCommand(args.command);
                case 'execute_sandboxed':   return await executeSandboxed(args.command, args.language);
                case 'update_memory':       return await updateMemory(args.fact);
                case 'generate_image':      return await generateImage(args.prompt, args.size);
                case 'schedule_task':       return await scheduleTask(args.cron, args.intent, args.id);
                case 'remove_scheduled_task': return await removeScheduledTask(args.id);
                case 'spawn_agent':         return await spawnAgent(args.task, args.label);
                case 'list_spawns':         return agentSpawner.list();
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
        const snapshot = await useContextStore.getState().captureContext();
        const { activeApp, activeTitle } = useContextStore.getState();
        return {
            app: activeApp || 'Unknown',
            title: activeTitle || 'Unknown',
            hasScreenshot: !!snapshot
        };
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

async function readFile(filePath) {
    if (!window.electronAPI?.readFile) return { error: 'readFile IPC not available' };
    return await window.electronAPI.readFile(filePath);
}

async function writeFile(filePath, content) {
    if (!window.electronAPI?.writeFile) return { error: 'writeFile IPC not available' };
    await window.electronAPI.writeFile(filePath, content);
    return { success: true, path: filePath };
}

async function listDir(dirPath) {
    if (!window.electronAPI?.listDir) return { error: 'listDir IPC not available' };
    return await window.electronAPI.listDir(dirPath);
}

async function runCommand(command) {
    if (!window.electronAPI?.runCommand) return { error: 'runCommand IPC not available' };

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

async function spawnAgent(task, label) {
    if (!task) return { error: 'task is required' };
    return agentSpawner.spawn(task, label, async (outcome) => {
        const { useWatcherStore } = await import('../watchers/WatcherStore');
        const summary = outcome.result?.reply || outcome.result?.content || 'Task complete.';
        useWatcherStore.getState().addNotification(
            `[Agent: ${outcome.label || task.slice(0, 40)}] ${summary.slice(0, 120)} (${outcome.elapsed}s)`,
            'medium'
        );
    });
}
