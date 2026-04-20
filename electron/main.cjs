const { app, BrowserWindow, screen, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const activeWindow = require('active-win');
const { uIOhook, UiohookKey } = require('uiohook-napi');

const isDev = !app.isPackaged;

let companionWindow;
let commandBarWindow;

function createCompanionWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    companionWindow = new BrowserWindow({
        width: 280,
        height: 380,
        x: Math.floor(width / 2) - 140,
        y: 100,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        icon: path.join(__dirname, '../public/icon.png')
    });

    const url = isDev ? 'http://127.0.0.1:5173/#/companion' : `file://${path.join(__dirname, '../dist/index.html')}#companion`;

    if (isDev) {
        companionWindow.loadURL(url);
    } else {
        companionWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'companion' });
    }

    companionWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    companionWindow.webContents.on('did-fail-load', (e, code, desc) => {
        console.error(`[Companion] Load Failed: ${code} - ${desc}`);
    });
}

function createCommandBarWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    commandBarWindow = new BrowserWindow({
        width: 800,
        height: 250,
        x: Math.floor(width / 2) - 400,
        y: height - 250,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        hasShadow: false,
        skipTaskbar: true, // Only Companion shows in taskbar
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const url = isDev ? 'http://127.0.0.1:5173/#/commandbar' : `file://${path.join(__dirname, '../dist/index.html')}#commandbar`;

    if (isDev) {
        commandBarWindow.loadURL(url);
    } else {
        commandBarWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'commandbar' });
    }

    commandBarWindow.webContents.on('did-fail-load', (e, code, desc) => {
        console.error(`[CommandBar] Load Failed: ${code} - ${desc}`);
    });
}


let awarenessInterval = null;

app.whenReady().then(() => {
    createCompanionWindow();
    createCommandBarWindow();


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

        // Maintain center X, adjust Y based on bottom height
        win.setSize(newW, newH, false);
        win.setPosition(currentPos[0], screenH - newH - yOffset, false);

        // CRITICAL: Force interactivity when resizing (fixing "invisible wall")
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

    ipcMain.on('set-always-on-top', (event, shouldBeOnTop) => {
        [companionWindow, commandBarWindow].forEach(win => {
            if (win && !win.isDestroyed()) win.setAlwaysOnTop(shouldBeOnTop, shouldBeOnTop ? 'screen-saver' : 'normal');
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
