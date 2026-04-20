const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    const mainWindow = new BrowserWindow({
        width: 400,
        height: 800,
        x: width - 420,
        y: 50,
        frame: false,           // Custom look
        transparent: true,      // Glassmorphism support
        hasShadow: true,
        alwaysOnTop: false,     // Can be toggled
        resizable: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        icon: path.join(__dirname, '../public/icon.png') // Assuming icon exists or fallback
    });

    // Load the app
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        // Open DevTools in dev mode
        // mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Handle window controls
    ipcMain.on('window-controls', (event, action) => {
        switch (action) {
            case 'minimize':
                mainWindow.minimize();
                break;
            case 'maximize':
                if (mainWindow.isMaximized()) mainWindow.unmaximize();
                else mainWindow.maximize();
                break;
            case 'close':
                mainWindow.close();
                break;
            case 'toggle-on-top':
                mainWindow.setAlwaysOnTop(!mainWindow.isAlwaysOnTop());
                break;
            case 'center':
                console.log('[Main] Centering window requested.');
                mainWindow.center();
                break;
        }
    });

    // Handle resizing (e.g. for Settings HUD)
    ipcMain.on('resize-window', (event, { width, height, yOffset }) => {
        console.log(`[Main] resize-window received: ${width}x${height}`); // DEBUG LOG
        if (!mainWindow) return;

        const bounds = mainWindow.getBounds();
        // logic: keep bottom center fixed-ish, or just center horizontally and grow up
        // Calculate new X to keep center aligned
        const centerX = bounds.x + (bounds.width / 2);
        const newX = Math.round(centerX - (width / 2));

        // Calculate new Y to grow UPWARDS (keeping bottom edge roughly same)
        const currentBottom = bounds.y + bounds.height;
        let newY = currentBottom - height;

        // Safety: Ensure we don't go off-screen top
        if (newY < 0) newY = 10;

        mainWindow.setBounds({
            x: newX,
            y: newY,
            width: width,
            height: height
        }, { animate: true });
    });

    // Window Drag Logic (Manual IPC to avoid Frame Freeze)
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    ipcMain.on('window-drag-start', (event) => {
        if (!mainWindow) return;
        isDragging = true;
        const cursorPos = screen.getCursorScreenPoint();
        const winBounds = mainWindow.getBounds();
        dragOffset = {
            x: cursorPos.x - winBounds.x,
            y: cursorPos.y - winBounds.y
        };
    });

    ipcMain.on('window-drag-move', (event) => {
        if (!mainWindow || !isDragging) return;
        const cursorPos = screen.getCursorScreenPoint();
        mainWindow.setBounds({
            x: cursorPos.x - dragOffset.x,
            y: cursorPos.y - dragOffset.y,
            width: mainWindow.getBounds().width,
            height: mainWindow.getBounds().height
        });
    });

    ipcMain.on('window-drag-end', (event) => {
        isDragging = false;
    });

    // --- Global Hotkeys (uIOhook) ---
    const { uIOhook, UiohookKey } = require('uiohook-napi');

    uIOhook.on('keydown', (e) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('global-hotkey-down', e);
        }
    });

    uIOhook.on('keyup', (e) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('global-hotkey-up', e);
        }
    });

    // Optional: Mouse hooks if needed for "click anywhere" detection, 
    // but be careful of performance. User only asked for hotkeys for now 
    // but the App.jsx expects mouse events too for some logic? 
    // App.jsx has: window.electronAPI.on('global-mouse-down', ...

    uIOhook.on('mousedown', (e) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('global-mouse-down', e);
        }
    });

    uIOhook.on('mouseup', (e) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('global-mouse-up', e);
        }
    });

    uIOhook.start();
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
