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
const EMBED_MODEL = 'text-embedding-004';
const VECTOR_WEIGHT = 0.6;
const KEYWORD_WEIGHT = 0.4;
const MMR_LAMBDA = 0.7;

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

function cosineSimilarity(a, b) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : Math.max(0, Math.min(1, dot / denom));
}

// Token-based Jaccard similarity for MMR diversity (no extra embedding call)
function jaccardSimilarity(textA, textB) {
    const tokensA = new Set(textA.toLowerCase().split(/\W+/).filter(Boolean));
    const tokensB = new Set(textB.toLowerCase().split(/\W+/).filter(Boolean));
    let inter = 0;
    for (const t of tokensA) if (tokensB.has(t)) inter++;
    const union = tokensA.size + tokensB.size - inter;
    return union === 0 ? 0 : inter / union;
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

        // Vector / embedding state
        this._apiKey = null;
        this._genAI = null;
        this._embedQueue = new Set();
        this._embedRunning = false;
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

            CREATE TABLE IF NOT EXISTS embeddings (
                doc_id TEXT PRIMARY KEY,
                vector TEXT NOT NULL,
                model  TEXT NOT NULL,
                hash   TEXT NOT NULL
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
                DELETE FROM embeddings WHERE doc_id = old.id;
            END;
            CREATE TRIGGER IF NOT EXISTS docs_au AFTER UPDATE ON documents BEGIN
                INSERT INTO documents_fts(documents_fts, rowid, body, path) VALUES ('delete', old.rowid, old.body, old.path);
                INSERT INTO documents_fts(rowid, body, path) VALUES (new.rowid, new.body, new.path);
            END;
        `);
        this._db.prepare(`INSERT OR IGNORE INTO meta(key, value) VALUES ('schema_version', '2')`).run();
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
        const pending = this._embedQueue.size;
        try {
            console.log(`[ProjectMemory] scan: indexed=${indexed}, removed=${removed}, embedding queue=${pending}`);
        } catch (_) { /* ignore EPIPE */ }
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

        // Mark stale / new embedding for background recompute
        this._queueEmbed(id);
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

    // ── Embedding ──────────────────────────────────────────────────────────────

    setApiKey(key) {
        if (!key || this._apiKey === key) return;
        this._apiKey = key;
        this._genAI = null; // reset cached instance on key change

        // Queue any docs that don't have a current embedding
        const docs = this._db.prepare('SELECT d.id, d.hash FROM documents d LEFT JOIN embeddings e ON e.doc_id = d.id WHERE e.doc_id IS NULL OR e.hash != d.hash').all();
        for (const d of docs) this._embedQueue.add(d.id);

        if (this._embedQueue.size > 0) {
            try {
                console.log(`[ProjectMemory] embedding queue: ${this._embedQueue.size} docs`);
            } catch (_) { }
            this._flushEmbedQueue();
        }
    }

    _queueEmbed(docId) {
        this._embedQueue.add(docId);
        this._flushEmbedQueue();
    }

    _flushEmbedQueue() {
        if (this._embedRunning || !this._apiKey || this._embedQueue.size === 0) return;
        this._embedRunning = true;
        setImmediate(() => this._processEmbedQueue());
    }

    async _processEmbedQueue() {
        while (this._embedQueue.size > 0 && this._apiKey) {
            const [docId] = this._embedQueue;
            this._embedQueue.delete(docId);
            try {
                const row = this._db.prepare('SELECT body, hash FROM documents WHERE id = ?').get(docId);
                if (!row) continue;

                // Skip if embedding is already current
                const existing = this._db.prepare('SELECT hash FROM embeddings WHERE doc_id = ?').get(docId);
                if (existing?.hash === row.hash) continue;

                const vector = await this._embedText(row.body);
                this._db.prepare(`
                    INSERT INTO embeddings(doc_id, vector, model, hash)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(doc_id) DO UPDATE SET vector=excluded.vector, model=excluded.model, hash=excluded.hash
                `).run(docId, JSON.stringify(vector), EMBED_MODEL, row.hash);
            } catch (e) {
                console.warn(`[ProjectMemory] embedding failed for ${docId}:`, e.message);
            }
        }
        this._embedRunning = false;
    }

    async _embedText(text) {
        if (!this._genAI) {
            // Dynamic import works from CJS to load the ESM/CJS package
            const { GoogleGenerativeAI } = await import('@google/generative-ai');
            this._genAI = new GoogleGenerativeAI(this._apiKey);
        }
        const model = this._genAI.getGenerativeModel({ model: EMBED_MODEL });
        const result = await model.embedContent(text);
        return Array.from(result.embedding.values);
    }

    // ── Hybrid Search ──────────────────────────────────────────────────────────

    async searchHybrid({ query, limit = 10, types = [], minScore = 0.15 }) {
        if (!query || !query.trim()) return { hits: [], total: 0, mode: 'empty' };

        // Fall back to keyword-only if no API key
        if (!this._apiKey) return { ...this.search({ query, limit, types }), mode: 'keyword' };

        let queryVec;
        try {
            queryVec = await this._embedText(query);
        } catch (e) {
            console.warn('[ProjectMemory] query embed failed, falling back to FTS5:', e.message);
            return { ...this.search({ query, limit, types }), mode: 'keyword' };
        }

        // 1. FTS5 keyword candidates (wider net)
        const ftsRows = this._ftsSearch(query, limit * 3);
        const ftsScoreMap = new Map(); // docId → raw bm25 score
        for (const r of ftsRows) ftsScoreMap.set(r.id, Math.abs(r.rank));

        // 2. Load all stored embeddings
        const allEmbeddings = this._db.prepare('SELECT doc_id, vector FROM embeddings').all();

        // 3. Compute cosine similarity for every stored embedding
        const vectorHits = [];
        for (const e of allEmbeddings) {
            try {
                const vec = JSON.parse(e.vector);
                const sim = cosineSimilarity(queryVec, vec);
                if (sim > 0) vectorHits.push({ docId: e.doc_id, vectorScore: sim });
            } catch (_) { }
        }

        // 4. Merge: build a unified candidate set
        const allDocIds = new Set([...ftsScoreMap.keys(), ...vectorHits.map(v => v.docId)]);
        const vectorScoreMap = new Map(vectorHits.map(v => [v.docId, v.vectorScore]));

        // Normalize BM25 scores to [0,1]
        const bm25Values = [...ftsScoreMap.values()];
        const maxBm25 = bm25Values.length ? Math.max(...bm25Values) : 1;

        // 5. Compute hybrid score for each candidate
        const candidates = [];
        for (const id of allDocIds) {
            const doc = this._db.prepare('SELECT path, type, body, updated_at FROM documents WHERE id = ?').get(id);
            if (!doc) continue;
            if (types.length && !types.includes(doc.type)) continue;

            const bm25Norm = (ftsScoreMap.get(id) || 0) / (maxBm25 || 1);
            const vecScore = vectorScoreMap.get(id) || 0;
            let hybrid = VECTOR_WEIGHT * vecScore + KEYWORD_WEIGHT * bm25Norm;

            // Temporal decay for daily logs
            if (doc.type === 'daily') {
                const halfLifeMs = HALF_LIFE_DAYS * 24 * 60 * 60 * 1000;
                const ageMs = Date.now() - (doc.updated_at || 0);
                hybrid *= Math.pow(0.5, ageMs / halfLifeMs);
            }

            if (hybrid >= minScore) {
                candidates.push({ id, path: doc.path, type: doc.type, body: doc.body, updated_at: doc.updated_at, score: hybrid, vectorScore: vecScore, keywordScore: bm25Norm });
            }
        }

        candidates.sort((a, b) => b.score - a.score);

        // 6. MMR re-rank for diversity
        const hits = this._mmrRerank(candidates, limit, MMR_LAMBDA);

        return { hits: hits.map(h => ({ path: h.path, type: h.type, updated_at: h.updated_at, score: h.score, snippet: h.body.slice(0, 200) })), total: hits.length, mode: 'hybrid' };
    }

    _mmrRerank(candidates, limit, lambda) {
        if (candidates.length <= limit) return candidates;

        const selected = [];
        const remaining = [...candidates];

        while (selected.length < limit && remaining.length > 0) {
            let bestIdx = 0;
            let bestMmr = -Infinity;

            for (let i = 0; i < remaining.length; i++) {
                const relevance = remaining[i].score;
                let maxSim = 0;
                for (const s of selected) {
                    const sim = jaccardSimilarity(remaining[i].body, s.body);
                    if (sim > maxSim) maxSim = sim;
                }
                const mmr = lambda * relevance - (1 - lambda) * maxSim;
                if (mmr > bestMmr) { bestMmr = mmr; bestIdx = i; }
            }

            selected.push(remaining[bestIdx]);
            remaining.splice(bestIdx, 1);
        }

        return selected;
    }

    // ── Keyword Search (FTS5 only) ─────────────────────────────────────────────

    search({ query, limit = 10, types = [] }) {
        if (!query || !query.trim()) return { hits: [], total: 0 };

        const ftsRows = this._ftsSearch(query, limit * 2);

        const now = Date.now();
        const halfLifeMs = HALF_LIFE_DAYS * 24 * 60 * 60 * 1000;

        const scored = ftsRows.map(r => {
            let score = Math.abs(r.rank);
            if (r.type === 'daily') {
                const ageMs = now - (r.updated_at || 0);
                score *= Math.pow(0.5, ageMs / halfLifeMs);
            }
            return { ...r, score };
        });

        scored.sort((a, b) => b.score - a.score);
        let hits = scored;
        if (types.length) hits = hits.filter(h => types.includes(h.type));
        hits = hits.slice(0, limit);

        return { hits, total: hits.length };
    }

    _ftsSearch(query, limit) {
        const escaped = query.replace(/"/g, '""');
        const sql = `
            SELECT d.id, d.path, d.type, d.updated_at,
                   snippet(documents_fts, 0, '<mark>', '</mark>', '…', 32) AS snippet,
                   bm25(documents_fts) AS rank
            FROM documents_fts
            JOIN documents d ON d.path = documents_fts.path
            WHERE documents_fts MATCH ?
            ORDER BY rank
            LIMIT ?
        `;
        try {
            return this._db.prepare(sql).all(`"${escaped}"`, limit);
        } catch (_) {
            try { return this._db.prepare(sql).all(escaped, limit); }
            catch (_2) { return []; }
        }
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
        const embeddingCount = this._db.prepare('SELECT COUNT(*) as n FROM embeddings').get().n;
        return { total, byType, embeddings: embeddingCount, embeddingQueue: this._embedQueue.size, dbPath: this._dbPath };
    }
}

module.exports = ProjectMemoryService;
