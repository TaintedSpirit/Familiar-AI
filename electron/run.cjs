'use strict';
// VSCode sets ELECTRON_RUN_AS_NODE=1 so Electron sees itself as a Node.js runtime.
// We must DELETE the variable (not just empty it) before spawning electron.exe.
delete process.env.ELECTRON_RUN_AS_NODE;

const { spawnSync } = require('child_process');
const path = require('path');

// The npm 'electron' package exports the path to the Electron binary
const electronPath = require('electron');
const appDir = path.join(__dirname, '..');

const result = spawnSync(electronPath, [appDir], {
    stdio: 'inherit',
    env: process.env,
    cwd: appDir,
    windowsHide: false,
});

process.exit(result.status ?? 1);
