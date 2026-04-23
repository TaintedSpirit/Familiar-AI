import React, { useState, useEffect } from 'react';
import { ShieldCheck, FolderLock, History, Trash2, RotateCcw, Plus, X } from 'lucide-react';
import { useSettingsStore } from '../../../services/settings/SettingsStore';
import { useSafetyStore } from '../../../services/safety/SafetyStore';

const POLICY_LABELS = { allow: 'Allow', ask: 'Ask', deny: 'Deny' };
const POLICY_STYLES = {
    allow: 'bg-green-500/20 text-green-300 border-green-500/30',
    ask:   'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    deny:  'bg-red-500/20 text-red-300 border-red-500/30',
};

const SafetyModule = ({ activeTab }) => {
    const {
        toolPolicies, setToolPolicy,
        allowedWritePaths, setAllowedWritePaths,
    } = useSettingsStore();

    const { executionLog, snapshots, undoLast, clearHistory, getRecentLogs } = useSafetyStore();

    const [localTab, setLocalTab] = useState(activeTab ?? 'policies');
    const [newPath, setNewPath] = useState('');

    useEffect(() => { setLocalTab(activeTab); }, [activeTab]);

    const addPath = () => {
        const trimmed = newPath.trim();
        if (!trimmed || allowedWritePaths.includes(trimmed)) return;
        setAllowedWritePaths([...allowedWritePaths, trimmed]);
        setNewPath('');
    };

    const removePath = (path) => {
        setAllowedWritePaths(allowedWritePaths.filter(p => p !== path));
    };

    const handleUndo = () => {
        const result = undoLast();
        if (!result.success) alert(result.error);
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Sub-tab bar */}
            <div className="flex shrink-0 border-b border-white/5 bg-black/10">
                {[
                    { id: 'policies',  icon: ShieldCheck, label: 'Policies'  },
                    { id: 'paths',     icon: FolderLock,  label: 'Paths'     },
                    { id: 'snapshots', icon: History,     label: 'Log'       },
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
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">

                {/* POLICIES TAB */}
                {localTab === 'policies' && (
                    <>
                        <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Tool Execution Policies</div>
                        {Object.entries(toolPolicies).length === 0 && (
                            <p className="text-white/30 text-xs italic">No tool policies configured.</p>
                        )}
                        {Object.entries(toolPolicies).map(([tool, policy]) => (
                            <div key={tool} className="bg-white/5 border border-white/5 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
                                <span className="text-white/70 text-xs font-mono truncate">{tool}</span>
                                <div className="flex items-center gap-1 shrink-0">
                                    {(['allow', 'ask', 'deny']).map(p => (
                                        <button
                                            key={p}
                                            onClick={() => setToolPolicy(tool, p)}
                                            className={`px-2 py-0.5 rounded-lg text-[10px] border transition-colors ${
                                                policy === p
                                                    ? POLICY_STYLES[p]
                                                    : 'bg-white/5 border-white/10 text-white/30 hover:text-white/60'
                                            }`}
                                        >
                                            {POLICY_LABELS[p]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </>
                )}

                {/* PATHS TAB */}
                {localTab === 'paths' && (
                    <>
                        <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Auto-approved Write Paths</div>
                        <div className="flex gap-2">
                            <input
                                value={newPath}
                                onChange={e => setNewPath(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && addPath()}
                                placeholder="/path/to/allow"
                                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-white/80 text-xs focus:outline-none focus:border-white/20 font-mono"
                            />
                            <button
                                onClick={addPath}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 text-xs border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
                            >
                                <Plus className="w-3 h-3" />
                                Add
                            </button>
                        </div>
                        <div className="space-y-1.5">
                            {allowedWritePaths.length === 0 && (
                                <p className="text-white/30 text-xs italic py-2">No paths configured — all writes require approval.</p>
                            )}
                            {allowedWritePaths.map(path => (
                                <div key={path} className="flex items-center gap-2 bg-white/5 border border-white/5 rounded-xl px-3 py-2">
                                    <span className="flex-1 text-xs font-mono text-white/60 truncate">{path}</span>
                                    <button
                                        onClick={() => removePath(path)}
                                        className="text-white/20 hover:text-red-400 transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* SNAPSHOTS TAB */}
                {localTab === 'snapshots' && (
                    <>
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-[9px] uppercase tracking-widest text-white/30">Execution Log</div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleUndo}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 text-white/50 text-[10px] hover:text-white hover:bg-white/10 border border-white/5 transition-colors"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    Undo Last
                                </button>
                                <button
                                    onClick={clearHistory}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400/60 text-[10px] hover:text-red-300 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                                >
                                    <Trash2 className="w-3 h-3" />
                                    Clear
                                </button>
                            </div>
                        </div>
                        {executionLog.length === 0 && (
                            <p className="text-white/30 text-xs italic py-2">No execution history yet.</p>
                        )}
                        {executionLog.slice(0, 20).map(entry => (
                            <div key={entry.id} className="bg-white/5 border border-white/5 rounded-xl px-3 py-2.5 flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-xs text-white/70 truncate">{entry.summary}</div>
                                    <div className="text-[10px] text-white/30 mt-0.5 font-mono">
                                        {new Date(entry.timestamp).toLocaleTimeString()}
                                    </div>
                                </div>
                                <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-mono uppercase ${
                                    entry.status === 'applied' ? 'bg-green-500/10 text-green-400'
                                    : entry.status === 'undone' ? 'bg-yellow-500/10 text-yellow-400'
                                    : 'bg-white/5 text-white/30'
                                }`}>
                                    {entry.status}
                                </span>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
};

export default SafetyModule;
