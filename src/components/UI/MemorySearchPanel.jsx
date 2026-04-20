import React, { useEffect, useMemo, useState } from 'react';
import { Search, Database, Tag } from 'lucide-react';
import { memoryClient } from '../../services/memory2/MemoryClient';

const TYPE_COLOR = {
    user: 'text-emerald-300 bg-emerald-900/20 border-emerald-500/30',
    feedback: 'text-amber-300 bg-amber-900/20 border-amber-500/30',
    project: 'text-indigo-300 bg-indigo-900/20 border-indigo-500/30',
    reference: 'text-sky-300 bg-sky-900/20 border-sky-500/30',
    soul: 'text-rose-300 bg-rose-900/20 border-rose-500/30',
    'innerworld-rule': 'text-red-300 bg-red-900/20 border-red-500/30',
    derived: 'text-white/40 bg-white/5 border-white/10'
};

export default function MemorySearchPanel() {
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState([]);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({ count: 0, byType: {}, lastIndexed: 0 });
    const [selectedId, setSelectedId] = useState(null);
    const [selectedBody, setSelectedBody] = useState('');

    const refreshStats = async () => {
        try { setStats(await memoryClient.stats()); } catch (_) { /* ignore */ }
    };

    useEffect(() => {
        refreshStats();
        const off = memoryClient.onChanged(() => refreshStats());
        return () => { try { off && off(); } catch (_) { } };
    }, []);

    useEffect(() => {
        if (!query.trim()) { setHits([]); return; }
        const handle = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await memoryClient.search(query, { limit: 8 });
                setHits(res.hits || []);
            } catch (e) {
                console.warn('[MemorySearchPanel] search failed', e);
            } finally {
                setLoading(false);
            }
        }, 200);
        return () => clearTimeout(handle);
    }, [query]);

    const typeBadges = useMemo(() => {
        return Object.entries(stats.byType || {}).sort((a, b) => b[1] - a[1]);
    }, [stats]);

    const openHit = async (hit) => {
        setSelectedId(hit.id);
        try {
            const rec = await memoryClient.get({ id: hit.id });
            setSelectedBody(rec?.body || '');
        } catch (_) {
            setSelectedBody('(failed to load)');
        }
    };

    return (
        <div className="p-3 border-b border-white/5 space-y-2">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/40">
                <Database className="w-3 h-3" />
                <span>Memory Index</span>
                <span className="ml-auto text-white/30">{stats.count} entries</span>
            </div>

            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded px-2 py-1">
                <Search className="w-3 h-3 text-white/40 shrink-0" />
                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="search memory…"
                    className="flex-1 bg-transparent text-[11px] text-white/80 placeholder:text-white/20 outline-none"
                />
                {loading && <span className="text-[9px] text-white/40">…</span>}
            </div>

            {!query.trim() && typeBadges.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {typeBadges.map(([t, c]) => (
                        <span key={t} className={`text-[9px] px-1.5 py-0.5 rounded border ${TYPE_COLOR[t] || TYPE_COLOR.derived}`}>
                            {t}·{c}
                        </span>
                    ))}
                </div>
            )}

            {hits.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                    {hits.map(h => (
                        <button
                            key={h.id}
                            onClick={() => openHit(h)}
                            className={`w-full text-left p-1.5 rounded border transition-colors ${
                                selectedId === h.id ? 'bg-white/10 border-amber-400/40' : 'bg-white/5 border-white/10 hover:bg-white/10'
                            }`}
                        >
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <span className={`text-[8px] px-1 rounded border ${TYPE_COLOR[h.type] || TYPE_COLOR.derived}`}>{h.type}</span>
                                <span className="text-[9px] text-white/30 truncate flex-1">{h.path}</span>
                                <span className="text-[9px] text-white/40">{h.score.toFixed(2)}</span>
                            </div>
                            <div className="text-[10px] text-white/70 leading-snug line-clamp-3">{h.snippet}</div>
                        </button>
                    ))}
                </div>
            )}

            {selectedId && selectedBody && (
                <div className="p-2 bg-black/40 border border-white/10 rounded max-h-40 overflow-y-auto">
                    <div className="text-[9px] uppercase tracking-widest text-amber-300/60 mb-1 flex items-center gap-1">
                        <Tag className="w-2.5 h-2.5" /> Selected
                    </div>
                    <pre className="text-[10px] text-white/70 whitespace-pre-wrap font-mono">{selectedBody}</pre>
                </div>
            )}

            {query.trim() && !loading && hits.length === 0 && (
                <div className="text-[10px] text-white/30 italic text-center py-2">No matches.</div>
            )}
        </div>
    );
}
