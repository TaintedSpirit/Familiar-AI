import electronDefault from 'electron';
const { app, BrowserWindow, screen, ipcMain, desktopCapturer } = electronDefault;
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Native modules must be loaded via createRequire
const activeWindow = require('active-win');
const { uIOhook } = require('uiohook-napi');
const discordBot = require('./discordBot.cjs');
const MemoryIpc = require('./memory/MemoryIpc.cjs');
import { mcpManager } from './MCPManager.mjs';

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
    ipcMain.handle('discord:start', (_e, token, companionChannels) => {
        discordBot.start(token, companionChannels, (msgData) => {
            // Forward incoming Discord messages to whichever renderer window is active
            const target = companionWindow || commandBarWindow;
            if (target && !target.isDestroyed()) {
                target.webContents.send('discord:message', msgData);
            }
        });
        return true;
    });

    ipcMain.handle('discord:stop', () => {
        discordBot.stop();
        return true;
    });

    ipcMain.handle('discord:update-channels', (_e, channels) => {
        discordBot.updateCompanionChannels(channels);
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
        await fs.writeFile(filePath, content, 'utf8');
        return true;
    });

    ipcMain.handle('fs-list-dir', async (_e, dirPath) => {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        return entries.map(e => ({ name: e.name, isDir: e.isDirectory() }));
    });

    ipcMain.handle('fs-run-command', async (_e, command) => {
        const { stdout, stderr } = await execPromise(command, { timeout: 30000 });
        return { stdout, stderr };
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
            const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1280, height: 720 } });
            return sources[0].thumbnail.toDataURL();
        } catch (e) { return null; }
    });

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
