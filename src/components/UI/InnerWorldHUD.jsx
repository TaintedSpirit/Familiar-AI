import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Shield, Activity, Target, AlertTriangle, BookOpen, Brain, Crosshair,
    Edit3, Save, XCircle,
    ChevronRight, Folder, FileText,
    SquarePen, FolderPlus, ArrowUpDown, LayoutPanelLeft, ChevronsDownUp,
} from 'lucide-react';
import { useInnerWorldStore } from '../../services/innerworld/InnerWorldStore';
import { useFormStore } from '../../services/forms/FormStore';
import { soulLoader } from '../../services/soul/SoulLoader';
import MemorySearchPanel from './MemorySearchPanel';
import { memoryClient } from '../../services/memory2/MemoryClient';

// ─── Simple Markdown Renderer ─────────────────────────────────────────────────
function renderMarkdown(text) {
    if (!text?.trim()) {
        return <div className="text-white/20 italic text-center py-6 text-xs">Empty file. Click edit to add content.</div>;
    }
    return text.split('\n').map((line, i) => {
        if (line.startsWith('# ')) {
            return <h1 key={i} className="text-amber-300 font-bold text-sm mt-3 mb-1 first:mt-0">{line.slice(2)}</h1>;
        }
        if (line.startsWith('## ')) {
            return <h2 key={i} className="text-amber-200/70 font-semibold text-xs mt-2 mb-1 tracking-wide uppercase">{line.slice(3)}</h2>;
        }
        if (line.startsWith('### ')) {
            return <h3 key={i} className="text-white/60 font-semibold text-xs mt-1.5 mb-0.5">{line.slice(4)}</h3>;
        }
        if (line.match(/^[-*] /)) {
            const content = parseBold(line.slice(2));
            return (
                <div key={i} className="flex gap-2 text-white/75 text-xs leading-relaxed py-0.5">
                    <span className="text-amber-400/80 shrink-0 mt-0.5">·</span>
                    <span>{content}</span>
                </div>
            );
        }
        if (line.match(/^\d+\. /)) {
            const num = line.match(/^(\d+)\. /)[1];
            const content = parseBold(line.replace(/^\d+\. /, ''));
            return (
                <div key={i} className="flex gap-2 text-white/75 text-xs leading-relaxed py-0.5">
                    <span className="text-amber-400/60 shrink-0 font-mono w-4 text-right">{num}.</span>
                    <span>{content}</span>
                </div>
            );
        }
        if (line.startsWith('_') && line.endsWith('_') && line.length > 2) {
            return <p key={i} className="text-white/40 text-xs italic leading-relaxed py-0.5">{line.slice(1, -1)}</p>;
        }
        if (line.trim() === '') {
            return <div key={i} className="h-1.5" />;
        }
        return (
            <p key={i} className="text-white/70 text-xs leading-relaxed py-0.5">
                {parseBold(line)}
            </p>
        );
    });
}

function parseBold(text) {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, j) =>
        j % 2 === 1
            ? <strong key={j} className="text-white font-semibold">{part}</strong>
            : part
    );
}

// ─── Tree Definition ──────────────────────────────────────────────────────────
// Each folder has an id, label, and children (the "files" that open in the right pane).
const TREE = [
    {
        id: 'core',
        label: 'CORE',
        children: [
            { id: 'telemetry', label: 'telemetry', icon: Activity },
        ],
    },
    {
        id: 'soul',
        label: 'SOUL',
        children: [
            { id: 'soul.md', label: 'soul.md', icon: BookOpen, file: 'soul.md' },
        ],
    },
    {
        id: 'memory',
        label: 'MEMORY',
        children: [
            { id: 'memory.md', label: 'memory.md', icon: Brain, file: 'memory.md' },
            { id: 'search', label: 'search', icon: FileText },
        ],
    },
    {
        id: 'goals',
        label: 'GOALS',
        children: [
            { id: 'goals.md', label: 'goals.md', icon: Crosshair, file: 'goals.md' },
        ],
    },
];

// ─── Tree Rows ────────────────────────────────────────────────────────────────
function TreeFolder({ folder, expanded, onToggle, children }) {
    return (
        <div>
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold tracking-widest text-white/70 hover:bg-white/5 rounded select-none"
            >
                <ChevronRight
                    className={`w-3 h-3 text-white/40 transition-transform ${expanded ? 'rotate-90' : ''}`}
                />
                <Folder className="w-3 h-3 text-white/40" />
                <span>{folder.label}</span>
            </button>
            {expanded && <div>{children}</div>}
        </div>
    );
}

function TreeFile({ file, selected, onSelect }) {
    const Icon = file.icon || FileText;
    return (
        <button
            onClick={onSelect}
            className={`w-full flex items-center gap-2 pl-8 pr-2 py-1 text-[11px] rounded select-none transition-colors ${
                selected
                    ? 'bg-white/10 text-white'
                    : 'text-white/50 hover:bg-white/5 hover:text-white/80'
            }`}
        >
            <Icon className="w-3 h-3 shrink-0" />
            <span className="truncate">{file.label}</span>
        </button>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const InnerWorldHUD = () => {
    const { isOpen, snapshot, setOpen, evaluate } = useInnerWorldStore();
    const trustLevel = useFormStore(s => s.metrics?.trustLevel || 'unknown');

    const [selected, setSelected] = useState({ folder: 'core', file: 'telemetry' });
    const [expanded, setExpanded] = useState({ core: true, soul: false, memory: false, goals: false });
    const [sidebarVisible, setSidebarVisible] = useState(true);

    const [soulFiles, setSoulFiles] = useState({ 'soul.md': '', 'memory.md': '', 'goals.md': '' });
    const [editMode, setEditMode] = useState(false);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);

    // 2-second heartbeat for CORE telemetry
    useEffect(() => {
        if (!isOpen) return;
        evaluate();
        const interval = setInterval(evaluate, 2000);
        return () => clearInterval(interval);
    }, [isOpen]);

    // Load soul files when a soul file is selected
    const currentSoulFile = TREE
        .find(f => f.id === selected.folder)
        ?.children.find(c => c.id === selected.file)
        ?.file;

    useEffect(() => {
        if (!isOpen || !currentSoulFile) return;
        window.electronAPI?.readSoulFiles?.().then(data => {
            if (data) setSoulFiles({
                'soul.md': data['soul.md'] || '',
                'memory.md': data['memory.md'] || '',
                'goals.md': data['goals.md'] || '',
            });
        }).catch(() => {});
    }, [currentSoulFile, isOpen]);

    const currentContent = currentSoulFile ? soulFiles[currentSoulFile] : '';

    const startEdit = useCallback(() => {
        setDraft(currentContent);
        setEditMode(true);
    }, [currentContent]);

    const cancelEdit = useCallback(() => {
        setEditMode(false);
        setDraft('');
    }, []);

    const saveEdit = useCallback(async () => {
        if (!currentSoulFile) return;
        setSaving(true);
        try {
            await window.electronAPI?.writeSoulFile?.(currentSoulFile, draft);
            setSoulFiles(prev => ({ ...prev, [currentSoulFile]: draft }));
            await soulLoader.reload();
            try { await memoryClient.rescan(); } catch (_) { /* ignore */ }
        } catch (e) {
            console.error('[InnerWorldHUD] Soul save failed:', e);
        } finally {
            setSaving(false);
            setEditMode(false);
        }
    }, [currentSoulFile, draft]);

    const selectFile = (folder, file) => {
        setSelected({ folder, file });
        setEditMode(false);
        setDraft('');
    };

    const toggleFolder = (id) => {
        setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const collapseAll = () => {
        setExpanded({ core: false, soul: false, memory: false, goals: false });
    };

    const riskColor = snapshot?.riskProfile?.level === 'high' ? 'text-red-400' :
        snapshot?.riskProfile?.level === 'medium' ? 'text-yellow-400' : 'text-green-400';

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    drag
                    dragMomentum={false}
                    dragElastic={0.1}
                    dragConstraints={{ left: -3000, right: 3000, top: -2000, bottom: 2000 }}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="fixed top-24 left-24 w-[720px] h-[560px] bg-black/90 backdrop-blur-sm border border-white/10 rounded-lg shadow-2xl z-[9999] overflow-hidden font-mono text-xs flex flex-col pointer-events-auto"
                    onMouseEnter={() => window.electronAPI?.send('set-ignore-mouse-events', false)}
                    onMouseLeave={() => window.electronAPI?.send('set-ignore-mouse-events', true, { forward: true })}
                >
                    {/* Toolbar */}
                    <div className="h-10 shrink-0 flex items-center justify-between px-2 border-b border-white/5 bg-white/[0.02] cursor-move select-none">
                        <div className="flex items-center gap-0.5">
                            <ToolbarButton title="New note" icon={SquarePen} onClick={() => selectFile('soul', 'soul.md')} />
                            <ToolbarButton title="New folder" icon={FolderPlus} onClick={() => {}} />
                            <ToolbarButton title="Sort" icon={ArrowUpDown} onClick={() => {}} />
                            <ToolbarButton title="Toggle sidebar" icon={LayoutPanelLeft} onClick={() => setSidebarVisible(v => !v)} />
                            <ToolbarButton title="Collapse all" icon={ChevronsDownUp} onClick={collapseAll} />
                        </div>
                        <button
                            onClick={() => setOpen(false)}
                            className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded transition-colors"
                            title="Close"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex flex-1 overflow-hidden">
                        {/* Tree */}
                        {sidebarVisible && (
                            <aside className="w-56 shrink-0 border-r border-white/5 overflow-y-auto py-2 px-1 bg-black/20">
                                {TREE.map(folder => (
                                    <TreeFolder
                                        key={folder.id}
                                        folder={folder}
                                        expanded={!!expanded[folder.id]}
                                        onToggle={() => toggleFolder(folder.id)}
                                    >
                                        {folder.children.map(child => (
                                            <TreeFile
                                                key={child.id}
                                                file={child}
                                                selected={selected.folder === folder.id && selected.file === child.id}
                                                onSelect={() => selectFile(folder.id, child.id)}
                                            />
                                        ))}
                                    </TreeFolder>
                                ))}
                            </aside>
                        )}

                        {/* Right pane */}
                        <section className="flex-1 overflow-hidden flex flex-col">
                            {selected.folder === 'core' && selected.file === 'telemetry' && (
                                <CoreView snapshot={snapshot} trustLevel={trustLevel} riskColor={riskColor} />
                            )}

                            {selected.folder === 'memory' && selected.file === 'search' && (
                                <div className="overflow-y-auto flex-1">
                                    <MemorySearchPanel />
                                </div>
                            )}

                            {currentSoulFile && (
                                <SoulView
                                    file={currentSoulFile}
                                    content={currentContent}
                                    editMode={editMode}
                                    draft={draft}
                                    saving={saving}
                                    setDraft={setDraft}
                                    startEdit={startEdit}
                                    cancelEdit={cancelEdit}
                                    saveEdit={saveEdit}
                                />
                            )}
                        </section>
                    </div>

                    {/* Footer */}
                    <div className="h-7 shrink-0 border-t border-white/5 px-3 flex items-center justify-between text-[10px] text-white/30 bg-white/[0.02]">
                        <span className="lowercase tracking-wide">inner_world</span>
                        <span>
                            SYNC {snapshot?.timestamp ? new Date(snapshot.timestamp).toLocaleTimeString() : 'PENDING'}
                        </span>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

// ─── Toolbar Button ───────────────────────────────────────────────────────────
function ToolbarButton({ icon, onClick, title }) {
    const IconCmp = icon;
    return (
        <button
            onClick={onClick}
            title={title}
            className="p-1.5 text-white/40 hover:text-white/90 hover:bg-white/10 rounded transition-colors"
        >
            <IconCmp className="w-3.5 h-3.5" />
        </button>
    );
}

// ─── CORE View ────────────────────────────────────────────────────────────────
function CoreView({ snapshot, trustLevel, riskColor }) {
    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Focus Block */}
            <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-white/40">
                    Active Focus // {snapshot?.focus?.source || 'SYSTEM'}
                </p>
                <div className="bg-white/5 p-2 rounded border border-white/10">
                    <div className="text-white font-bold truncate">{snapshot?.focus?.appName || 'Unknown App'}</div>
                    <div className="text-white/60 truncate">{snapshot?.focus?.windowTitle || 'No Focus'}</div>
                </div>
            </div>

            {/* Telemetry Grid */}
            <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/5 p-2 rounded border border-white/10 flex flex-col gap-1">
                    <span className="text-[10px] text-white/40">RISK PROFILE</span>
                    <div className={`flex items-center gap-1.5 font-bold ${riskColor}`}>
                        <AlertTriangle className="w-3 h-3" />
                        {snapshot?.riskProfile?.level?.toUpperCase() || 'UNKNOWN'}
                    </div>
                </div>
                <div className="bg-white/5 p-2 rounded border border-white/10 flex flex-col gap-1">
                    <span className="text-[10px] text-white/40">TRUST LEVEL</span>
                    <div className="flex items-center gap-1.5 font-bold text-blue-400">
                        <Shield className="w-3 h-3" />
                        {trustLevel.toUpperCase()}
                    </div>
                </div>
            </div>

            {/* Risk Reasons */}
            {snapshot?.riskProfile?.reasons?.length > 0 && (
                <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-white/40">Risk Factors</p>
                    <div className="space-y-1">
                        {snapshot.riskProfile.reasons.map((reason, i) => (
                            <div key={i} className="flex items-start gap-1.5 bg-red-500/10 border border-red-500/20 rounded p-1.5">
                                <AlertTriangle className="w-2.5 h-2.5 text-red-400 mt-0.5 shrink-0" />
                                <span className="text-[9px] text-red-300 leading-snug">{reason}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Strategic Plan */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-wider text-white/40">Strategy</p>
                    {snapshot?.plan?.status === 'active' && (
                        <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 rounded">ACTIVE</span>
                    )}
                </div>
                <div className="bg-white/5 p-2 rounded border border-white/10 relative overflow-hidden">
                    {snapshot?.plan?.status === 'active' ? (
                        <>
                            <div className="flex items-center gap-2 mb-1 text-indigo-300 font-bold">
                                <Target className="w-3 h-3" />
                                <span>{snapshot.plan.title}</span>
                            </div>
                            <div className="w-full bg-white/10 h-1 rounded-full mt-2">
                                <div
                                    className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                                    style={{ width: `${(snapshot.plan.stepIndex / Math.max(1, snapshot.plan.stepCount)) * 100}%` }}
                                />
                            </div>
                            <div className="text-[9px] text-right mt-1 text-white/40">
                                Step {snapshot.plan.stepIndex + 1} / {snapshot.plan.stepCount}
                            </div>
                        </>
                    ) : (
                        <div className="text-white/30 italic text-center py-2">No active strategy.</div>
                    )}
                </div>
            </div>

            {/* Options Projection */}
            <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-white/40">Projected Actions (Simulated)</p>
                <div className="space-y-1">
                    {(snapshot?.options || []).map((opt, i) => (
                        <div
                            key={opt.id || i}
                            title={opt.simulation?.summary?.reason || ''}
                            className={`flex items-center justify-between bg-white/5 p-1.5 rounded border transition-colors group ${opt.blocked ? 'border-red-500/30 opacity-70' : 'border-white/5 hover:bg-white/10'}`}
                        >
                            <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-2">
                                    <span className={`text-white/90 font-medium ${opt.blocked ? 'line-through text-red-300' : 'group-hover:text-indigo-300'}`}>{opt.label}</span>
                                    {opt.blocked && <span className="text-[8px] bg-red-500/80 text-white px-1 rounded">BLOCKED</span>}
                                    {opt.impact?.map((imp, idx) => (
                                        <span key={idx} className="text-[8px] bg-blue-500/20 text-blue-300 px-1 rounded border border-blue-500/30">{imp}</span>
                                    ))}
                                </div>
                                <span className="text-[9px] text-white/40">{opt.reason}</span>
                            </div>
                            <div className="flex flex-col items-end gap-0.5">
                                <div className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${opt.risk === 'high' || opt.risk === 'critical' ? 'bg-red-900/40 text-red-200' : opt.risk === 'medium' ? 'bg-yellow-900/40 text-yellow-200' : 'bg-green-900/40 text-green-200'}`}>
                                    {Math.round((opt.confidence || 0) * 100)}%
                                </div>
                                <span className="text-[8px] text-white/20">{opt.simulation?.simulations?.length || 0} CHECKS</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Soul File View (read + edit) ─────────────────────────────────────────────
function SoulView({ file, content, editMode, draft, saving, setDraft, startEdit, cancelEdit, saveEdit }) {
    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            {/* File toolbar */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 shrink-0">
                <span className="text-[10px] text-amber-400/60 tracking-widest uppercase">
                    {file}
                </span>
                {!editMode ? (
                    <button
                        onClick={startEdit}
                        className="flex items-center gap-1 text-[10px] text-white/40 hover:text-amber-300 transition-colors"
                    >
                        <Edit3 className="w-3 h-3" />
                        Edit
                    </button>
                ) : (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={cancelEdit}
                            className="flex items-center gap-1 text-[10px] text-white/40 hover:text-red-400 transition-colors"
                        >
                            <XCircle className="w-3 h-3" />
                            Cancel
                        </button>
                        <button
                            onClick={saveEdit}
                            disabled={saving}
                            className="flex items-center gap-1 text-[10px] text-amber-300 hover:text-amber-100 transition-colors disabled:opacity-50"
                        >
                            <Save className="w-3 h-3" />
                            {saving ? 'Saving…' : 'Save'}
                        </button>
                    </div>
                )}
            </div>

            {/* Read or edit */}
            {!editMode ? (
                <div className="p-4 space-y-0.5 overflow-y-auto flex-1">
                    {renderMarkdown(content)}
                </div>
            ) : (
                <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    spellCheck={false}
                    className="flex-1 w-full bg-transparent text-white/80 text-xs font-mono p-4 resize-none outline-none border-none leading-relaxed placeholder:text-white/20"
                    placeholder={`# Write your ${file} here…`}
                />
            )}
        </div>
    );
}

export default InnerWorldHUD;
