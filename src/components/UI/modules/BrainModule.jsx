import React, { useState, useEffect, useRef } from 'react';
import { Database, FolderOpen, Search, Plus, Clock, Scissors, Trash2, Download, AlertTriangle } from 'lucide-react';
import { useMemoryStore } from '../../../services/memory/MemoryStore';
import { useSettingsStore } from '../../../services/settings/SettingsStore';
import { memoryClient } from '../../../services/memory2/MemoryClient';

const BrainModule = ({ activeTab }) => {
    const { projects, activeProjectId, addMemory, clearMessages } = useMemoryStore();
    const { maxMessageHistory, setMaxMessageHistory } = useSettingsStore();
    const activeProject = projects.find(p => p.id === activeProjectId);

    const [localTab, setLocalTab]         = useState(activeTab ?? 'memory');
    const [query, setQuery]               = useState('');
    const [results, setResults]           = useState([]);
    const [recentFacts, setRecentFacts]   = useState([]);
    const [stats, setStats]               = useState(null);
    const [searching, setSearching]       = useState(false);
    const [newFact, setNewFact]           = useState('');
    const debounceRef                     = useRef(null);

    useEffect(() => { setLocalTab(activeTab); }, [activeTab]);

    useEffect(() => {
        const load = async () => {
            const [s, l] = await Promise.all([memoryClient.stats(), memoryClient.list({ limit: 15 })]);
            setStats(s);
            setRecentFacts(l.items ?? []);
        };
        load();
    }, []);

    useEffect(() => {
        clearTimeout(debounceRef.current);
        if (!query.trim()) { setResults([]); setSearching(false); return; }
        setSearching(true);
        debounceRef.current = setTimeout(async () => {
            const res = await memoryClient.search(query.trim(), { limit: 20 });
            setResults(res.hits ?? []);
            setSearching(false);
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [query]);

    const handleAddFact = () => {
        const trimmed = newFact.trim();
        if (!trimmed) return;
        addMemory(trimmed);
        setNewFact('');
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Sub-tab bar */}
            <div className="flex shrink-0 border-b border-white/5 bg-black/10">
                {[
                    { id: 'memory',   icon: Database,   label: 'Facts'    },
                    { id: 'projects', icon: FolderOpen, label: 'Projects' },
                    { id: 'pruning',  icon: Scissors,   label: 'Pruning'  },
                ].map(({ id, icon: Icon, label }) => (
                    <button
                        key={id}
                        onClick={() => setLocalTab(id)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] uppercase tracking-wider transition-colors border-b-2 ${
                            localTab === id
                                ? 'border-blue-400 text-blue-300'
                                : 'border-transparent text-white/30 hover:text-white/60'
                        }`}
                    >
                        <Icon className="w-3 h-3" />
                        {label}
                    </button>
                ))}
                {stats && (
                    <div className="ml-auto flex items-center px-4 text-[10px] text-white/25">
                        {stats.count} indexed
                    </div>
                )}
            </div>

            {/* FACTS TAB */}
            {localTab === 'memory' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-3 border-b border-white/5 shrink-0">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                            <input
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Search long-term memory…"
                                className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-white/80 text-xs focus:outline-none focus:border-white/20"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {searching && (
                            <div className="flex items-center gap-2 text-white/30 text-xs px-1">
                                <div className="w-3 h-3 border border-white/20 border-t-white/60 rounded-full animate-spin" />
                                Searching…
                            </div>
                        )}

                        {!searching && query && results.length === 0 && (
                            <p className="text-white/25 text-xs italic px-1">No results for "{query}"</p>
                        )}

                        {(query ? results : recentFacts).map((item, i) => (
                            <div key={item.id ?? i} className="bg-white/5 border border-white/5 rounded-xl px-3 py-2.5">
                                <p className="text-white/70 text-xs leading-relaxed">{item.body ?? item.text ?? JSON.stringify(item)}</p>
                                {item.created && (
                                    <div className="flex items-center gap-1 mt-1.5 text-[9px] text-white/25">
                                        <Clock className="w-2.5 h-2.5" />
                                        {new Date(item.created).toLocaleDateString()}
                                    </div>
                                )}
                            </div>
                        ))}

                        {!query && recentFacts.length === 0 && !searching && (
                            <div className="flex flex-col items-center py-8 text-white/20 text-xs italic gap-1">
                                <Database className="w-5 h-5 mb-1 opacity-30" />
                                No long-term memories yet.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* PROJECTS TAB */}
            {localTab === 'projects' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Project memory facts */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        <div className="text-[9px] uppercase tracking-widest text-white/25 mb-1">
                            {activeProject?.name ?? 'No project'} — Session Facts
                        </div>

                        {(!activeProject?.memory || activeProject.memory.length === 0) && (
                            <div className="flex flex-col items-center py-8 text-white/20 text-xs italic gap-1">
                                <FolderOpen className="w-5 h-5 mb-1 opacity-30" />
                                No facts for this project.
                            </div>
                        )}

                        {(activeProject?.memory ?? []).map((fact, i) => (
                            <div key={fact.id ?? i} className="bg-white/5 border border-white/5 rounded-xl px-3 py-2.5">
                                <p className="text-white/70 text-xs leading-relaxed">{fact.text}</p>
                                {fact.timestamp && (
                                    <div className="flex items-center gap-1 mt-1.5 text-[9px] text-white/25">
                                        <Clock className="w-2.5 h-2.5" />
                                        {new Date(fact.timestamp).toLocaleTimeString()}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Add fact input */}
                    <div className="shrink-0 p-3 border-t border-white/5 bg-black/10">
                        <div className="flex gap-2">
                            <input
                                value={newFact}
                                onChange={e => setNewFact(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddFact()}
                                placeholder="Add a session fact…"
                                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-white/80 text-xs focus:outline-none focus:border-white/20"
                            />
                            <button
                                onClick={handleAddFact}
                                disabled={!newFact.trim()}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 text-xs border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                <Plus className="w-3 h-3" />
                                Add
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* PRUNING TAB */}
            {localTab === 'pruning' && (
                <PruningTab
                    activeProject={activeProject}
                    maxMessageHistory={maxMessageHistory}
                    setMaxMessageHistory={setMaxMessageHistory}
                    clearMessages={clearMessages}
                />
            )}
        </div>
    );
};

// Extracted to avoid nesting hooks conditionally
const PruningTab = ({ activeProject, maxMessageHistory, setMaxMessageHistory, clearMessages }) => {
    const [confirmClear, setConfirmClear] = useState(false);
    const msgCount = activeProject?.messages?.filter(m => m.role !== 'system').length ?? 0;

    const handleExport = () => {
        const blob = new Blob(
            [JSON.stringify(activeProject?.messages ?? [], null, 2)],
            { type: 'application/json' }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeProject?.name ?? 'chat'}-export-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleClear = () => {
        if (!confirmClear) { setConfirmClear(true); return; }
        clearMessages();
        setConfirmClear(false);
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Context Management</div>

            {/* Current context stats */}
            <div className="bg-white/5 border border-white/5 rounded-xl px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs text-white/50">Current messages</span>
                <span className={`font-mono text-xs ${
                    maxMessageHistory > 0 && msgCount >= maxMessageHistory
                        ? 'text-yellow-400'
                        : 'text-white/60'
                }`}>{msgCount}{maxMessageHistory > 0 ? ` / ${maxMessageHistory}` : ''}</span>
            </div>

            {/* Max history slider */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="text-[9px] uppercase tracking-widest text-white/30">Max History</div>
                    <span className="text-[10px] font-mono text-white/40">
                        {maxMessageHistory === 0 ? 'Unlimited' : `${maxMessageHistory} messages`}
                    </span>
                </div>
                <input
                    type="range" min={0} max={200} step={10}
                    value={maxMessageHistory}
                    onChange={e => setMaxMessageHistory(Number(e.target.value))}
                    className="w-full accent-blue-400"
                />
                <div className="flex justify-between text-[9px] text-white/20">
                    <span>Unlimited</span>
                    <span>200</span>
                </div>
                {maxMessageHistory > 0 && (
                    <div className="flex items-start gap-2 text-[10px] text-white/30 bg-white/5 border border-white/5 rounded-lg px-3 py-2">
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-yellow-400/60" />
                        The agent will request compaction when history exceeds this limit.
                    </div>
                )}
            </div>

            {/* Archive / Export */}
            <div className="space-y-2">
                <div className="text-[9px] uppercase tracking-widest text-white/30">Archive</div>
                <button
                    onClick={handleExport}
                    disabled={msgCount === 0}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/5 text-white/50 text-xs hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                    <Download className="w-3.5 h-3.5" />
                    Export Chat as JSON
                </button>
            </div>

            {/* Clear history */}
            <div className="space-y-2">
                <div className="text-[9px] uppercase tracking-widest text-white/30">Danger Zone</div>
                <button
                    onClick={handleClear}
                    disabled={msgCount === 0}
                    onBlur={() => setConfirmClear(false)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                        confirmClear
                            ? 'bg-red-500/20 border-red-500/40 text-red-300 hover:bg-red-500/30'
                            : 'bg-white/5 border-white/5 text-white/40 hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/20'
                    }`}
                >
                    <Trash2 className="w-3.5 h-3.5" />
                    {confirmClear ? 'Click again to confirm clear' : 'Clear Chat History'}
                </button>
            </div>
        </div>
    );
};

export default BrainModule;
