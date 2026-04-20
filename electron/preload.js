const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    send: (channel, data) => {
        // Whitelist channels
        let validChannels = ['window-controls', 'set-ignore-mouse-events', 'resize-window', 'set-always-on-top', 'drag-start', 'drag-end', 'stop-tts'];
        if (validChannels.includes(channel)) {
            console.log(`[Preload] Forwarding IPC: ${channel}`);
            ipcRenderer.send(channel, data);
        } else {
            console.warn(`[Preload] Blocked IPC: ${channel}`);
        }
    },
    on: (channel, func) => {
        let validChannels = ['global-hotkey-down', 'global-hotkey-up', 'global-mouse-down', 'global-mouse-up'];
        if (validChannels.includes(channel)) {
            // Strip event as it includes sender
            const subscription = (event, ...args) => func(event, ...args);
            ipcRenderer.on(channel, subscription);
            return () => {
                ipcRenderer.removeListener(channel, subscription);
            };
        }
    },
    // Expose window drag methods for manual IPC dragging (to fix freeze)
    windowDragStart: () => ipcRenderer.send('window-drag-start'),
    windowDragMove: () => ipcRenderer.send('window-drag-move'),
    windowDragEnd: () => ipcRenderer.send('window-drag-end'),

    platform: process.platform
});
