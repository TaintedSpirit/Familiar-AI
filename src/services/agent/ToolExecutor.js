import { useContextStore } from '../context/ContextStore';
import { soulLoader } from '../soul/SoulLoader';
import { mcpLoader } from './MCPLoader';

export const toolExecutor = {
    async run(name, args) {
        try {
            if (name.startsWith('mcp_')) {
                return await mcpLoader.executeTool(name, args);
            }
            switch (name) {
                case 'web_search':       return await searchWeb(args.query);
                case 'scrape_url':       return await scrapeUrl(args.url);
                case 'get_screen_context': return await getScreenContext();
                case 'get_clipboard':    return await getClipboard();
                case 'read_file':        return await readFile(args.path);
                case 'write_file':       return await writeFile(args.path, args.content);
                case 'list_dir':         return await listDir(args.path);
                case 'run_command':      return await runCommand(args.command);
                case 'update_memory':    return await updateMemory(args.fact);
                default:                 return { error: `Unknown tool: ${name}` };
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
    return await window.electronAPI.runCommand(command);
}

async function updateMemory(fact) {
    await soulLoader.appendToMemory(fact);
    return { success: true, remembered: fact };
}
