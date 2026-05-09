/**
 * SkillLoader — Claude-Code/OpenClaw-style skill discovery for AI Familiar.
 *
 * A "skill" is a Markdown file (`.md`, conventionally `SKILL.md` inside its
 * own directory) with optional YAML frontmatter:
 *
 *   ---
 *   name: research-deep
 *   description: Multi-source web research with citations
 *   when-to-use: User asks for an investigation or thorough briefing
 *   allowed-tools: [web_search, scrape_url, read_mcp_resource]
 *   ---
 *   # Body markdown — full skill instructions, fetched on-demand via read_skill.
 *
 * Discovery roots (highest precedence first):
 *   1. <project root>/.ai-familiar/skills/
 *   2. <soul dir>/skills/                   (legacy)
 *
 * Files without frontmatter still load — the H1 / first paragraph fallback
 * is preserved so old skills keep working.
 */

let _cache = null; // { skills, loadedAt, primaryDir }
const CACHE_TTL_MS = 5 * 60 * 1000;

const _subs = new Set();
function _notify() {
    for (const fn of _subs) {
        try { fn(); } catch (e) { console.error('[SkillLoader] subscriber threw:', e); }
    }
}

// ── Frontmatter parsing ────────────────────────────────────────────────────

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Tiny YAML-ish parser tuned to skill frontmatter — handles strings, scalars,
 * and inline arrays (`[a, b, "c"]`). Avoids a runtime YAML dep.
 */
function _parseFrontmatter(raw) {
    const m = raw.match(FRONTMATTER_RE);
    if (!m) return { meta: {}, body: raw };
    const block = m[1];
    const body = raw.slice(m[0].length);
    const meta = {};
    for (const line of block.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf(':');
        if (idx < 0) continue;
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        if (!value) { meta[key] = ''; continue; }
        // Inline array
        if (value.startsWith('[') && value.endsWith(']')) {
            meta[key] = value.slice(1, -1)
                .split(',')
                .map(s => s.trim().replace(/^["']|["']$/g, ''))
                .filter(Boolean);
            continue;
        }
        // Quoted string
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            meta[key] = value.slice(1, -1);
            continue;
        }
        meta[key] = value;
    }
    return { meta, body };
}

function _serializeFrontmatter(meta, body) {
    const lines = ['---'];
    for (const [k, v] of Object.entries(meta || {})) {
        if (v == null || v === '') continue;
        if (Array.isArray(v)) {
            const inner = v.map(x => /[,\s]/.test(String(x)) ? `"${x}"` : String(x)).join(', ');
            lines.push(`${k}: [${inner}]`);
        } else {
            const s = String(v);
            const needsQuote = /[:#\[\]\{\}]/.test(s);
            lines.push(`${k}: ${needsQuote ? `"${s.replace(/"/g, '\\"')}"` : s}`);
        }
    }
    lines.push('---', '');
    return lines.join('\n') + (body.startsWith('\n') ? '' : '\n') + body;
}

// ── Discovery ──────────────────────────────────────────────────────────────

async function _discoverSkillDirs() {
    const dirs = [];
    let primary = null;
    try {
        const root = await window.electronAPI?.projectMemory?.getRoot?.();
        if (root) {
            primary = `${root}/.ai-familiar/skills`;
            dirs.push(primary);
        }
    } catch { /* no project root */ }
    try {
        const soulDir = await window.electronAPI?.getSoulDir?.();
        if (soulDir) dirs.push(`${soulDir}/skills`);
    } catch { /* no soul dir */ }
    return { dirs, primary };
}

async function _loadOne(filePath) {
    try {
        const raw = await window.electronAPI?.readFile?.(filePath);
        if (!raw) return null;
        const { meta, body } = _parseFrontmatter(raw);
        // Frontmatter wins; otherwise fall back to H1/first-paragraph.
        const filenameStem = filePath.split(/[\\/]/).pop().replace(/\.md$/i, '');
        const h1 = body.match(/^#\s+(.+)/m);
        const name = (meta.name && String(meta.name)) || (h1 ? h1[1].trim() : filenameStem);
        const description = (meta.description && String(meta.description))
            || body.replace(/^#.*/m, '').trim().split('\n').find(l => l.trim())?.slice(0, 160)
            || '';
        const allowedTools = Array.isArray(meta['allowed-tools'])
            ? meta['allowed-tools']
            : (typeof meta['allowed-tools'] === 'string' && meta['allowed-tools'])
                ? meta['allowed-tools'].split(/[,\s]+/).filter(Boolean)
                : null;
        return {
            name, description,
            whenToUse: meta['when-to-use'] || null,
            allowedTools,
            path: filePath,
            body,           // Markdown body without frontmatter
            raw,            // Original file contents for the editor
            meta,
            hasFrontmatter: raw.startsWith('---'),
        };
    } catch {
        return null;
    }
}

async function _loadDir(dir) {
    const out = [];
    try {
        const entries = await window.electronAPI?.listDir?.(dir);
        if (!entries) return out;
        for (const entry of entries) {
            // Two layouts supported:
            //   <dir>/<skill>.md            (flat)
            //   <dir>/<skill>/SKILL.md      (folder per skill, like Claude Code)
            if (entry.isDir) {
                const inside = `${dir}/${entry.name}/SKILL.md`;
                const skill = await _loadOne(inside);
                if (skill) out.push(skill);
                continue;
            }
            if (!entry.name?.endsWith('.md')) continue;
            const skill = await _loadOne(`${dir}/${entry.name}`);
            if (skill) out.push(skill);
        }
    } catch { /* dir doesn't exist, skip */ }
    return out;
}

async function _refresh(force = false) {
    if (!force && _cache && Date.now() - _cache.loadedAt < CACHE_TTL_MS) return _cache;
    const { dirs, primary } = await _discoverSkillDirs();
    const arrays = await Promise.all(dirs.map(_loadDir));
    const all = arrays.flat();
    // Earlier dirs (project root) take precedence by name.
    const seen = new Set();
    const skills = all.filter(s => {
        if (seen.has(s.name)) return false;
        seen.add(s.name);
        return true;
    });
    _cache = { skills, loadedAt: Date.now(), primaryDir: primary };
    return _cache;
}

// ── Public API ─────────────────────────────────────────────────────────────

export const skillLoader = {
    subscribe(fn) { _subs.add(fn); return () => _subs.delete(fn); },

    async list({ refresh = false } = {}) {
        const { skills } = await _refresh(refresh);
        return skills;
    },

    async getPrimaryDir() {
        const { primaryDir } = await _refresh();
        return primaryDir;
    },

    /**
     * For SystemPromptBuilder — only ships (name, description, when-to-use).
     * Body is fetched on demand via read_skill, à la Claude Code.
     */
    async getSkillsForPrompt() {
        if (!window.electronAPI) return '';
        try {
            const { skills } = await _refresh();
            if (!skills.length) return '';
            const items = skills.map(s => {
                const lines = [
                    `  <skill>`,
                    `    <name>${s.name}</name>`,
                    `    <description>${s.description}</description>`,
                ];
                if (s.whenToUse) lines.push(`    <when-to-use>${s.whenToUse}</when-to-use>`);
                if (s.allowedTools?.length) {
                    lines.push(`    <allowed-tools>${s.allowedTools.join(', ')}</allowed-tools>`);
                }
                lines.push(`  </skill>`);
                return lines.join('\n');
            }).join('\n');
            return `<available_skills>\n${items}\n</available_skills>\n\nWhen a user request matches a skill's description or when-to-use, call read_skill with its name to load the full instructions, then follow them.`;
        } catch {
            return '';
        }
    },

    async getSkill(name) {
        const { skills } = await _refresh();
        return skills.find(s => s.name === name) || null;
    },

    /**
     * Tool-facing: returns the full skill body (markdown without frontmatter)
     * plus a small header. Designed to be returned verbatim from read_skill.
     */
    async readSkillForTool(name) {
        const skill = await this.getSkill(name);
        if (!skill) {
            const { skills } = await _refresh(true);
            const retry = skills.find(s => s.name === name);
            if (!retry) {
                return `Skill "${name}" not found. Available: ${skills.map(s => s.name).join(', ') || '(none)'}`;
            }
            return _formatSkillForTool(retry);
        }
        return _formatSkillForTool(skill);
    },

    /**
     * Create or overwrite a skill in the primary skills dir. `meta` should
     * include at least { name, description }. Returns the absolute path.
     */
    async saveSkill({ slug, meta, body }) {
        if (!window.electronAPI?.writeFile) throw new Error('writeFile IPC unavailable');
        const dir = await this.getPrimaryDir();
        if (!dir) throw new Error('No project root configured for .ai-familiar/skills/');
        const fileSlug = (slug || meta?.name || 'untitled')
            .toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
        const filePath = `${dir}/${fileSlug}.md`;
        const raw = _serializeFrontmatter(meta || {}, body || '');
        await window.electronAPI.writeFile(filePath, raw);
        await _refresh(true);
        _notify();
        return filePath;
    },

    async deleteSkill(filePath) {
        if (!window.electronAPI?.deleteFile) throw new Error('deleteFile IPC unavailable');
        await window.electronAPI.deleteFile(filePath);
        await _refresh(true);
        _notify();
    },

    invalidate() { _cache = null; _notify(); },

    // Test/diagnostic helpers
    parseFrontmatter: _parseFrontmatter,
    serializeFrontmatter: _serializeFrontmatter,
};

function _formatSkillForTool(skill) {
    const head = [
        `# ${skill.name}`,
        skill.description ? `\n${skill.description}` : '',
        skill.whenToUse ? `\nWhen to use: ${skill.whenToUse}` : '',
        skill.allowedTools?.length ? `\nAllowed tools: ${skill.allowedTools.join(', ')}` : '',
    ].filter(Boolean).join('');
    return `${head}\n\n---\n\n${skill.body || '(empty body)'}`;
}
