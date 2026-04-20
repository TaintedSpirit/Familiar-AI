const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');
const MemoryDb = require('./MemoryDb.cjs');
const { MemoryFs, hashBody } = require('./MemoryFs.cjs');
const { rank, snippet } = require('./ranking.cjs');

function toMs(isoOrMs) {
    if (typeof isoOrMs === 'number') return isoOrMs;
    if (typeof isoOrMs === 'string') {
        const n = Date.parse(isoOrMs);
        return Number.isNaN(n) ? Date.now() : n;
    }
    return Date.now();
}

function recordFromEntry(entry) {
    return {
        id: entry.id,
        path: entry.relPath,
        type: entry.type,
        project_id: entry.projectId || null,
        tags_json: JSON.stringify(entry.tags || []),
        created_at: toMs(entry.createdAt),
        updated_at: toMs(entry.updatedAt),
        hash: entry.hash,
        body: entry.body,
        rule_json: entry.rule ? JSON.stringify(entry.rule) : null
    };
}

class MemoryService extends EventEmitter {
    constructor({ userDataDir }) {
        super();
        this.root = path.join(userDataDir, 'familiar-memory');
        fs.mkdirSync(this.root, { recursive: true });
        this.fs = new MemoryFs(this.root);
        this.db = new MemoryDb(path.join(this.root, '.familiar-memory.db'));
        this._selfWrittenHashes = new Map(); // relPath -> hash, to ignore own writes in watcher
        this._rulesCache = null;
        this._rulesCacheAt = 0;
    }

    async initialScan() {
        const seen = new Set();
        let indexed = 0;
        for await (const abs of this.fs.walk()) {
            const entry = await this.fs.readEntry(abs);
            const existing = this.db.getByPath(entry.relPath);
            if (!existing || existing.hash !== entry.hash || existing.updated_at !== toMs(entry.updatedAt)) {
                this.db.upsert(recordFromEntry(entry));
                indexed++;
            }
            seen.add(entry.relPath);
        }
        // Remove orphan DB rows
        let removed = 0;
        for (const relPath of this.db.allPaths()) {
            if (!seen.has(relPath)) {
                this.db.deleteByPath(relPath);
                removed++;
            }
        }
        this._invalidateRules();
        return { indexed, removed };
    }

    async reindexPath(absPath) {
        const relPath = this.fs.toRelPath(absPath);
        if (!fs.existsSync(absPath)) {
            this.db.deleteByPath(relPath);
            this._invalidateRules();
            this.emit('changed', { id: null, path: relPath, type: null, op: 'delete' });
            return;
        }
        try {
            const entry = await this.fs.readEntry(absPath);
            // Skip if we just wrote this exact hash (self-write)
            if (this._selfWrittenHashes.get(entry.relPath) === entry.hash) {
                this._selfWrittenHashes.delete(entry.relPath);
                return;
            }
            this.db.upsert(recordFromEntry(entry));
            this._invalidateRules();
            this.emit('changed', { id: entry.id, path: entry.relPath, type: entry.type, op: 'update' });
        } catch (e) {
            console.warn('[MemoryService] reindex failed for', relPath, e.message);
        }
    }

    async save({ id = null, type, body, tags = [], projectId = null, source = 'explicit', rule = null, slug = null }) {
        if (!body || typeof body !== 'string') throw new Error('save: body is required');
        // Dedupe: same (type, hash) already exists → bump updated_at only
        const bodyHash = hashBody(body);
        const dupe = this.db.db.prepare('SELECT id, path FROM memories WHERE type = ? AND hash = ? LIMIT 1').get(type, bodyHash);
        if (dupe && !id) {
            const now = Date.now();
            this.db.db.prepare('UPDATE memories SET updated_at = ? WHERE id = ?').run(now, dupe.id);
            this._invalidateRules();
            this.emit('changed', { id: dupe.id, path: dupe.path, type, op: 'update' });
            return { id: dupe.id, path: dupe.path, hash: bodyHash, deduped: true };
        }

        const entry = await this.fs.writeEntry({ id, type, body, tags, projectId, source, rule, slug });
        this._selfWrittenHashes.set(entry.relPath, entry.hash);
        this.db.upsert(recordFromEntry({
            id: entry.id,
            relPath: entry.relPath,
            type,
            projectId,
            tags,
            createdAt: entry.frontmatter.createdAt,
            updatedAt: entry.frontmatter.updatedAt,
            hash: entry.hash,
            body,
            rule
        }));
        this._invalidateRules();
        this.emit('changed', { id: entry.id, path: entry.relPath, type, op: 'add' });
        return { id: entry.id, path: entry.relPath, hash: entry.hash };
    }

    async update({ id, body, tags, rule }) {
        const row = this.db.getById(id);
        if (!row) throw new Error(`update: memory ${id} not found`);
        const newBody = body != null ? body : row.body;
        const newTags = tags != null ? tags : JSON.parse(row.tags_json || '[]');
        const newRule = rule !== undefined ? rule : (row.rule_json ? JSON.parse(row.rule_json) : null);
        // rewrite file at same relPath
        const absPath = this.fs.toAbsPath(row.path);
        const matter = require('gray-matter');
        const raw = fs.readFileSync(absPath, 'utf8');
        const parsed = matter(raw);
        const fm = parsed.data || {};
        fm.tags = newTags;
        fm.rule = newRule || undefined;
        fm.updatedAt = new Date().toISOString();
        fm.hash = hashBody(newBody);
        const out = matter.stringify(newBody, fm);
        fs.writeFileSync(absPath, out, 'utf8');
        this._selfWrittenHashes.set(row.path, fm.hash);
        this.db.upsert({
            id: row.id,
            path: row.path,
            type: row.type,
            project_id: row.project_id,
            tags_json: JSON.stringify(newTags),
            created_at: row.created_at,
            updated_at: toMs(fm.updatedAt),
            hash: fm.hash,
            body: newBody,
            rule_json: newRule ? JSON.stringify(newRule) : null
        });
        this._invalidateRules();
        this.emit('changed', { id: row.id, path: row.path, type: row.type, op: 'update' });
        return { id: row.id, path: row.path, hash: fm.hash };
    }

    async delete({ id }) {
        const row = this.db.getById(id);
        if (!row) return { ok: false };
        const abs = this.fs.toAbsPath(row.path);
        await this.fs.deleteEntry(abs);
        this.db.deleteById(id);
        this._invalidateRules();
        this.emit('changed', { id, path: row.path, type: row.type, op: 'delete' });
        return { ok: true };
    }

    get({ id, path: relPath }) {
        const row = id ? this.db.getById(id) : this.db.getByPath(relPath);
        if (!row) return null;
        return this._rowToPublic(row);
    }

    list({ type = null, projectId = null, limit = 50, offset = 0 } = {}) {
        const rows = this.db.list({ type, projectId, limit, offset });
        return { items: rows.map(r => this._rowToPublic(r)) };
    }

    rules() {
        const now = Date.now();
        if (this._rulesCache && (now - this._rulesCacheAt) < 5 * 60 * 1000) {
            return { rules: this._rulesCache };
        }
        const rows = this.db.rules();
        const rules = rows.map(r => {
            let rule = null;
            try { rule = r.rule_json ? JSON.parse(r.rule_json) : null; } catch (_) { }
            return {
                id: r.id,
                path: r.path,
                body: r.body,
                match: rule?.match || null,
                effect: rule?.effect || 'warn',
                reasonKey: rule?.reasonKey || r.id,
                updatedAt: r.updated_at
            };
        }).filter(r => r.match);
        this._rulesCache = rules;
        this._rulesCacheAt = now;
        return { rules };
    }

    _invalidateRules() {
        this._rulesCache = null;
        this._rulesCacheAt = 0;
    }

    stats() {
        const s = this.db.stats();
        return { ...s, rootDir: this.root };
    }

    getDir() { return this.root; }

    async rescan() {
        return this.initialScan();
    }

    search({ query, limit = 10, types = null, projectId = null, recencyHalfLifeDays = 30 }) {
        if (!query || typeof query !== 'string') return { hits: [], total: 0 };
        const q = this._sanitizeFtsQuery(query);
        const rows = this.db.ftsSearch(q, 200);
        const filtered = rows.filter(r => {
            if (types && Array.isArray(types) && types.length && !types.includes(r.type)) return false;
            if (projectId && r.project_id !== projectId) return false;
            return true;
        });
        const ranked = rank(filtered, { halfLifeDays: recencyHalfLifeDays });
        const hits = ranked.slice(0, limit).map(r => ({
            id: r.id,
            path: r.path,
            type: r.type,
            projectId: r.project_id,
            updatedAt: r.updated_at,
            score: Number(r.score?.toFixed(4) ?? 0),
            snippet: snippet(r.body, query)
        }));
        return { hits, total: filtered.length };
    }

    _sanitizeFtsQuery(q) {
        // FTS5 MATCH is picky about special chars; strip most, keep word chars
        const cleaned = q.replace(/["()*:^-]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!cleaned) return '""';
        // Quote each token to avoid bareword operator interpretation
        return cleaned.split(' ').filter(Boolean).map(t => `"${t.replace(/"/g, '')}"`).join(' OR ');
    }

    _rowToPublic(row) {
        return {
            id: row.id,
            path: row.path,
            type: row.type,
            projectId: row.project_id,
            tags: (() => { try { return JSON.parse(row.tags_json || '[]'); } catch (_) { return []; } })(),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            hash: row.hash,
            body: row.body,
            rule: (() => { try { return row.rule_json ? JSON.parse(row.rule_json) : null; } catch (_) { return null; } })()
        };
    }

    close() {
        try { this.db.close(); } catch (_) { }
    }
}

module.exports = MemoryService;
