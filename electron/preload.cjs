const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    send: (channel, ...args) => {
        // Whitelist channels
        let validChannels = ['window-controls', 'set-ignore-mouse-events', 'start-awareness', 'stop-awareness', 'drag-start', 'drag-end', 'set-always-on-top', 'resize-window'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, ...args);
        }
    },
    on: (channel, callback) => {
        const validChannels = ['global-hotkey-down', 'global-hotkey-up', 'global-mouse-down', 'global-mouse-up', 'context-update'];
        if (validChannels.includes(channel)) {
            // Strip event as it includes sender
            const subscription = (event, ...args) => callback(event, ...args);
            ipcRenderer.on(channel, subscription);
            return () => ipcRenderer.removeListener(channel, subscription);
        }
    },
    platform: process.platform,
    savePersona: (persona) => ipcRenderer.invoke('save-persona', persona),
    scrapeUrl: (url) => ipcRenderer.invoke('scrape-url', url),

    // Soul files
    readSoulFiles: () => ipcRenderer.invoke('soul-read-all'),
    writeSoulFile: (name, content) => ipcRenderer.invoke('soul-write', name, content),
    getSoulDir: () => ipcRenderer.invoke('soul-get-dir'),

    // Long-term memory (markdown + SQLite FTS5)
    memory: {
        save: (args) => ipcRenderer.invoke('memory:save', args),
        update: (args) => ipcRenderer.invoke('memory:update', args),
        delete: (args) => ipcRenderer.invoke('memory:delete', args),
        get: (args) => ipcRenderer.invoke('memory:get', args),
        search: (args) => ipcRenderer.invoke('memory:search', args),
        list: (args) => ipcRenderer.invoke('memory:list', args),
        rules: () => ipcRenderer.invoke('memory:rules'),
        stats: () => ipcRenderer.invoke('memory:stats'),
        getDir: () => ipcRenderer.invoke('memory:getDir'),
        rescan: () => ipcRenderer.invoke('memory:rescan'),
        onChanged: (callback) => {
            const subscription = (_event, payload) => callback(payload);
            ipcRenderer.on('memory:changed', subscription);
            return () => ipcRenderer.removeListener('memory:changed', subscription);
        }
    },

    // Project-root memory (Soul.md, User.md, memory.md, agent.md, daily logs, memory.db)
    projectMemory: {
        search: (args) => ipcRenderer.invoke('projectMemory:search', args),
        getDailyLog: (date) => ipcRenderer.invoke('projectMemory:getDailyLog', date),
        writeDailyLog: (date, content) => ipcRenderer.invoke('projectMemory:writeDailyLog', date, content),
        readRootFiles: () => ipcRenderer.invoke('projectMemory:readRootFiles'),
        writeRootFile: (name, content) => ipcRenderer.invoke('projectMemory:writeRootFile', name, content),
        getRoot: () => ipcRenderer.invoke('projectMemory:getRoot'),
        stats: () => ipcRenderer.invoke('projectMemory:stats'),
        rescan: () => ipcRenderer.invoke('projectMemory:rescan'),
    },

    // File system tools (for agent)
    readFile: (filePath) => ipcRenderer.invoke('fs-read-file', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('fs-write-file', filePath, content),
    listDir: (dirPath) => ipcRenderer.invoke('fs-list-dir', dirPath),
    runCommand: (command) => ipcRenderer.invoke('fs-run-command', command),

    // Manual Window Dragging (Fix for Compositor Freeze)
    windowDragStart: () => ipcRenderer.send('window-drag-start'),
    windowDragMove: (delta) => ipcRenderer.send('window-drag-move', delta),
    windowDragEnd: () => ipcRenderer.send('window-drag-end'),

    // Window Management
    toggleHUD: (visible) => ipcRenderer.send('toggle-hud', visible),

    // Context Awareness
    onContextUpdate: (callback) => {
        const subscription = (event, data) => callback(data);
        ipcRenderer.on('context-update', subscription);
        return () => ipcRenderer.removeListener('context-update', subscription);
    },
    captureContextSnapshot: () => ipcRenderer.invoke('capture-context-snapshot'),

    // Discord Bot Bridge
    discordStart: (token, companionChannels) => ipcRenderer.invoke('discord:start', token, companionChannels),
    discordStop: () => ipcRenderer.invoke('discord:stop'),
    discordUpdateChannels: (channels) => ipcRenderer.invoke('discord:update-channels', channels),
    discordReply: (channelId, content) => ipcRenderer.send('discord:reply', { channelId, content }),
    discordSetDmPolicy: (policy) => ipcRenderer.invoke('discord:set-dm-policy', policy),
    discordApproveUser: (userId) => ipcRenderer.invoke('discord:approve-user', userId),
    discordSetActivation: (mode) => ipcRenderer.invoke('discord:set-activation', mode),
    onDiscordMessage: (callback) => {
        const subscription = (_event, data) => callback(data);
        ipcRenderer.on('discord:message', subscription);
        return () => ipcRenderer.removeListener('discord:message', subscription);
    },

    // MCP Bridge
    mcp: {
        connect: (args) => ipcRenderer.invoke('mcp:connect', args),
        disconnect: (serverName) => ipcRenderer.invoke('mcp:disconnect', serverName),
        listTools: (serverName) => ipcRenderer.invoke('mcp:listTools', serverName),
        callTool: (args) => ipcRenderer.invoke('mcp:callTool', args),
    },

    // Global Input Hook
    onGlobalInput: (callback) => {
        const handlers = {
            keyDown: (e, d) => callback({ type: 'keydown', ...d }),
            keyUp: (e, d) => callback({ type: 'keyup', ...d }),
            mouseDown: (e, d) => callback({ type: 'mousedown', ...d }),
            mouseUp: (e, d) => callback({ type: 'mouseup', ...d })
        };

        ipcRenderer.on('global-hotkey-down', handlers.keyDown);
        ipcRenderer.on('global-hotkey-up', handlers.keyUp);
        ipcRenderer.on('global-mouse-down', handlers.mouseDown);
        ipcRenderer.on('global-mouse-up', handlers.mouseUp);

        return () => {
            ipcRenderer.removeListener('global-hotkey-down', handlers.keyDown);
            ipcRenderer.removeListener('global-hotkey-up', handlers.keyUp);
            ipcRenderer.removeListener('global-mouse-down', handlers.mouseDown);
            ipcRenderer.removeListener('global-mouse-up', handlers.mouseUp);
        };
    }
});
