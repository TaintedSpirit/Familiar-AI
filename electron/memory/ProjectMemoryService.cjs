'use strict';

const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const chokidar = require('chokidar');
const EventEmitter = require('events');

const ROOT_FILES = ['Soul.md', 'User.md', 'memory.md', 'agent.md'];

const TYPE_MAP = {
    'Soul.md': 'soul',
    'User.md': 'user',
    'memory.md': 'memory',
    'agent.md': 'agent',
};

const HALF_LIFE_DAYS = 30;

function sha256(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
}

function docId(relPath) {
    return sha256(relPath);
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function dailyStub(date) {
    return `# Session Log — ${date}\n\n_Add notes here as the session progresses._\n`;
}

class ProjectMemoryService extends EventEmitter {
    constructor({ projectRoot }) {
        super();
        this._root = projectRoot;
        this._dbPath = path.join(projectRoot, 'memory.db');
        this._memDir = path.join(projectRoot, 'memory');
        this._db = null;
        this._watcher = null;
        this._debounceTimers = new Map();
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    open() {
        this._db = new Database(this._dbPath);
        this._db.pragma('journal_mode = WAL');
        this._db.pragma('foreign_keys = ON');
        this._migrate();
    }

    close() {
        try { if (this._watcher) this._watcher.close(); } catch (_) { }
        this._watcher = null;
        try { if (this._db) this._db.close(); } catch (_) { }
        this._db = null;
    }

    // ── Schema ─────────────────────────────────────────────────────────────────

    _migrate() {
        this._db.exec(`
            CREATE TABLE IF NOT EXISTS documents (
                id         TEXT PRIMARY KEY,
                path       TEXT UNIQUE NOT NULL,
                type       TEXT NOT NULL,
                body       TEXT NOT NULL DEFAULT '',
                hash       TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS meta (
                key   TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
                body,
                path,
                content='documents',
                content_rowid='rowid',
                tokenize='porter unicode61'
            );

            CREATE TRIGGER IF NOT EXISTS docs_ai AFTER INSERT ON documents BEGIN
                INSERT INTO documents_fts(rowid, body, path) VALUES (new.rowid, new.body, new.path);
            END;
            CREATE TRIGGER IF NOT EXISTS docs_ad AFTER DELETE ON documents BEGIN
                INSERT INTO documents_fts(documents_fts, rowid, body, path) VALUES ('delete', old.rowid, old.body, old.path);
            END;
            CREATE TRIGGER IF NOT EXISTS docs_au AFTER UPDATE ON documents BEGIN
                INSERT INTO documents_fts(documents_fts, rowid, body, path) VALUES ('delete', old.rowid, old.body, old.path);
                INSERT INTO documents_fts(rowid, body, path) VALUES (new.rowid, new.body, new.path);
            END;
        `);
        this._db.prepare(`INSERT OR IGNORE INTO meta(key, value) VALUES ('schema_version', '1')`).run();
    }

    // ── Indexing ───────────────────────────────────────────────────────────────

    async initialScan() {
        if (!fs.existsSync(this._memDir)) fs.mkdirSync(this._memDir, { recursive: true });

        let indexed = 0;
        const seen = new Set();

        for (const name of ROOT_FILES) {
            const absPath = path.join(this._root, name);
            const relPath = name;
            if (await this._indexFile(absPath, relPath, TYPE_MAP[name] || 'memory')) indexed++;
            seen.add(relPath);
        }

        const dailyFiles = fs.readdirSync(this._memDir).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
        for (const name of dailyFiles) {
            const absPath = path.join(this._memDir, name);
            const relPath = `memory/${name}`;
            if (await this._indexFile(absPath, relPath, 'daily')) indexed++;
            seen.add(relPath);
        }

        const removed = this._pruneOrphans(seen);
        console.log(`[ProjectMemory] scan: indexed=${indexed}, removed=${removed}`);
        return { indexed, removed };
    }

    async reindexPath(absPath) {
        const relPath = path.relative(this._root, absPath).replace(/\\/g, '/');
        const name = path.basename(absPath);
        let type = TYPE_MAP[name];
        if (!type) {
            const inMemDir = absPath.startsWith(this._memDir);
            if (inMemDir && /^\d{4}-\d{2}-\d{2}\.md$/.test(name)) type = 'daily';
        }
        if (!type) return;

        if (!fs.existsSync(absPath)) {
            this._removeByPath(relPath);
            return;
        }
        await this._indexFile(absPath, relPath, type);
    }

    async _indexFile(absPath, relPath, type) {
        if (!fs.existsSync(absPath)) return false;
        const body = await fsp.readFile(absPath, 'utf8');
        const hash = sha256(body);
        const existing = this._db.prepare('SELECT hash FROM documents WHERE path = ?').get(relPath);
        if (existing?.hash === hash) return false;

        const id = docId(relPath);
        const now = Date.now();
        this._db.prepare(`
            INSERT INTO documents(id, path, type, body, hash, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET body=excluded.body, hash=excluded.hash, updated_at=excluded.updated_at
        `).run(id, relPath, type, body, hash, now);
        return true;
    }

    _removeByPath(relPath) {
        this._db.prepare('DELETE FROM documents WHERE path = ?').run(relPath);
    }

    _pruneOrphans(seen) {
        const all = this._db.prepare('SELECT path FROM documents').all().map(r => r.path);
        let removed = 0;
        for (const p of all) {
            if (!seen.has(p)) {
                this._db.prepare('DELETE FROM documents WHERE path = ?').run(p);
                removed++;
            }
        }
        return removed;
    }

    // ── File Watcher ───────────────────────────────────────────────────────────

    startWatcher() {
        const patterns = [
            ...ROOT_FILES.map(f => path.join(this._root, f)),
            path.join(this._memDir, '*.md'),
        ];

        this._watcher = chokidar.watch(patterns, {
            ignoreInitial: true,
            persistent: false,
            awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
        });

        const onChange = (absPath) => {
            const key = absPath;
            if (this._debounceTimers.has(key)) clearTimeout(this._debounceTimers.get(key));
            this._debounceTimers.set(key, setTimeout(async () => {
                this._debounceTimers.delete(key);
                await this.reindexPath(absPath);
                this.emit('changed', { path: path.relative(this._root, absPath).replace(/\\/g, '/') });
            }, 1000));
        };

        this._watcher.on('add', onChange);
        this._watcher.on('change', onChange);
        this._watcher.on('unlink', onChange);
    }

    // ── Search ─────────────────────────────────────────────────────────────────

    search({ query, limit = 10, types = [] }) {
        if (!query || !query.trim()) return { hits: [], total: 0 };

        const escaped = query.replace(/"/g, '""');

        let rows;
        try {
            rows = this._db.prepare(`
                SELECT d.path, d.type, d.updated_at,
                       snippet(documents_fts, 0, '<mark>', '</mark>', '…', 32) AS snippet,
                       bm25(documents_fts) AS rank
                FROM documents_fts
                JOIN documents d ON d.path = documents_fts.path
                WHERE documents_fts MATCH ?
                ORDER BY rank
                LIMIT ?
            `).all(`"${escaped}"`, limit * 2);
        } catch (_) {
            rows = this._db.prepare(`
                SELECT d.path, d.type, d.updated_at,
                       snippet(documents_fts, 0, '<mark>', '</mark>', '…', 32) AS snippet,
                       bm25(documents_fts) AS rank
                FROM documents_fts
                JOIN documents d ON d.path = documents_fts.path
                WHERE documents_fts MATCH ?
                ORDER BY rank
                LIMIT ?
            `).all(escaped, limit * 2);
        }

        const now = Date.now();
        const halfLifeMs = HALF_LIFE_DAYS * 24 * 60 * 60 * 1000;

        const scored = rows.map(r => {
            let score = Math.abs(r.rank);
            if (r.type === 'daily') {
                const ageMs = now - (r.updated_at || 0);
                const decay = Math.pow(0.5, ageMs / halfLifeMs);
                score *= decay;
            }
            return { ...r, score };
        });

        scored.sort((a, b) => b.score - a.score);

        let hits = scored;
        if (types.length) hits = hits.filter(h => types.includes(h.type));
        hits = hits.slice(0, limit);

        return { hits, total: hits.length };
    }

    // ── Daily Log ──────────────────────────────────────────────────────────────

    async getDailyLog(date) {
        const d = date || today();
        if (!fs.existsSync(this._memDir)) fs.mkdirSync(this._memDir, { recursive: true });
        const absPath = path.join(this._memDir, `${d}.md`);
        if (!fs.existsSync(absPath)) {
            await fsp.writeFile(absPath, dailyStub(d), 'utf8');
            await this.reindexPath(absPath);
        }
        const content = await fsp.readFile(absPath, 'utf8');
        return { date: d, path: absPath, content };
    }

    async writeDailyLog(date, content) {
        const d = date || today();
        if (!fs.existsSync(this._memDir)) fs.mkdirSync(this._memDir, { recursive: true });
        const absPath = path.join(this._memDir, `${d}.md`);
        await fsp.writeFile(absPath, content, 'utf8');
        await this.reindexPath(absPath);
        this.emit('changed', { path: `memory/${d}.md` });
        return { ok: true };
    }

    // ── Root File Access ───────────────────────────────────────────────────────

    async readRootFiles() {
        const result = {};
        for (const name of ROOT_FILES) {
            const absPath = path.join(this._root, name);
            try { result[name] = await fsp.readFile(absPath, 'utf8'); }
            catch { result[name] = ''; }
        }
        return result;
    }

    async writeRootFile(name, content) {
        if (!ROOT_FILES.includes(name)) throw new Error(`Disallowed root file: ${name}`);
        const absPath = path.join(this._root, name);
        await fsp.writeFile(absPath, content, 'utf8');
        await this.reindexPath(absPath);
        this.emit('changed', { path: name });
        return { ok: true };
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    getRoot() { return this._root; }

    async rescan() {
        return this.initialScan();
    }

    stats() {
        const rows = this._db.prepare(`SELECT type, COUNT(*) as count FROM documents GROUP BY type`).all();
        const byType = Object.fromEntries(rows.map(r => [r.type, r.count]));
        const total = Object.values(byType).reduce((s, n) => s + n, 0);
        return { total, byType, dbPath: this._dbPath };
    }
}

module.exports = ProjectMemoryService;
