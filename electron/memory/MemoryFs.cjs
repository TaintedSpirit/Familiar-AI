const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const matter = require('gray-matter');
const { randomUUID } = require('crypto');

const ALLOWED_TYPES = ['user', 'feedback', 'project', 'reference', 'soul', 'innerworld-rule', 'derived'];

function hashBody(body) {
    return crypto.createHash('sha256').update(body, 'utf8').digest('hex');
}

function slugify(s) {
    return String(s || '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 48) || 'entry';
}

function resolveEntryPath(root, type, { id, projectId, slug }) {
    // Special soul files live at root
    if (type === 'soul') {
        if (slug && ['soul.md', 'memory.md', 'goals.md'].includes(slug)) {
            return path.join(root, slug);
        }
    }
    if (type === 'project' && projectId) {
        return path.join(root, 'projects', projectId, `${slugify(slug || id)}.md`);
    }
    return path.join(root, 'entries', `${id}.md`);
}

class MemoryFs {
    constructor(rootDir) {
        this.root = rootDir;
        this._ensureLayout();
    }

    _ensureLayout() {
        const dirs = [
            this.root,
            path.join(this.root, 'entries'),
            path.join(this.root, 'daily'),
            path.join(this.root, 'topics'),
            path.join(this.root, 'projects')
        ];
        for (const d of dirs) fs.mkdirSync(d, { recursive: true });

        // Seed top-level markdown scaffolds if missing
        this._seedIfMissing('MEMORY.md', '# Memory\n\nPromoted durable facts.\n');
        this._seedIfMissing('DREAMS.md', '# Dreams\n\nConsolidation log.\n');
        this._seedIfMissing('soul.md', '# Soul\n\n**Name:** Antigravity\n**Personality:** Curious, direct, warm. Never sycophantic.\n**Values:** Honesty, efficiency, user autonomy.\n');
        this._seedIfMissing('memory.md', '# Long-Term Memory\n\n');
        this._seedIfMissing('goals.md', '# Standing Goals\n\n');
    }

    _seedIfMissing(name, content) {
        const p = path.join(this.root, name);
        if (!fs.existsSync(p)) {
            fs.writeFileSync(p, content, 'utf8');
        }
    }

    rootDir() { return this.root; }

    toRelPath(absPath) {
        return path.relative(this.root, absPath).split(path.sep).join('/');
    }

    toAbsPath(relPath) {
        return path.join(this.root, relPath);
    }

    async writeEntry({ id, type, body, tags = [], projectId = null, source = 'explicit', rule = null, createdAt = null, slug = null }) {
        if (!ALLOWED_TYPES.includes(type)) {
            throw new Error(`Invalid memory type: ${type}`);
        }
        const finalId = id || randomUUID();
        const now = new Date().toISOString();
        const created = createdAt || now;
        const absPath = resolveEntryPath(this.root, type, { id: finalId, projectId, slug });

        await fsp.mkdir(path.dirname(absPath), { recursive: true });

        const frontmatter = {
            id: finalId,
            type,
            tags,
            projectId: projectId || null,
            createdAt: created,
            updatedAt: now,
            source,
            hash: hashBody(body)
        };
        if (rule) frontmatter.rule = rule;

        const fileContent = matter.stringify(body, frontmatter);
        const tmpPath = absPath + '.tmp';
        await fsp.writeFile(tmpPath, fileContent, 'utf8');
        await fsp.rename(tmpPath, absPath);

        return {
            id: finalId,
            absPath,
            relPath: this.toRelPath(absPath),
            hash: frontmatter.hash,
            frontmatter,
            body
        };
    }

    async readEntry(absPath) {
        const raw = await fsp.readFile(absPath, 'utf8');
        const parsed = matter(raw);
        const rel = this.toRelPath(absPath);
        const stat = await fsp.stat(absPath);

        const fm = parsed.data || {};
        const inferredType = this._inferType(rel, fm.type);
        const id = fm.id || crypto.createHash('sha1').update(rel).digest('hex').slice(0, 16);
        const body = parsed.content || '';
        const hash = fm.hash || hashBody(body);

        return {
            id,
            absPath,
            relPath: rel,
            type: inferredType,
            projectId: fm.projectId || null,
            tags: Array.isArray(fm.tags) ? fm.tags : [],
            createdAt: fm.createdAt || new Date(stat.birthtimeMs || stat.ctimeMs).toISOString(),
            updatedAt: fm.updatedAt || new Date(stat.mtimeMs).toISOString(),
            hash,
            body,
            rule: fm.rule || null,
            source: fm.source || 'explicit',
            frontmatter: fm
        };
    }

    _inferType(relPath, explicit) {
        if (explicit) return explicit;
        const name = path.basename(relPath).toLowerCase();
        if (['soul.md', 'memory.md', 'goals.md'].includes(name)) return 'soul';
        if (name === 'memory.md' || name === 'dreams.md') return 'soul';
        if (relPath.startsWith('projects/')) return 'project';
        if (relPath.startsWith('daily/')) return 'derived';
        if (relPath.startsWith('topics/')) return 'reference';
        if (relPath.startsWith('entries/')) return 'reference';
        return 'reference';
    }

    async deleteEntry(absPath) {
        try {
            await fsp.unlink(absPath);
            return true;
        } catch (e) {
            if (e.code === 'ENOENT') return false;
            throw e;
        }
    }

    async* walk() {
        yield* this._walk(this.root);
    }

    async* _walk(dir) {
        let entries;
        try {
            entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch (_) { return; }
        for (const e of entries) {
            if (e.name.startsWith('.')) continue; // skip .familiar-memory.db etc.
            const abs = path.join(dir, e.name);
            if (e.isDirectory()) {
                yield* this._walk(abs);
            } else if (e.isFile() && abs.toLowerCase().endsWith('.md')) {
                yield abs;
            }
        }
    }
}

module.exports = { MemoryFs, hashBody, ALLOWED_TYPES };
