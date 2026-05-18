// VSCode sets ELECTRON_RUN_AS_NODE=1 for child processes; the npm script clears it.
// Electron 40 ESM: APIs come through the default import of 'electron'
import electronDefault from 'electron';
const { app, BrowserWindow, screen, ipcMain, desktopCapturer, dialog } = electronDefault;
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { mcpManager } from './MCPManager.mjs';

const execPromise = promisify(exec);
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.stdout.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });
process.stderr.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });

// Native modules must be loaded via createRequire
const activeWindow = require('active-win');
const { uIOhook } = require('uiohook-napi');
const discordBot = require('./discordBot.cjs');
const MemoryIpc = require('./memory/MemoryIpc.cjs');
const { WebhookGateway } = require('./WebhookGateway.cjs');
const { registerForgeIpc } = require('./forgeMerge.cjs');

const webhookGateway = new WebhookGateway();

const isDev = !app.isPackaged;

let companionWindow;
let commandBarWindow;

function createCompanionWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    // Full-screen transparent overlay so the companion can be dragged anywhere
    companionWindow = new BrowserWindow({
        width,
        height,
        x: 0,
        y: 0,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: false,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        icon: path.join(__dirname, '../public/icon.png')
    });

    if (isDev) {
        companionWindow.loadURL('http://127.0.0.1:5173/#/companion');
    } else {
        companionWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'companion' });
    }

    companionWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    companionWindow.setIgnoreMouseEvents(true, { forward: true }); // click-through by default

    companionWindow.webContents.on('did-fail-load', (_e, code, desc) => {
        console.error(`[Companion] Load Failed: ${code} - ${desc}`);
    });
}

function createCommandBarWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    // Full-screen transparent overlay so the bar can be dragged anywhere
    commandBarWindow = new BrowserWindow({
        width,
        height,
        x: 0,
        y: 0,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        hasShadow: false,
        skipTaskbar: true,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    if (isDev) {
        commandBarWindow.loadURL('http://127.0.0.1:5173/#/commandbar');
    } else {
        commandBarWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'commandbar' });
    }

    commandBarWindow.setIgnoreMouseEvents(true, { forward: true }); // click-through by default

    commandBarWindow.webContents.on('did-fail-load', (_e, code, desc) => {
        console.error(`[CommandBar] Load Failed: ${code} - ${desc}`);
    });
}


let awarenessInterval = null;

// ─── Soul File Helpers ───────────────────────────────────────────────────────

function getSoulDir() {
    // Soul files live inside the unified memory root so they're auto-indexed by the watcher.
    return path.join(app.getPath('userData'), 'familiar-memory');
}

async function migrateLegacySoulDir() {
    const legacy = path.join(app.getPath('userData'), 'soul');
    const target = getSoulDir();
    if (!existsSync(legacy)) return;
    try {
        mkdirSync(target, { recursive: true });
        for (const name of ['soul.md', 'memory.md', 'goals.md']) {
            const src = path.join(legacy, name);
            const dst = path.join(target, name);
            if (existsSync(src) && !existsSync(dst)) {
                const content = await fs.readFile(src, 'utf8');
                await fs.writeFile(dst, content, 'utf8');
            }
        }
        const legacySkills = path.join(legacy, 'skills');
        const targetSkills = path.join(target, 'skills');
        if (existsSync(legacySkills)) {
            mkdirSync(targetSkills, { recursive: true });
            const files = await fs.readdir(legacySkills);
            for (const f of files.filter(f => f.endsWith('.md'))) {
                const dst = path.join(targetSkills, f);
                if (!existsSync(dst)) {
                    const content = await fs.readFile(path.join(legacySkills, f), 'utf8');
                    await fs.writeFile(dst, content, 'utf8');
                }
            }
        }
    } catch (e) {
        console.warn('[main] soul migration skipped:', e.message);
    }
}

const SOUL_DEFAULTS = {
    'soul.md': `# Soul

**Name:** Antigravity
**Personality:** Curious, direct, warm. Never sycophantic.
**Values:** Honesty, efficiency, user autonomy.
**Tone:** Conversational but precise. Plain language.

## Constraints
- Never pretend to be human when sincerely asked
- Always confirm before taking irreversible actions
- Max 2-3 sentences for standard replies unless asked for detail
`,
    'memory.md': `# Long-Term Memory\n\n_This file is updated automatically when you ask the agent to remember something._\n`,
    'goals.md': `# Standing Goals\n\n_Add persistent directives here. The agent follows these every session._\n`
};

async function ensureSoulDir() {
    const soulDir = getSoulDir();
    if (!existsSync(soulDir)) mkdirSync(soulDir, { recursive: true });
    const skillsDir = path.join(soulDir, 'skills');
    if (!existsSync(skillsDir)) mkdirSync(skillsDir, { recursive: true });
    for (const [name, content] of Object.entries(SOUL_DEFAULTS)) {
        const filePath = path.join(soulDir, name);
        if (!existsSync(filePath)) await fs.writeFile(filePath, content, 'utf8');
    }
}

app.whenReady().then(async () => {
    // Setup SQLite memory IPC
    const userDataDir = app.getPath('userData');
    const projectRoot = process.cwd();
    MemoryIpc.register({ userDataDir, getActiveWindow: () => companionWindow, projectRoot });

    // Setup MCP Handlers
    mcpManager.registerIpcHandlers(ipcMain);

    // Setup Forge IPC (sandbox lifecycle, diff, benchmarks, merge)
    registerForgeIpc(ipcMain, dialog);

    createCompanionWindow();
    createCommandBarWindow();

    // ─── Memory System ───────────────────────────────────────────────────────
    await migrateLegacySoulDir();
    try {
        await MemoryIpc.register({
            userDataDir: app.getPath('userData'),
            projectRoot: path.join(__dirname, '..'),
            getActiveWindow: () => companionWindow && !companionWindow.isDestroyed() ? companionWindow : commandBarWindow
        });
    } catch (e) {
        console.error('[main] Memory system failed to initialize:', e);
    }

    // ─── Soul File IPC ───────────────────────────────────────────────────────
    ipcMain.handle('soul-read-all', async () => {
        await ensureSoulDir();
        const soulDir = getSoulDir();
        const result = {};
        for (const name of ['soul.md', 'memory.md', 'goals.md']) {
            try { result[name] = await fs.readFile(path.join(soulDir, name), 'utf8'); }
            catch { result[name] = ''; }
        }
        try {
            const skillsDir = path.join(soulDir, 'skills');
            const files = await fs.readdir(skillsDir);
            result.skills = {};
            for (const f of files.filter(f => f.endsWith('.md'))) {
                result.skills[f] = await fs.readFile(path.join(skillsDir, f), 'utf8');
            }
        } catch { result.skills = {}; }
        return result;
    });

    ipcMain.handle('soul-write', async (_e, name, content) => {
        await ensureSoulDir();
        const allowed = ['soul.md', 'memory.md', 'goals.md'];
        const isSkill = name.startsWith('skills/') && name.endsWith('.md') && !name.includes('..');
        if (!allowed.includes(name) && !isSkill) throw new Error(`Disallowed soul file: ${name}`);
        await fs.writeFile(path.join(getSoulDir(), name), content, 'utf8');
        return true;
    });

    ipcMain.handle('soul-get-dir', () => getSoulDir());

    // ─── Discord Bot IPC ─────────────────────────────────────────────────────
    ipcMain.handle('discord:start', async (_e, token, companionChannels) => {
        const sendStatus = (status) => {
            const target = companionWindow || commandBarWindow;
            if (target && !target.isDestroyed()) {
                target.webContents.send('discord:status', { status });
            }
        };
        try {
            await discordBot.start(
                token,
                companionChannels,
                (msgData) => {
                    // Forward incoming Discord messages to whichever renderer window is active
                    const target = companionWindow || commandBarWindow;
                    if (target && !target.isDestroyed()) {
                        target.webContents.send('discord:message', msgData);
                    }
                },
                sendStatus
            );
            return { ok: true };
        } catch (err) {
            console.error('[Discord] Start failed:', err.message);
            return { ok: false, error: err.message };
        }
    });

    ipcMain.handle('discord:stop', () => {
        discordBot.stop();
        return true;
    });

    ipcMain.handle('discord:update-channels', (_e, channels) => {
        discordBot.updateCompanionChannels(channels);
        return true;
    });

    // ─── Webhook Gateway IPC ─────────────────────────────────────────────────
    ipcMain.handle('webhook:start', (_e, port, secret) => {
        const target = companionWindow || commandBarWindow;
        webhookGateway.start(port || 3001, target, secret || null);
        return true;
    });

    ipcMain.handle('webhook:stop', () => {
        webhookGateway.stop();
        return true;
    });

    ipcMain.on('discord:reply', (_e, { channelId, content }) => {
        discordBot.sendReply(channelId, content);
    });

    ipcMain.handle('discord:set-dm-policy', (_e, policy) => {
        discordBot.setDmPolicy(policy);
        return true;
    });

    ipcMain.handle('discord:approve-user', (_e, userId) => {
        discordBot.approveUser(userId);
        return true;
    });

    ipcMain.handle('discord:set-activation', (_e, mode) => {
        discordBot.setActivationMode(mode);
        return true;
    });

    // ─── File System Tool IPC ────────────────────────────────────────────────
    ipcMain.handle('fs-read-file', async (_e, filePath) => {
        return await fs.readFile(filePath, 'utf8');
    });

    ipcMain.handle('fs-write-file', async (_e, filePath, content) => {
        // Auto-mkdir parent so callers don't have to think about it.
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, 'utf8');
        return true;
    });

    ipcMain.handle('fs-list-dir', async (_e, dirPath) => {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        return entries.map(e => ({ name: e.name, isDir: e.isDirectory() }));
    });

    ipcMain.handle('fs-mkdir', async (_e, dirPath) => {
        await fs.mkdir(dirPath, { recursive: true });
        return true;
    });

    ipcMain.handle('fs-delete-file', async (_e, filePath) => {
        await fs.rm(filePath, { force: true });
        return true;
    });

    // Shell hook runner — executes a user-provided JS hook script via Node,
    // passing a JSON payload on stdin and returning the parsed stdout JSON.
    ipcMain.handle('hooks:run', async (_e, hookPath, payload) => {
        try {
            const { execFileSync } = require('child_process');
            const input = JSON.stringify(payload);
            const stdout = execFileSync(process.execPath, [hookPath], {
                input,
                encoding: 'utf8',
                timeout: 5000,
                maxBuffer: 1024 * 64,
            });
            return stdout.trim() ? JSON.parse(stdout.trim()) : { action: 'allow' };
        } catch (e) {
            console.warn('[HookRunner] Hook failed:', hookPath, e.message);
            return { action: 'allow' };
        }
    });

    ipcMain.handle('fs-run-command', async (_e, command) => {
        const { stdout, stderr } = await execPromise(command, { timeout: 30000 });
        return { stdout, stderr };
    });

    ipcMain.handle('fs-run-command-in', async (_e, { command, cwd }) => {
        try {
            const { stdout, stderr } = await execPromise(command, { cwd, timeout: 10000 });
            return { stdout: stdout.trim(), stderr: stderr.trim() };
        } catch (err) {
            return { stdout: '', stderr: err.message, error: true };
        }
    });

    ipcMain.handle('dialog:open-dir', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        const result = await dialog.showOpenDialog(win, {
            properties: ['openDirectory'],
            title: 'Select Project Folder',
        });
        return result.canceled ? null : result.filePaths[0];
    });

    // ─── Claude Code streaming spawn ─────────────────────────────────────────
    // Long-running subprocess (minutes); cannot reuse 30s exec channel.
    const claudeCodeProcs = new Map(); // pid → ChildProcess

    ipcMain.handle('claude-code:start', async (event, { task, cwd, permissionMode, binPath, viaStdin }) => {
        if (!task) return { error: 'task is required' };
        const bin = binPath || 'claude';
        const mode = permissionMode || 'acceptEdits';
        // viaStdin: pipe `task` over stdin instead of passing it as a positional
        // arg. Required for multi-line prompts on Windows because cmd.exe treats
        // newlines in argv as command terminators (truncates the prompt).
        const args = viaStdin
            ? ['--print', '--permission-mode', mode]
            : ['--print', '--permission-mode', mode, task];
        let child;
        try {
            child = spawn(bin, args, {
                cwd: cwd || undefined,
                shell: process.platform === 'win32', // .cmd shim on Windows
                env: process.env,
                stdio: viaStdin ? ['pipe', 'pipe', 'pipe'] : undefined,
            });
        } catch (e) {
            return { error: `spawn failed: ${e.message}` };
        }

        if (viaStdin && child.stdin) {
            try {
                child.stdin.write(task);
                child.stdin.end();
            } catch (e) {
                // Surface, but don't kill the spawn — let the exit handler report it
                console.warn('[claude-code:start] stdin write failed:', e.message);
            }
        }

        const pid = child.pid;
        if (!pid) return { error: 'spawn produced no pid' };
        claudeCodeProcs.set(pid, child);

        const sender = event.sender;
        const send = (channel, payload) => {
            if (!sender.isDestroyed()) sender.send(channel, payload);
        };

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (buf) => {
            const chunk = buf.toString('utf8');
            stdout += chunk;
            send('claude-code:stdout', { pid, chunk });
        });

        child.stderr.on('data', (buf) => {
            const chunk = buf.toString('utf8');
            stderr += chunk;
            send('claude-code:stderr', { pid, chunk });
        });

        child.on('error', (err) => {
            claudeCodeProcs.delete(pid);
            send('claude-code:exit', { pid, code: -1, signal: null, stdout, stderr: stderr + `\nspawn error: ${err.message}`, error: err.message });
        });

        child.on('close', (code, signal) => {
            claudeCodeProcs.delete(pid);
            send('claude-code:exit', { pid, code, signal, stdout, stderr });
        });

        return { pid };
    });

    ipcMain.handle('claude-code:cancel', async (_e, pid) => {
        const child = claudeCodeProcs.get(pid);
        if (!child) return { ok: false, reason: 'not running' };
        try {
            // SIGTERM on POSIX, taskkill on Windows
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', String(pid), '/f', '/t']);
            } else {
                child.kill('SIGTERM');
            }
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: e.message };
        }
    });

    // ─── Claude CLI auth helpers (subscription provider) ─────────────────────
    // `claude /login` opens an OAuth browser flow and needs a real TTY, so we
    // spawn it in a visible terminal window rather than reusing claude-code:start.
    ipcMain.handle('claude-code:login', async (_e, { binPath } = {}) => {
        const bin = (binPath && String(binPath).trim()) || 'claude';
        try {
            if (process.platform === 'win32') {
                // `start` is a cmd builtin; the empty "" is the window title arg.
                spawn('cmd.exe', ['/c', 'start', '""', 'cmd', '/k', `${bin} /login`], {
                    detached: true,
                    stdio: 'ignore',
                    shell: false,
                }).unref();
            } else if (process.platform === 'darwin') {
                const script = `tell application "Terminal" to do script "${bin} /login"`;
                spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
            } else {
                // Best-effort linux fallback
                spawn('x-terminal-emulator', ['-e', `${bin} /login`], { detached: true, stdio: 'ignore' }).unref();
            }
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });

    // Lightweight, one-shot status probe — runs `claude auth status` and reports
    // whether the user is logged in. Called by Settings to drive the green/red dot.
    ipcMain.handle('claude-code:auth-status', async (_e, { binPath } = {}) => {
        const bin = (binPath && String(binPath).trim()) || 'claude';
        const command = process.platform === 'win32' ? `${bin} auth status` : `"${bin}" auth status`;
        try {
            const { stdout, stderr } = await execPromise(command, { timeout: 8000, windowsHide: true });
            const blob = `${stdout}\n${stderr}`.toLowerCase();
            const loggedIn = /logged ?in|authenticated|subscription|account:/i.test(blob)
                && !/not (logged|authenticated)|no.*account|please.*login/i.test(blob);
            return { ok: true, loggedIn, output: (stdout + stderr).trim() };
        } catch (err) {
            return { ok: false, loggedIn: false, error: err.message, output: (err.stdout || '') + (err.stderr || '') };
        }
    });

    // Cleanup on app quit — never leave Claude subprocesses orphaned
    app.on('before-quit', () => {
        for (const child of claudeCodeProcs.values()) {
            try { child.kill('SIGTERM'); } catch { /* ignore */ }
        }
        claudeCodeProcs.clear();
        for (const child of codexProcs.values()) {
            try { child.kill('SIGTERM'); } catch { /* ignore */ }
        }
        codexProcs.clear();
    });

    // ─── OpenAI Codex CLI streaming spawn ────────────────────────────────────
    // Long-running subprocess (minutes); cannot reuse 30s exec channel.
    const codexProcs = new Map(); // pid → ChildProcess

    ipcMain.handle('codex:start', async (event, { task, cwd, approvalMode, binPath }) => {
        if (!task) return { error: 'task is required' };
        const bin = binPath || 'codex';
        const mode = approvalMode || 'auto-edit';
        const args = ['--approval-mode', mode, task];
        let child;
        try {
            child = spawn(bin, args, {
                cwd: cwd || undefined,
                shell: process.platform === 'win32',
                env: process.env,
            });
        } catch (e) {
            return { error: `spawn failed: ${e.message}` };
        }

        const pid = child.pid;
        if (!pid) return { error: 'spawn produced no pid' };
        codexProcs.set(pid, child);

        const sender = event.sender;
        const send = (channel, payload) => {
            if (!sender.isDestroyed()) sender.send(channel, payload);
        };

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (buf) => {
            const chunk = buf.toString('utf8');
            stdout += chunk;
            send('codex:stdout', { pid, chunk });
        });

        child.stderr.on('data', (buf) => {
            const chunk = buf.toString('utf8');
            stderr += chunk;
            send('codex:stderr', { pid, chunk });
        });

        child.on('error', (err) => {
            codexProcs.delete(pid);
            send('codex:exit', { pid, code: -1, signal: null, stdout, stderr: stderr + `\nspawn error: ${err.message}`, error: err.message });
        });

        child.on('close', (code, signal) => {
            codexProcs.delete(pid);
            send('codex:exit', { pid, code, signal, stdout, stderr });
        });

        return { pid };
    });

    ipcMain.handle('codex:cancel', async (_e, pid) => {
        const child = codexProcs.get(pid);
        if (!child) return { ok: false, reason: 'not running' };
        try {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', String(pid), '/f', '/t']);
            } else {
                child.kill('SIGTERM');
            }
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: e.message };
        }
    });

    ipcMain.on('window-controls', (event, action) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return;
        if (action === 'close') win.close();
        if (action === 'minimize') win.minimize();
    });

    ipcMain.on('resize-window', (event, { width: newW, height: newH, yOffset = 0 }) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win || win.isDestroyed()) return;

        const { height: screenH } = screen.getPrimaryDisplay().workAreaSize;
        const currentPos = win.getPosition();

        win.setSize(newW, newH, false);
        win.setPosition(currentPos[0], screenH - newH - yOffset, false);
        win.setIgnoreMouseEvents(false);
    });

    ipcMain.on('set-window-mode', (event, mode) => {
        if (!companionWindow || companionWindow.isDestroyed()) return;

        companionWindow.setResizable(true);

        if (mode === 'compact') {
            companionWindow.setSize(350, 450, false);
            // In compact mode, we need the background to receive mouse events for dragging
            companionWindow.setIgnoreMouseEvents(false);
        } else {
            const { width, height } = screen.getPrimaryDisplay().workAreaSize;
            companionWindow.setSize(width, height, false);
            companionWindow.setPosition(0, 0, false);
            // In full screen mode, click-through unless hovering over an active element
            companionWindow.setIgnoreMouseEvents(true, { forward: true });
        }
        
        companionWindow.setResizable(false);
    });

    ipcMain.handle('get-displays', () => {
        const primary = screen.getPrimaryDisplay();
        return screen.getAllDisplays().map(d => ({
            id: d.id,
            label: d.label || `Display ${d.id}`,
            workArea: d.workArea,
            primary: d.id === primary.id,
        }));
    });

    ipcMain.handle('move-commandbar-to-display', (_event, displayId) => {
        if (!commandBarWindow || commandBarWindow.isDestroyed()) return { success: false };
        const displays = screen.getAllDisplays();
        const target = displays.find(d => d.id === displayId) ?? screen.getPrimaryDisplay();
        const { x, y, width, height } = target.workArea;
        commandBarWindow.setBounds({ x, y, width, height });
        return { success: true };
    });

    let dragInterval = null;

    ipcMain.on('window-drag-start', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win || win.isDestroyed()) return;

        if (dragInterval) clearInterval(dragInterval);

        const { x: cursorX, y: cursorY } = screen.getCursorScreenPoint();
        const [winX, winY] = win.getPosition();
        const offsetX = cursorX - winX;
        const offsetY = cursorY - winY;

        dragInterval = setInterval(() => {
            if (win.isDestroyed()) {
                clearInterval(dragInterval);
                return;
            }
            const { x, y } = screen.getCursorScreenPoint();
            win.setPosition(x - offsetX, y - offsetY, false);
        }, 16); // ~60fps manual drag
    });

    ipcMain.on('window-drag-end', () => {
        if (dragInterval) {
            clearInterval(dragInterval);
            dragInterval = null;
        }
    });

    ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return;
        win.setIgnoreMouseEvents(ignore, options);
    });

    ipcMain.handle('scrape-url', async (event, url) => {
        try {
            const res = await fetch(url);
            const text = await res.text();
            return text.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "").substring(0, 10000);
        } catch (e) {
            return null;
        }
    });

    ipcMain.on('start-awareness', () => {
        if (awarenessInterval) return;
        awarenessInterval = setInterval(async () => {
            try {
                const result = await activeWindow();
                if (result) {
                    const data = { app: result.owner.name, title: result.title, url: result.url || null };
                    [companionWindow, commandBarWindow].forEach(win => {
                        if (win && !win.isDestroyed()) win.webContents.send('context-update', data);
                    });
                }
            } catch (e) { }
        }, 5000);
    });

    ipcMain.on('stop-awareness', () => {
        if (awarenessInterval) clearInterval(awarenessInterval);
        awarenessInterval = null;
    });

    ipcMain.handle('capture-context-snapshot', async () => {
        try {
            // 1. Hide ALL windows
            const allWindows = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed() && w.isVisible());
            allWindows.forEach(w => w.hide());

            // 2. Focus Verification Loop
            // We wait until the OS stops reporting "ai-familiar" as the foreground app.
            let metadata = { app: 'Unknown', title: 'Unknown', url: null };
            let aw = null;
            
            for (let i = 0; i < 5; i++) {
                try {
                    aw = await activeWindow();
                    const appName = aw?.owner?.name?.toLowerCase() || '';
                    // If it's not us or an empty state, we found the target!
                    if (aw && !appName.includes('ai-familiar') && !appName.includes('electron')) {
                        metadata = {
                            app: aw.owner.name,
                            title: aw.title,
                            url: aw.url || null,
                            bounds: aw.bounds
                        };
                        console.log(`[Main] Found target window after ${i * 100}ms: ${metadata.app}`);
                        break;
                    }
                } catch (err) { }
                await new Promise(r => setTimeout(r, 100)); // Polling interval
            }

            // 3. Capture the actual screenshot now that we are sure the focus has shifted
            const sourcesResult = await Promise.allSettled([
                desktopCapturer.getSources({ 
                    types: ['screen'], 
                    thumbnailSize: { width: 1280, height: 720 },
                    fetchWindowIcons: false 
                })
            ]);

            // 4. Restore ALL windows
            allWindows.forEach(w => w.show());

            const sources = sourcesResult[0].status === 'fulfilled' ? sourcesResult[0].value : null;
            if (!sources || sources.length === 0) {
                console.warn('[Main] desktopCapturer returned no sources');
                return null;
            }

            const thumbnail = sources[0].thumbnail;
            if (!thumbnail || thumbnail.isEmpty()) {
                console.warn('[Main] desktopCapturer thumbnail is empty');
                return null;
            }

            const screenshot = thumbnail.toDataURL();
            console.log(`[Main] Capture Success: "${metadata.title}" (${metadata.app})`);
            
            return { screenshot, metadata };
        } catch (e) {
            console.error('[Main] capture-context-snapshot error:', e);
            // Emergency restore
            BrowserWindow.getAllWindows().forEach(w => {
                if (!w.isDestroyed()) w.show();
            });
            return null;
        }
    });

    ipcMain.handle('get-cursor-position', () => screen.getCursorScreenPoint());

    ipcMain.on('set-always-on-top', (_event, shouldBeOnTop) => {
        [companionWindow, commandBarWindow].forEach(win => {
            if (win && !win.isDestroyed()) win.setAlwaysOnTop(shouldBeOnTop, shouldBeOnTop ? 'screen-saver' : 'normal');
        });
    });

    ipcMain.on('stop-tts', (_event) => {
        [companionWindow, commandBarWindow].forEach(win => {
            if (win && !win.isDestroyed()) win.webContents.send('stop-tts');
        });
    });

    let dragStartMouse = { x: 0, y: 0 };
    let dragStartWindow = { x: 0, y: 0 };

    ipcMain.on('window-drag-start', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win || win.isDestroyed()) return;

        const mouse = screen.getCursorScreenPoint();
        const winPos = win.getPosition();

        dragStartMouse = mouse;
        dragStartWindow = { x: winPos[0], y: winPos[1] };

        uIOhook.stop();
        win.setAlwaysOnTop(false, 'normal');
    });

    ipcMain.on('window-drag-move', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win || win.isDestroyed()) return;

        const mouse = screen.getCursorScreenPoint();
        win.setPosition(dragStartWindow.x + (mouse.x - dragStartMouse.x), dragStartWindow.y + (mouse.y - dragStartMouse.y), false);
    });

    ipcMain.on('window-drag-end', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win || win.isDestroyed()) return;

        uIOhook.start();
        win.setAlwaysOnTop(true, 'screen-saver');
    });

    uIOhook.on('keydown', (e) => {
        const data = { keycode: e.keycode, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, mask: e.mask };
        [companionWindow, commandBarWindow].forEach(win => {
            if (win && !win.isDestroyed()) win.webContents.send('global-hotkey-down', data);
        });
    });

    uIOhook.on('keyup', (e) => {
        [companionWindow, commandBarWindow].forEach(win => {
            if (win && !win.isDestroyed()) win.webContents.send('global-hotkey-up', { keycode: e.keycode });
        });
    });

    uIOhook.on('mousedown', (e) => {
        let browserButton = -1;
        if (e.button === 1) browserButton = 0;
        else if (e.button === 2) browserButton = 2;
        else if (e.button === 3) browserButton = 1;
        [companionWindow, commandBarWindow].forEach(win => {
            if (win && !win.isDestroyed()) win.webContents.send('global-mouse-down', { button: browserButton });
        });
    });

    uIOhook.on('mouseup', (e) => {
        let browserButton = -1;
        if (e.button === 1) browserButton = 0;
        else if (e.button === 2) browserButton = 2;
        else if (e.button === 3) browserButton = 1;
        [companionWindow, commandBarWindow].forEach(win => {
            if (win && !win.isDestroyed()) win.webContents.send('global-mouse-up', { button: browserButton });
        });
    });

    uIOhook.start();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', async () => {
    try { await MemoryIpc.close(); } catch (_) { }
});
