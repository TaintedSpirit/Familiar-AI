import React, { useEffect, useState, useCallback } from 'react';
import { BookOpen, Plus, Trash2, RefreshCw, Save, X, FileText } from 'lucide-react';
import { skillLoader } from '../../../services/soul/SkillLoader';

const TEMPLATE = `---
name: my-skill
description: One short line describing what this skill does and when to use it.
when-to-use: User asks for X, or screen shows Y.
allowed-tools: [web_search, scrape_url]
---
# My Skill

Step-by-step playbook the agent should follow when this skill is loaded:

1. Do this first.
2. Then this.
3. Verify by doing that.
`;

export default function SkillsAuthoring() {
    const [skills, setSkills]       = useState([]);
    const [loading, setLoading]     = useState(false);
    const [primaryDir, setPrimaryDir] = useState(null);
    const [selected, setSelected]   = useState(null); // skill or { _new: true }
    const [draft, setDraft]         = useState('');   // raw markdown w/ frontmatter
    const [error, setError]         = useState(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const list = await skillLoader.list({ refresh: true });
            const dir = await skillLoader.getPrimaryDir();
            setSkills(list);
            setPrimaryDir(dir);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
        return skillLoader.subscribe(refresh);
    }, [refresh]);

    const openNew = () => {
        setSelected({ _new: true, name: '(unsaved)' });
        setDraft(TEMPLATE);
        setError(null);
    };

    const openSkill = (s) => {
        setSelected(s);
        setDraft(s.raw || '');
        setError(null);
    };

    const closeEditor = () => {
        setSelected(null);
        setDraft('');
        setError(null);
    };

    const handleSave = async () => {
        setError(null);
        try {
            const { meta, body } = skillLoader.parseFrontmatter(draft);
            const name = (meta.name || '').trim();
            if (!name) throw new Error('Frontmatter must include a `name` field.');
            await skillLoader.saveSkill({ slug: name, meta, body });
            await refresh();
            closeEditor();
        } catch (e) {
            setError(e.message || String(e));
        }
    };

    const handleDelete = async (s) => {
        if (!s?.path) return;
        if (!window.confirm(`Delete skill "${s.name}"? This removes ${s.path}.`)) return;
        try {
            await skillLoader.deleteSkill(s.path);
            if (selected?.path === s.path) closeEditor();
        } catch (e) {
            setError(e.message || String(e));
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-purple-300/70" />
                    <span className="text-[9px] uppercase tracking-widest text-white/40">Skills</span>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={refresh}
                        disabled={loading}
                        className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors disabled:opacity-30"
                    >
                        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    <button
                        onClick={openNew}
                        className="flex items-center gap-1 text-[10px] text-purple-300/70 hover:text-purple-300 transition-colors"
                    >
                        <Plus className="w-3 h-3" />
                        New
                    </button>
                </div>
            </div>

            {primaryDir && (
                <div className="text-[9px] text-white/25 font-mono truncate" title={primaryDir}>
                    {primaryDir}
                </div>
            )}
            {!primaryDir && (
                <div className="text-[10px] text-yellow-400/60 italic">
                    No project root configured — set one to enable skill authoring.
                </div>
            )}

            {/* List */}
            {!selected && (
                <div className="space-y-1.5">
                    {skills.length === 0 && (
                        <div className="flex flex-col items-center py-6 text-white/20 text-xs italic gap-1">
                            <FileText className="w-5 h-5 mb-1 opacity-30" />
                            No skills yet — click New to create one.
                        </div>
                    )}
                    {skills.map(s => (
                        <div
                            key={s.path}
                            className="group bg-white/5 border border-white/5 rounded-xl px-3 py-2.5 flex items-center gap-3 hover:border-purple-500/30 transition-colors cursor-pointer"
                            onClick={() => openSkill(s)}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="text-xs text-white/80 font-mono truncate flex items-center gap-2">
                                    {s.name}
                                    {!s.hasFrontmatter && (
                                        <span className="text-[8px] uppercase tracking-wider text-yellow-400/60 px-1.5 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20">
                                            legacy
                                        </span>
                                    )}
                                </div>
                                <div className="text-[10px] text-white/40 truncate mt-0.5">{s.description || '(no description)'}</div>
                                {s.allowedTools?.length > 0 && (
                                    <div className="text-[9px] text-white/25 font-mono truncate mt-0.5">
                                        tools: {s.allowedTools.join(', ')}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(s); }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                title="Delete skill"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Editor */}
            {selected && (
                <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="text-[10px] text-purple-300/70 font-mono truncate">
                            {selected._new ? 'New skill' : selected.path}
                        </div>
                        <button onClick={closeEditor} className="text-white/30 hover:text-white/60">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <textarea
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        spellCheck={false}
                        className="w-full h-72 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-[11px] font-mono leading-relaxed focus:outline-none focus:border-purple-500/40 resize-none"
                    />
                    {error && (
                        <div className="text-[10px] text-red-400/80 font-mono">{error}</div>
                    )}
                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={handleSave}
                            disabled={!primaryDir}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] bg-purple-500/20 text-purple-200 border border-purple-500/30 hover:bg-purple-500/30 transition-colors disabled:opacity-30"
                        >
                            <Save className="w-3 h-3" />
                            Save
                        </button>
                        {!selected._new && (
                            <button
                                onClick={() => handleDelete(selected)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] bg-white/5 text-white/40 border border-white/10 hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/20 transition-colors"
                            >
                                <Trash2 className="w-3 h-3" />
                                Delete
                            </button>
                        )}
                        <button
                            onClick={closeEditor}
                            className="px-3 py-1.5 rounded-lg text-[10px] bg-white/5 text-white/40 border border-white/10 hover:text-white/60 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                    <div className="text-[9px] text-white/25 italic pt-1">
                        Frontmatter: <code className="text-white/40">name</code>, <code className="text-white/40">description</code> required;
                        {' '}<code className="text-white/40">when-to-use</code>, <code className="text-white/40">allowed-tools</code> optional. Body is fetched on demand via <code className="text-white/40">read_skill</code>.
                    </div>
                </div>
            )}
        </div>
    );
}
