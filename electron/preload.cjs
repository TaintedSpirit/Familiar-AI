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
        searchHybrid: (args) => ipcRenderer.invoke('projectMemory:searchHybrid', args),
        setEmbeddingKey: (key) => ipcRenderer.invoke('projectMemory:setEmbeddingKey', key),
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
    mkdir: (dirPath) => ipcRenderer.invoke('fs-mkdir', dirPath),
    deleteFile: (filePath) => ipcRenderer.invoke('fs-delete-file', filePath),
    runCommand: (command) => ipcRenderer.invoke('fs-run-command', command),
    runHook: (hookPath, payload) => ipcRenderer.invoke('hooks:run', hookPath, payload),
    runCommandIn: (command, cwd) => ipcRenderer.invoke('fs-run-command-in', { command, cwd }),
    pickDirectory: () => ipcRenderer.invoke('dialog:open-dir'),

    // Claude Code CLI bridge (long-running, streaming)
    claudeCode: {
        start: (opts) => ipcRenderer.invoke('claude-code:start', opts),
        cancel: (pid) => ipcRenderer.invoke('claude-code:cancel', pid),
        onStdout: (callback) => {
            const sub = (_e, payload) => callback(payload);
            ipcRenderer.on('claude-code:stdout', sub);
            return () => ipcRenderer.removeListener('claude-code:stdout', sub);
        },
        onStderr: (callback) => {
            const sub = (_e, payload) => callback(payload);
            ipcRenderer.on('claude-code:stderr', sub);
            return () => ipcRenderer.removeListener('claude-code:stderr', sub);
        },
        onExit: (callback) => {
            const sub = (_e, payload) => callback(payload);
            ipcRenderer.on('claude-code:exit', sub);
            return () => ipcRenderer.removeListener('claude-code:exit', sub);
        },
    },

    // OpenAI Codex CLI bridge (long-running, streaming)
    codex: {
        start: (opts) => ipcRenderer.invoke('codex:start', opts),
        cancel: (pid) => ipcRenderer.invoke('codex:cancel', pid),
        onStdout: (callback) => {
            const sub = (_e, payload) => callback(payload);
            ipcRenderer.on('codex:stdout', sub);
            return () => ipcRenderer.removeListener('codex:stdout', sub);
        },
        onStderr: (callback) => {
            const sub = (_e, payload) => callback(payload);
            ipcRenderer.on('codex:stderr', sub);
            return () => ipcRenderer.removeListener('codex:stderr', sub);
        },
        onExit: (callback) => {
            const sub = (_e, payload) => callback(payload);
            ipcRenderer.on('codex:exit', sub);
            return () => ipcRenderer.removeListener('codex:exit', sub);
        },
    },

    // Manual Window Dragging (Fix for Compositor Freeze)
    windowDragStart: () => ipcRenderer.send('window-drag-start'),
    windowDragMove: (delta) => ipcRenderer.send('window-drag-move', delta),
    windowDragEnd: () => ipcRenderer.send('window-drag-end'),

    // Window Management
    setWindowMode: (mode) => ipcRenderer.send('set-window-mode', mode),
    toggleHUD: (visible) => ipcRenderer.send('toggle-hud', visible),
    getAllDisplays: () => ipcRenderer.invoke('get-displays'),
    moveCommandbarToDisplay: (displayId) => ipcRenderer.invoke('move-commandbar-to-display', displayId),

    // Context Awareness
    onContextUpdate: (callback) => {
        const subscription = (event, data) => callback(data);
        ipcRenderer.on('context-update', subscription);
        return () => ipcRenderer.removeListener('context-update', subscription);
    },
    captureContextSnapshot: () => ipcRenderer.invoke('capture-context-snapshot'),
    getCursorPosition: () => ipcRenderer.invoke('get-cursor-position'),

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

    // Webhook Gateway
    webhook: {
        start: (port, secret) => ipcRenderer.invoke('webhook:start', port, secret),
        stop: () => ipcRenderer.invoke('webhook:stop'),
        onMessage: (cb) => {
            const sub = (_, p) => cb(p);
            ipcRenderer.on('webhook:message', sub);
            return () => ipcRenderer.removeListener('webhook:message', sub);
        },
    },

    // MCP Bridge
    mcp: {
        connect: (args) => ipcRenderer.invoke('mcp:connect', args),
        disconnect: (serverName) => ipcRenderer.invoke('mcp:disconnect', serverName),
        listTools: (serverName) => ipcRenderer.invoke('mcp:listTools', serverName),
        callTool: (args) => ipcRenderer.invoke('mcp:callTool', args),

        // Phase 2 — resources & prompts
        listResources: (serverName) => ipcRenderer.invoke('mcp:listResources', serverName),
        readResource: (args) => ipcRenderer.invoke('mcp:readResource', args),
        listPrompts: (serverName) => ipcRenderer.invoke('mcp:listPrompts', serverName),
        getPrompt: (args) => ipcRenderer.invoke('mcp:getPrompt', args),

        // Phase 3 — introspection / status
        list: () => ipcRenderer.invoke('mcp:list'),
        getStatus: (serverName) => ipcRenderer.invoke('mcp:getStatus', serverName),
        onStatus: (cb) => {
            const sub = (_e, payload) => cb(payload);
            ipcRenderer.on('mcp:status', sub);
            return () => ipcRenderer.removeListener('mcp:status', sub);
        },
    },

    // Forge — Recursive Self-Evolution
    forge: {
        createSandbox:   (args) => ipcRenderer.invoke('forge:create-sandbox', args),
        destroySandbox:  (args) => ipcRenderer.invoke('forge:destroy-sandbox', args),
        diffSandbox:     (args) => ipcRenderer.invoke('forge:diff-sandbox', args),
        runBenchmark:    (args) => ipcRenderer.invoke('forge:run-benchmark', args),
        applyEvolution:  (args) => ipcRenderer.invoke('forge:apply-evolution', args),
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
