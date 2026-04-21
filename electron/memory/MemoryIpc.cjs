const { ipcMain } = require('electron');
const MemoryService = require('./MemoryService.cjs');
const MemoryWatcher = require('./MemoryWatcher.cjs');
const ProjectMemoryService = require('./ProjectMemoryService.cjs');

let service = null;
let watcher = null;
let projectMemory = null;

function broadcast(getWindow, payload) {
    try {
        const win = getWindow?.();
        if (win && !win.isDestroyed()) {
            win.webContents.send('memory:changed', payload);
        }
    } catch (e) {
        console.warn('[MemoryIpc] broadcast failed:', e.message);
    }
}

async function register({ userDataDir, getActiveWindow, projectRoot }) {
    if (service) return service;
    service = new MemoryService({ userDataDir });

    const initial = await service.initialScan();
    console.log(`[MemoryIpc] Initial scan: indexed=${initial.indexed}, removed=${initial.removed}`);

    service.on('changed', payload => broadcast(getActiveWindow, payload));

    watcher = MemoryWatcher.start({
        rootDir: service.getDir(),
        onChange: async (absPath) => {
            await service.reindexPath(absPath);
        }
    });

    ipcMain.handle('memory:save', async (_e, args) => service.save(args || {}));
    ipcMain.handle('memory:update', async (_e, args) => service.update(args || {}));
    ipcMain.handle('memory:delete', async (_e, args) => service.delete(args || {}));
    ipcMain.handle('memory:get', async (_e, args) => service.get(args || {}));
    ipcMain.handle('memory:search', async (_e, args) => service.search(args || {}));
    ipcMain.handle('memory:list', async (_e, args) => service.list(args || {}));
    ipcMain.handle('memory:rules', async () => service.rules());
    ipcMain.handle('memory:stats', async () => service.stats());
    ipcMain.handle('memory:getDir', async () => service.getDir());
    ipcMain.handle('memory:rescan', async () => service.rescan());

    // ── Project-root memory (Soul.md, User.md, memory.md, agent.md, daily logs) ──
    if (projectRoot) {
        projectMemory = new ProjectMemoryService({ projectRoot });
        projectMemory.open();
        await projectMemory.initialScan();
        projectMemory.startWatcher();
        projectMemory.on('changed', payload => broadcast(getActiveWindow, { ...payload, source: 'projectMemory' }));
        console.log(`[MemoryIpc] Project memory ready at ${projectRoot}`);

        ipcMain.handle('projectMemory:search', async (_e, args) => projectMemory.search(args || {}));
        ipcMain.handle('projectMemory:searchHybrid', async (_e, args) => projectMemory.searchHybrid(args || {}));
        ipcMain.handle('projectMemory:setEmbeddingKey', async (_e, key) => { projectMemory.setApiKey(key); return { ok: true }; });
        ipcMain.handle('projectMemory:getDailyLog', async (_e, date) => projectMemory.getDailyLog(date));
        ipcMain.handle('projectMemory:writeDailyLog', async (_e, date, content) => projectMemory.writeDailyLog(date, content));
        ipcMain.handle('projectMemory:readRootFiles', async () => projectMemory.readRootFiles());
        ipcMain.handle('projectMemory:writeRootFile', async (_e, name, content) => projectMemory.writeRootFile(name, content));
        ipcMain.handle('projectMemory:getRoot', async () => projectMemory.getRoot());
        ipcMain.handle('projectMemory:stats', async () => projectMemory.stats());
        ipcMain.handle('projectMemory:rescan', async () => projectMemory.rescan());
    }

    return service;
}

async function close() {
    try { if (watcher) await watcher.close(); } catch (_) { }
    watcher = null;
    if (service) service.close();
    service = null;
    if (projectMemory) projectMemory.close();
    projectMemory = null;
}

module.exports = { register, close };
