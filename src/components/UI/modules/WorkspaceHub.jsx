import React, { useState, useEffect, useCallback } from 'react';
import {
    FolderOpen, Plus, Pin, PinOff, Trash2, ChevronRight,
    GitBranch, Clock, Star, FolderCode, RefreshCw, Search,
} from 'lucide-react';
import { useSettingsStore } from '../../../services/settings/SettingsStore';

const P = {
    page: '#110c07', border: '#3a2712', borderFaint: '#261a0d',
    gold: '#c9a84c', goldDim: '#7a6028', goldGlow: 'rgba(201,168,76,0.15)',
    ink: '#c4b49a', inkMid: '#8a7a65', inkFaint: '#4a3f30',
    runeBlue: '#4a7fa5', runeBlueDim: 'rgba(74,127,165,0.15)',
};

const fmtAge = (ts) => {
    if (!ts) return 'never';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60)  return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
};

const pathBasename = (p) => p?.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? p;

// ─── Branch badge ─────────────────────────────────────────────────────────────
const BranchBadge = ({ branch }) => {
    if (!branch) return null;
    return (
        <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full"
            style={{ background: P.runeBlueDim, border: `1px solid ${P.runeBlue}44`, color: P.runeBlue }}>
            <GitBranch className="w-2.5 h-2.5" />
            {branch}
        </span>
    );
};

// ─── Workspace card ───────────────────────────────────────────────────────────
const WorkspaceCard = ({ ws, onOpen, onPin, onRemove }) => {
    const name = ws.name || pathBasename(ws.path);
    return (
        <div
            className="group flex flex-col gap-2 p-3 rounded-lg transition-all cursor-default"
            style={{
                background: 'rgba(0,0,0,0.25)',
                border: `1px solid ${ws.pinned ? P.goldDim + '55' : P.borderFaint}`,
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = ws.pinned ? P.goldDim : P.border}
            onMouseLeave={e => e.currentTarget.style.borderColor = ws.pinned ? P.goldDim + '55' : P.borderFaint}
        >
            {/* Header row */}
            <div className="flex items-start gap-2">
                <div className="shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center rounded"
                    style={{ background: P.goldGlow, border: `1px solid ${P.goldDim}33` }}>
                    <FolderCode className="w-3.5 h-3.5" style={{ color: P.gold }} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium truncate" style={{ color: P.ink }}>{name}</div>
                    <div className="text-[9px] truncate mt-0.5" style={{ color: P.inkFaint, fontFamily: 'monospace' }}>
                        {ws.path}
                    </div>
                </div>
                {/* Action icons — visible on hover */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={() => onPin(ws.id)}
                        title={ws.pinned ? 'Unpin' : 'Pin'}
                        className="p-1 rounded transition-colors"
                        style={{ color: ws.pinned ? P.gold : P.inkFaint }}
                        onMouseEnter={e => e.currentTarget.style.color = P.gold}
                        onMouseLeave={e => e.currentTarget.style.color = ws.pinned ? P.gold : P.inkFaint}
                    >
                        {ws.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                    </button>
                    <button
                        onClick={() => onRemove(ws.id)}
                        title="Remove"
                        className="p-1 rounded"
                        style={{ color: P.inkFaint }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ca6d6d'}
                        onMouseLeave={e => e.currentTarget.style.color = P.inkFaint}
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-2 flex-wrap">
                {ws.branch && <BranchBadge branch={ws.branch} />}
                <span className="flex items-center gap-1 text-[9px]" style={{ color: P.inkFaint }}>
                    <Clock className="w-2.5 h-2.5" />
                    {fmtAge(ws.lastOpened)}
                </span>
            </div>

            {/* Open button */}
            <button
                onClick={() => onOpen(ws)}
                className="flex items-center justify-center gap-1.5 py-1.5 rounded text-[10px] transition-all"
                style={{ background: P.goldGlow, border: `1px solid ${P.goldDim}44`, color: P.gold }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(201,168,76,0.22)'; e.currentTarget.style.borderColor = P.goldDim; }}
                onMouseLeave={e => { e.currentTarget.style.background = P.goldGlow; e.currentTarget.style.borderColor = P.goldDim + '44'; }}
            >
                <FolderOpen className="w-3 h-3" />
                Open in Forge
                <ChevronRight className="w-3 h-3 ml-auto" />
            </button>
        </div>
    );
};

// ─── Main module ──────────────────────────────────────────────────────────────
const WorkspaceHub = ({ onOpenForge }) => {
    const {
        workspaces, addWorkspace, updateWorkspace, removeWorkspace, touchWorkspace,
        claudeCodeCwd, setClaudeCodeCwd,
    } = useSettingsStore();

    const [filter, setFilter] = useState('');
    const [adding, setAdding] = useState(false);   // manual path entry
    const [draft, setDraft] = useState('');
    const [draftName, setDraftName] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    // Fetch git branch for a given path
    const fetchBranch = useCallback(async (dirPath) => {
        if (!window.electronAPI?.runCommandIn) return null;
        const res = await window.electronAPI.runCommandIn('git rev-parse --abbrev-ref HEAD', dirPath);
        return res?.error ? null : (res?.stdout || null);
    }, []);

    // Refresh branches for all workspaces
    const refreshBranches = useCallback(async () => {
        setRefreshing(true);
        await Promise.allSettled(workspaces.map(async ws => {
            const branch = await fetchBranch(ws.path);
            if (branch !== null) updateWorkspace(ws.id, { branch });
        }));
        setRefreshing(false);
    }, [workspaces, fetchBranch, updateWorkspace]);

    // Auto-refresh branches on mount
    useEffect(() => {
        if (workspaces.length) refreshBranches();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Browse for directory with native dialog
    const handleBrowse = useCallback(async () => {
        if (!window.electronAPI?.pickDirectory) return;
        const chosen = await window.electronAPI.pickDirectory();
        if (!chosen) return;
        const branch = await fetchBranch(chosen);
        const id = `ws_${Date.now()}`;
        addWorkspace({
            id,
            name: pathBasename(chosen),
            path: chosen,
            branch,
            pinned: false,
            lastOpened: null,
        });
    }, [fetchBranch, addWorkspace]);

    // Add from manual path input
    const handleAddManual = useCallback(async () => {
        const p = draft.trim();
        if (!p) return;
        const branch = await fetchBranch(p);
        const id = `ws_${Date.now()}`;
        addWorkspace({
            id,
            name: draftName.trim() || pathBasename(p),
            path: p,
            branch,
            pinned: false,
            lastOpened: null,
        });
        setDraft('');
        setDraftName('');
        setAdding(false);
    }, [draft, draftName, fetchBranch, addWorkspace]);

    // Open a workspace — set cwd and navigate to editor
    const handleOpen = useCallback((ws) => {
        setClaudeCodeCwd(ws.path);
        touchWorkspace(ws.id);
        onOpenForge?.('forge:edit');
    }, [setClaudeCodeCwd, touchWorkspace, onOpenForge]);

    const handlePin = useCallback((id) => {
        const ws = workspaces.find(w => w.id === id);
        if (ws) updateWorkspace(id, { pinned: !ws.pinned });
    }, [workspaces, updateWorkspace]);

    const handleRemove = useCallback((id) => {
        removeWorkspace(id);
    }, [removeWorkspace]);

    const filtered = workspaces.filter(ws =>
        !filter || ws.name?.toLowerCase().includes(filter.toLowerCase())
            || ws.path?.toLowerCase().includes(filter.toLowerCase())
    );
    const pinned = filtered.filter(ws => ws.pinned);
    const recent = filtered.filter(ws => !ws.pinned).sort((a, b) => (b.lastOpened ?? 0) - (a.lastOpened ?? 0));

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* ── Toolbar ──────────────────────────────────────────────────── */}
            <div className="flex items-center gap-2 px-4 py-2.5 shrink-0"
                style={{ borderBottom: `1px solid ${P.borderFaint}`, background: 'rgba(0,0,0,0.15)' }}>

                {/* Search */}
                <div className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded"
                    style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${P.borderFaint}` }}>
                    <Search className="w-3 h-3 shrink-0" style={{ color: P.inkFaint }} />
                    <input
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        placeholder="Filter projects…"
                        className="flex-1 min-w-0 bg-transparent border-none outline-none text-[10px]"
                        style={{ color: P.ink }}
                    />
                </div>

                {/* Refresh branches */}
                <button
                    onClick={refreshBranches}
                    disabled={refreshing}
                    title="Refresh git branches"
                    className="p-1.5 rounded transition-colors"
                    style={{ color: P.inkFaint, border: `1px solid transparent` }}
                    onMouseEnter={e => { e.currentTarget.style.color = P.inkMid; e.currentTarget.style.borderColor = P.borderFaint; }}
                    onMouseLeave={e => { e.currentTarget.style.color = P.inkFaint; e.currentTarget.style.borderColor = 'transparent'; }}
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                </button>

                {/* Browse */}
                <button
                    onClick={handleBrowse}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] transition-colors"
                    style={{ background: P.goldGlow, border: `1px solid ${P.goldDim}44`, color: P.gold }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(201,168,76,0.22)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = P.goldGlow; }}
                >
                    <FolderOpen className="w-3 h-3" />
                    Browse…
                </button>

                {/* Manual path entry toggle */}
                <button
                    onClick={() => setAdding(v => !v)}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] transition-colors"
                    style={{ border: `1px solid ${P.borderFaint}`, color: P.inkMid }}
                    onMouseEnter={e => { e.currentTarget.style.color = P.ink; e.currentTarget.style.borderColor = P.border; }}
                    onMouseLeave={e => { e.currentTarget.style.color = P.inkMid; e.currentTarget.style.borderColor = P.borderFaint; }}
                >
                    <Plus className="w-3 h-3" />
                    Path
                </button>
            </div>

            {/* ── Manual path entry ─────────────────────────────────────────── */}
            {adding && (
                <div className="flex items-center gap-2 px-4 py-2 shrink-0"
                    style={{ borderBottom: `1px solid ${P.borderFaint}`, background: 'rgba(0,0,0,0.1)' }}>
                    <input
                        value={draftName}
                        onChange={e => setDraftName(e.target.value)}
                        placeholder="Name (optional)"
                        className="w-28 shrink-0 px-2 py-1 rounded text-[10px] outline-none"
                        style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${P.border}`, color: P.ink }}
                    />
                    <input
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddManual()}
                        placeholder="Absolute path…"
                        className="flex-1 px-2 py-1 rounded text-[10px] font-mono outline-none"
                        style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${P.border}`, color: P.ink }}
                        autoFocus
                    />
                    <button
                        onClick={handleAddManual}
                        disabled={!draft.trim()}
                        className="px-3 py-1 rounded text-[10px] transition-colors"
                        style={{ background: P.goldGlow, border: `1px solid ${P.goldDim}44`, color: P.gold }}
                    >
                        Add
                    </button>
                    <button
                        onClick={() => { setAdding(false); setDraft(''); setDraftName(''); }}
                        className="px-2 py-1 rounded text-[10px]"
                        style={{ color: P.inkFaint }}
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* ── Content ───────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">

                {/* Active workspace banner (if claudeCodeCwd is set) */}
                {claudeCodeCwd && (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                        style={{ background: 'rgba(74,127,165,0.08)', border: `1px solid ${P.runeBlue}33` }}>
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: P.runeBlue }} />
                        <div className="flex-1 min-w-0">
                            <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: P.runeBlue, opacity: 0.7 }}>Active Workspace</div>
                            <div className="text-[10px] font-mono truncate" style={{ color: P.ink }}>{claudeCodeCwd}</div>
                        </div>
                        <button
                            onClick={() => onOpenForge?.('forge:edit')}
                            className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[9px]"
                            style={{ background: P.runeBlueDim, border: `1px solid ${P.runeBlue}44`, color: P.runeBlue }}
                        >
                            Resume <ChevronRight className="w-2.5 h-2.5" />
                        </button>
                    </div>
                )}

                {/* Empty state */}
                {workspaces.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 gap-4">
                        <FolderCode className="w-10 h-10 opacity-20" style={{ color: P.gold }} />
                        <div className="text-center">
                            <div className="text-[11px] mb-1" style={{ color: P.inkMid }}>No workspaces yet</div>
                            <div className="text-[9px]" style={{ color: P.inkFaint }}>
                                Click Browse to open a project folder,<br />or enter a path manually.
                            </div>
                        </div>
                        <button
                            onClick={handleBrowse}
                            className="flex items-center gap-2 px-4 py-2 rounded text-[10px]"
                            style={{ background: P.goldGlow, border: `1px solid ${P.goldDim}44`, color: P.gold }}
                        >
                            <FolderOpen className="w-3.5 h-3.5" />
                            Browse for a folder
                        </button>
                    </div>
                )}

                {/* Pinned */}
                {pinned.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Star className="w-3 h-3" style={{ color: P.goldDim }} />
                            <span className="text-[8px] uppercase tracking-[0.25em]" style={{ color: P.inkFaint, fontFamily: 'serif' }}>
                                Pinned
                            </span>
                            <div className="flex-1 h-px" style={{ background: P.borderFaint }} />
                        </div>
                        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                            {pinned.map(ws => (
                                <WorkspaceCard
                                    key={ws.id}
                                    ws={ws}
                                    onOpen={handleOpen}
                                    onPin={handlePin}
                                    onRemove={handleRemove}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Recent */}
                {recent.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Clock className="w-3 h-3" style={{ color: P.inkFaint }} />
                            <span className="text-[8px] uppercase tracking-[0.25em]" style={{ color: P.inkFaint, fontFamily: 'serif' }}>
                                {pinned.length > 0 ? 'Other Projects' : 'Projects'}
                            </span>
                            <div className="flex-1 h-px" style={{ background: P.borderFaint }} />
                            <span className="text-[8px]" style={{ color: P.inkFaint }}>{recent.length}</span>
                        </div>
                        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                            {recent.map(ws => (
                                <WorkspaceCard
                                    key={ws.id}
                                    ws={ws}
                                    onOpen={handleOpen}
                                    onPin={handlePin}
                                    onRemove={handleRemove}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Filter no results */}
                {filter && filtered.length === 0 && workspaces.length > 0 && (
                    <div className="text-center py-8 text-[10px]" style={{ color: P.inkFaint }}>
                        No projects match "{filter}"
                    </div>
                )}
            </div>
        </div>
    );
};

export default WorkspaceHub;
