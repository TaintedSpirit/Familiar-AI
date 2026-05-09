// Forge IPC backend — sandbox clone/destroy/diff/benchmark/apply.
// Registered from main.mjs via registerForgeIpc(ipcMain, dialog).

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const CLONE_DIRS  = ['src', 'electron', 'public'];
const CLONE_FILES = ['package.json', 'package-lock.json'];
const SKIP_DIRS   = new Set(['node_modules', '.git', 'sandboxes', 'dist', 'build', '__pycache__']);
const BENCHMARK_TIMEOUT_MS = 120_000;
const SAFE_ID = /^sb_[a-z0-9]+$/;

async function copyDir(src, dest) {
    await fsp.mkdir(dest, { recursive: true });
    const entries = await fsp.readdir(src, { withFileTypes: true });
    for (const e of entries) {
        if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
        if (e.name.startsWith('.')) continue;
        const s = path.join(src, e.name);
        const d = path.join(dest, e.name);
        if (e.isDirectory()) await copyDir(s, d);
        else if (e.isFile()) await fsp.copyFile(s, d);
    }
}

async function walkFiles(root, base = root, out = []) {
    let entries;
    try { entries = await fsp.readdir(root, { withFileTypes: true }); }
    catch { return out; }
    for (const e of entries) {
        if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
        if (e.name.startsWith('.')) continue;
        const full = path.join(root, e.name);
        if (e.isDirectory()) await walkFiles(full, base, out);
        else if (e.isFile()) out.push(path.relative(base, full).replace(/\\/g, '/'));
    }
    return out;
}

async function safeRead(p) {
    try { return await fsp.readFile(p, 'utf8'); }
    catch { return null; }
}

// Lightweight unified-ish diff: per-file before/after blocks. We avoid bringing
// in a diff lib for v1 — the UI uses Monaco's DiffEditor which only needs the
// before/after strings. The renderer can render a real diff view from this.
async function buildDiff(productionRoot, sandboxRoot) {
    const sandboxFiles = await walkFiles(sandboxRoot);
    const files = [];
    for (const rel of sandboxFiles) {
        const sandPath = path.join(sandboxRoot, rel);
        const prodPath = path.join(productionRoot, rel);
        const [a, b] = await Promise.all([safeRead(prodPath), safeRead(sandPath)]);
        if (a === b) continue;
        files.push({
            path: rel,
            status: a == null ? 'added' : b == null ? 'deleted' : 'modified',
            before: a ?? '',
            after:  b ?? '',
            beforeBytes: a?.length ?? 0,
            afterBytes:  b?.length ?? 0,
        });
    }
    return { files, count: files.length };
}

function registerForgeIpc(ipcMain, dialog) {

    ipcMain.handle('forge:create-sandbox', async (_e, { productionRoot, goal }) => {
        if (!productionRoot || !fs.existsSync(productionRoot)) {
            return { error: 'productionRoot does not exist' };
        }
        const sandboxId = `sb_${crypto.randomBytes(5).toString('hex')}`;
        const rootPath = path.join(productionRoot, 'sandboxes', sandboxId);
        try {
            await fsp.mkdir(rootPath, { recursive: true });
            for (const dir of CLONE_DIRS) {
                const src = path.join(productionRoot, dir);
                if (fs.existsSync(src)) await copyDir(src, path.join(rootPath, dir));
            }
            for (const file of CLONE_FILES) {
                const src = path.join(productionRoot, file);
                if (fs.existsSync(src)) await fsp.copyFile(src, path.join(rootPath, file));
            }
            await fsp.mkdir(path.join(rootPath, 'benchmarks'), { recursive: true });
            await fsp.writeFile(
                path.join(rootPath, '.forge.json'),
                JSON.stringify({ sandboxId, goal, productionRoot, createdAt: Date.now() }, null, 2),
                'utf8'
            );
            return { sandboxId, rootPath, productionRoot };
        } catch (e) {
            return { error: `Sandbox creation failed: ${e.message}` };
        }
    });

    ipcMain.handle('forge:destroy-sandbox', async (_e, { sandboxId, rootPath }) => {
        if (!SAFE_ID.test(sandboxId)) return { error: 'Invalid sandboxId' };
        if (!rootPath) return { error: 'rootPath required for destroy' };
        if (!rootPath.includes(path.sep + 'sandboxes' + path.sep + sandboxId)) {
            return { error: 'rootPath does not match sandboxId' };
        }
        try {
            await fsp.rm(rootPath, { recursive: true, force: true });
            return { success: true, sandboxId };
        } catch (e) {
            return { error: e.message };
        }
    });

    ipcMain.handle('forge:diff-sandbox', async (_e, { sandboxId, rootPath, productionRoot }) => {
        if (!SAFE_ID.test(sandboxId)) return { error: 'Invalid sandboxId' };
        if (!rootPath || !productionRoot) return { error: 'rootPath and productionRoot required' };
        try {
            return await buildDiff(productionRoot, rootPath);
        } catch (e) {
            return { error: e.message };
        }
    });

    ipcMain.handle('forge:run-benchmark', async (_e, { sandboxId, rootPath, suite }) => {
        if (!SAFE_ID.test(sandboxId)) return { error: 'Invalid sandboxId' };
        if (!rootPath) return { error: 'rootPath required' };
        const safeSuite = (suite || 'default').replace(/[^a-z0-9_-]/gi, '');
        const scriptPath = path.join(rootPath, 'benchmarks', `${safeSuite}.mjs`);
        if (!fs.existsSync(scriptPath)) {
            return { error: `Benchmark script not found: benchmarks/${safeSuite}.mjs` };
        }

        return new Promise((resolve) => {
            const startedAt = Date.now();
            const child = spawn(process.execPath, [scriptPath], {
                cwd: rootPath,
                env: { ...process.env, FORGE_SANDBOX_ID: sandboxId },
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            let stdout = '', stderr = '';
            const timer = setTimeout(() => {
                try { child.kill('SIGKILL'); } catch {}
                resolve({ error: `Benchmark timed out after ${BENCHMARK_TIMEOUT_MS}ms`, stderr, stdout });
            }, BENCHMARK_TIMEOUT_MS);
            child.stdout.on('data', d => { stdout += d.toString(); });
            child.stderr.on('data', d => { stderr += d.toString(); });
            child.on('error', err => {
                clearTimeout(timer);
                resolve({ error: err.message });
            });
            child.on('exit', (code) => {
                clearTimeout(timer);
                const wallclockMs = Date.now() - startedAt;
                // Parse the LAST non-empty line of stdout as JSON.
                const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
                let parsed = null;
                for (let i = lines.length - 1; i >= 0; i--) {
                    try { parsed = JSON.parse(lines[i]); break; } catch {}
                }
                if (code !== 0) {
                    return resolve({
                        error: `Benchmark exited ${code}`,
                        exitCode: code, stderr, stdout, wallclockMs,
                    });
                }
                if (!parsed || typeof parsed !== 'object') {
                    return resolve({
                        error: 'Benchmark did not print a JSON object on its last stdout line',
                        stdout: stdout.slice(-500), stderr: stderr.slice(-500), wallclockMs,
                    });
                }
                resolve({ ...parsed, exitCode: code, wallclockMs, stderr: stderr || undefined });
            });
        });
    });

    ipcMain.handle('forge:apply-evolution', async (event, { sandboxId, rootPath, productionRoot, summary }) => {
        if (!SAFE_ID.test(sandboxId)) return { error: 'Invalid sandboxId' };
        if (!rootPath || !productionRoot) return { error: 'rootPath and productionRoot required' };
        if (!rootPath.includes(path.sep + 'sandboxes' + path.sep + sandboxId)) {
            return { error: 'rootPath does not match sandboxId' };
        }

        // Compute the diff one final time so the user sees ground truth, not stale state.
        let diff;
        try { diff = await buildDiff(productionRoot, rootPath); }
        catch (e) { return { error: `Diff failed: ${e.message}` }; }

        const fileList = diff.files.map(f => `  [${f.status}] ${f.path}`).join('\n') || '  (no changes)';
        const { BrowserWindow } = require('electron');
        const win = BrowserWindow.fromWebContents(event.sender);
        const choice = await dialog.showMessageBox(win, {
            type: 'warning',
            title: 'Apply Evolution?',
            message: `Apply ${diff.count} file change(s) to production?`,
            detail: `${summary || '(no summary)'}\n\nFiles:\n${fileList}\n\nThis modifies the running codebase. The app will reload.`,
            buttons: ['Apply', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
        });
        if (choice.response !== 0) {
            return { success: false, cancelled: true };
        }

        const applied = [];
        try {
            for (const f of diff.files) {
                const dest = path.join(productionRoot, f.path);
                if (f.status === 'deleted') {
                    await fsp.rm(dest, { force: true });
                } else {
                    await fsp.mkdir(path.dirname(dest), { recursive: true });
                    await fsp.writeFile(dest, f.after, 'utf8');
                }
                applied.push(f.path);
            }
        } catch (e) {
            return { error: `Apply failed after ${applied.length} files: ${e.message}`, applied };
        }

        // Reload the renderer so the new code takes effect.
        try { win?.webContents.reload(); } catch {}

        return { success: true, applied, count: applied.length };
    });
}

module.exports = { registerForgeIpc };
