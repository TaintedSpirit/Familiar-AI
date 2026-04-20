const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  project_id TEXT,
  tags_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  hash TEXT NOT NULL,
  body TEXT NOT NULL,
  rule_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_mem_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_mem_project ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_mem_updated ON memories(updated_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  body, tags, path,
  content='memories', content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS mem_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, body, tags, path)
  VALUES (new.rowid, new.body, COALESCE(new.tags_json, ''), new.path);
END;
CREATE TRIGGER IF NOT EXISTS mem_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, body, tags, path)
  VALUES('delete', old.rowid, old.body, COALESCE(old.tags_json, ''), old.path);
END;
CREATE TRIGGER IF NOT EXISTS mem_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, body, tags, path)
  VALUES('delete', old.rowid, old.body, COALESCE(old.tags_json, ''), old.path);
  INSERT INTO memories_fts(rowid, body, tags, path)
  VALUES (new.rowid, new.body, COALESCE(new.tags_json, ''), new.path);
END;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

class MemoryDb {
    constructor(dbPath) {
        this.dbPath = dbPath;
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('foreign_keys = ON');
        this._migrate();
        this._prepare();
    }

    _migrate() {
        this.db.exec(SCHEMA_V1);
        const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version');
        if (!row) {
            this.db.prepare('INSERT INTO meta(key, value) VALUES (?, ?)').run('schema_version', '1');
        }
    }

    _prepare() {
        this.stmts = {
            upsert: this.db.prepare(`
                INSERT INTO memories(id, path, type, project_id, tags_json, created_at, updated_at, hash, body, rule_json)
                VALUES (@id, @path, @type, @project_id, @tags_json, @created_at, @updated_at, @hash, @body, @rule_json)
                ON CONFLICT(id) DO UPDATE SET
                    path=excluded.path,
                    type=excluded.type,
                    project_id=excluded.project_id,
                    tags_json=excluded.tags_json,
                    updated_at=excluded.updated_at,
                    hash=excluded.hash,
                    body=excluded.body,
                    rule_json=excluded.rule_json
            `),
            deleteById: this.db.prepare('DELETE FROM memories WHERE id = ?'),
            deleteByPath: this.db.prepare('DELETE FROM memories WHERE path = ?'),
            getById: this.db.prepare('SELECT * FROM memories WHERE id = ?'),
            getByPath: this.db.prepare('SELECT * FROM memories WHERE path = ?'),
            listAllPaths: this.db.prepare('SELECT path FROM memories'),
            listByType: this.db.prepare(`
                SELECT * FROM memories
                WHERE (@type IS NULL OR type = @type)
                  AND (@project_id IS NULL OR project_id = @project_id)
                ORDER BY updated_at DESC
                LIMIT @limit OFFSET @offset
            `),
            listRules: this.db.prepare(`SELECT id, path, body, rule_json, updated_at FROM memories WHERE type = 'innerworld-rule'`),
            stats: this.db.prepare(`
                SELECT type, COUNT(*) as count FROM memories GROUP BY type
            `),
            totalCount: this.db.prepare('SELECT COUNT(*) AS n FROM memories'),
            lastIndexed: this.db.prepare('SELECT MAX(updated_at) AS ts FROM memories'),
            ftsSearch: this.db.prepare(`
                SELECT m.id, m.path, m.type, m.project_id, m.updated_at, m.body, m.hash,
                       bm25(memories_fts) AS bm25
                FROM memories_fts
                JOIN memories m ON m.rowid = memories_fts.rowid
                WHERE memories_fts MATCH @query
                ORDER BY bm25 ASC
                LIMIT @k
            `)
        };
    }

    upsert(record) {
        this.stmts.upsert.run(record);
    }

    deleteById(id) {
        return this.stmts.deleteById.run(id).changes;
    }

    deleteByPath(relPath) {
        return this.stmts.deleteByPath.run(relPath).changes;
    }

    getById(id) { return this.stmts.getById.get(id); }
    getByPath(relPath) { return this.stmts.getByPath.get(relPath); }
    allPaths() { return this.stmts.listAllPaths.all().map(r => r.path); }

    list({ type = null, projectId = null, limit = 50, offset = 0 } = {}) {
        return this.stmts.listByType.all({ type, project_id: projectId, limit, offset });
    }

    rules() {
        return this.stmts.listRules.all();
    }

    stats() {
        const byType = {};
        for (const row of this.stmts.stats.all()) byType[row.type] = row.count;
        const total = this.stmts.totalCount.get().n;
        const last = this.stmts.lastIndexed.get().ts || 0;
        return { count: total, byType, lastIndexed: last };
    }

    ftsSearch(query, k = 200) {
        try {
            return this.stmts.ftsSearch.all({ query, k });
        } catch (e) {
            // FTS5 MATCH syntax errors on raw user input — fall back to LIKE search
            return this._fallbackLike(query, k);
        }
    }

    _fallbackLike(query, k) {
        const like = `%${query.replace(/[%_]/g, '')}%`;
        return this.db.prepare(`
            SELECT id, path, type, project_id, updated_at, body, hash, 5.0 AS bm25
            FROM memories
            WHERE body LIKE ? OR path LIKE ?
            ORDER BY updated_at DESC
            LIMIT ?
        `).all(like, like, k);
    }

    close() {
        try { this.db.close(); } catch (_) { /* ignore */ }
    }
}

module.exports = MemoryDb;
