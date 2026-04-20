const path = require('path');
const chokidar = require('chokidar');

function start({ rootDir, onChange }) {
    const watcher = chokidar.watch(path.join(rootDir, '**/*.md'), {
        ignoreInitial: true,
        ignored: [/\.tmp$/, /\\\.[^\\]+\\/], // skip tmp writes and dotfiles
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
    });

    const debounce = new Map(); // absPath -> timeout handle
    const fire = (absPath) => {
        if (debounce.has(absPath)) clearTimeout(debounce.get(absPath));
        debounce.set(absPath, setTimeout(() => {
            debounce.delete(absPath);
            Promise.resolve(onChange(absPath)).catch(err => console.warn('[MemoryWatcher]', err.message));
        }, 300));
    };

    watcher.on('add', fire);
    watcher.on('change', fire);
    watcher.on('unlink', fire);
    watcher.on('error', err => console.warn('[MemoryWatcher] error', err?.message || err));

    return {
        close: () => watcher.close()
    };
}

module.exports = { start };
