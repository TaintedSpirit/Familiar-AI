/**
 * SkillLoader — discovers .ai-familiar/skills/*.md files and injects them into
 * the agent system prompt as XML context. Drop any markdown file in the skills
 * directory to extend the agent without code changes.
 */

let _cache = null; // { skills: [{name, description, path, body}], loadedAt }
const CACHE_TTL_MS = 5 * 60 * 1000; // re-scan every 5 min

async function _discoverSkillDirs() {
    const dirs = [];
    try {
        // Primary: project root .ai-familiar/skills/
        const root = await window.electronAPI?.projectMemory?.getRoot?.();
        if (root) dirs.push(`${root}/.ai-familiar/skills`);
    } catch { /* no project root */ }
    try {
        // Legacy: familiar-memory/skills/
        const soulDir = await window.electronAPI?.getSoulDir?.();
        if (soulDir) dirs.push(`${soulDir}/skills`);
    } catch { /* no soul dir */ }
    return dirs;
}

async function _loadSkillsFromDir(dir) {
    const results = [];
    try {
        const entries = await window.electronAPI?.listDir?.(dir);
        if (!entries) return results;
        for (const entry of entries) {
            if (!entry.name?.endsWith('.md')) continue;
            const filePath = `${dir}/${entry.name}`;
            try {
                const body = await window.electronAPI?.readFile?.(filePath);
                if (!body) continue;
                // Extract name from first H1 line, or use filename
                const h1 = body.match(/^#\s+(.+)/m);
                const name = h1 ? h1[1].trim() : entry.name.replace(/\.md$/, '');
                // Extract description from first non-header paragraph
                const desc = body.replace(/^#.*/m, '').trim().split('\n')[0].slice(0, 120);
                results.push({ name, description: desc, path: filePath, body });
            } catch { /* unreadable file, skip */ }
        }
    } catch { /* dir doesn't exist, skip */ }
    return results;
}

async function _refresh() {
    if (_cache && Date.now() - _cache.loadedAt < CACHE_TTL_MS) return _cache.skills;
    const dirs = await _discoverSkillDirs();
    const skillArrays = await Promise.all(dirs.map(_loadSkillsFromDir));
    const skills = skillArrays.flat();
    // Deduplicate by name (project root takes precedence as it's first)
    const seen = new Set();
    const unique = skills.filter(s => {
        if (seen.has(s.name)) return false;
        seen.add(s.name);
        return true;
    });
    _cache = { skills: unique, loadedAt: Date.now() };
    return unique;
}

export const skillLoader = {
    async getSkillsForPrompt() {
        if (!window.electronAPI) return '';
        try {
            const skills = await _refresh();
            if (!skills.length) return '';
            const items = skills.map(s =>
                `  <skill>\n    <name>${s.name}</name>\n    <description>${s.description}</description>\n    <location>${s.path}</location>\n  </skill>`
            ).join('\n');
            return `<available_skills>\n${items}\n</available_skills>\n\nWhen a user request matches a skill's description, read its file and follow its instructions.`;
        } catch {
            return '';
        }
    },
    invalidate() { _cache = null; },
};
