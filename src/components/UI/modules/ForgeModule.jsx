import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import {
    Code2, Terminal, ChevronRight, ChevronDown,
    FileCode, Folder, FolderOpen, Save, RotateCcw, Check,
    Send, Loader2, PanelLeftClose, PanelLeftOpen,
    PanelRightClose, PanelRightOpen, Play, Square, Trash2,
    CheckCircle2, XCircle, Clock, Dot,
    GitBranch, Zap, Beaker, AlertTriangle,
} from 'lucide-react';
import { useEvolutionStore } from '../../../services/forge/EvolutionStore';
import { forgeService } from '../../../services/forge/ForgeService';
import { useSettingsStore } from '../../../services/settings/SettingsStore';
import { useMemoryStore } from '../../../services/memory/MemoryStore';
import { AGENT_REGISTRY } from '../../../services/agent/AgentRegistry';
import { agentSpawner } from '../../../services/agent/AgentSpawner';
import { MODEL_CATALOG } from '../../../services/llm/ModelCatalog';
import { executeCommand } from '../../../services/commands/CommandRegistry';
import { ClaudeCodeRunner } from '../../../services/agent/ClaudeCodeRunner';
import ModelPicker from '../ModelPicker';
import CommandPalette from '../CommandPalette';

// ─── Language detection ───────────────────────────────────────────────────────
const LANG_MAP = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    py: 'python', rb: 'ruby', rs: 'rust', go: 'go',
    java: 'java', kt: 'kotlin', swift: 'swift',
    json: 'json', jsonc: 'json',
    md: 'markdown', mdx: 'markdown',
    css: 'css', scss: 'scss', less: 'less',
    html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    yaml: 'yaml', yml: 'yaml', toml: 'toml', ini: 'ini',
    sql: 'sql', graphql: 'graphql',
    c: 'c', cpp: 'cpp', h: 'cpp', cs: 'csharp', php: 'php',
};
const detectLang = (name) => LANG_MAP[name.split('.').pop()?.toLowerCase()] ?? 'plaintext';

// ─── Path utilities ───────────────────────────────────────────────────────────
const isWin = window.electronAPI?.platform === 'win32';
const SEP   = isWin ? '\\' : '/';
const joinPath = (...parts) => parts.filter(Boolean).join(SEP).replace(/[/\\]+/g, SEP);

// ─── Elapsed time ─────────────────────────────────────────────────────────────
const fmtElapsed = (ms) => {
    const s = Math.floor((Date.now() - ms) / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

// ─── Palette (matches GrimoireDashboard) ─────────────────────────────────────
const P = {
    page: '#110c07', border: '#3a2712', borderFaint: '#261a0d',
    gold: '#c9a84c', goldDim: '#7a6028', goldGlow: 'rgba(201,168,76,0.15)',
    ink: '#c4b49a', inkMid: '#8a7a65', inkFaint: '#4a3f30',
};

// ─── Tiny spinner ─────────────────────────────────────────────────────────────
const Spin = ({ size = 3 }) => (
    <Loader2 className={`w-${size} h-${size} animate-spin`} style={{ color: P.goldDim }} />
);

// ─── File Tree Node ───────────────────────────────────────────────────────────
const TreeNode = ({ node, activeFilePath, depth, onFileOpen, onDirToggle }) => {
    const isActive = !node.isDir && node.path === activeFilePath;
    return (
        <>
            <button
                onClick={() => node.isDir ? onDirToggle(node.path) : onFileOpen(node)}
                className="w-full flex items-center gap-1 py-[3px] rounded text-left transition-all"
                style={{
                    paddingLeft: 6 + depth * 10,
                    paddingRight: 4,
                    background: isActive ? P.goldGlow : 'transparent',
                    color: isActive ? P.gold : node.isDir ? P.ink : P.inkMid,
                    border: `1px solid ${isActive ? P.goldDim + '44' : 'transparent'}`,
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
                {node.isDir
                    ? (node.open
                        ? <ChevronDown className="w-2.5 h-2.5 shrink-0" style={{ color: P.goldDim }} />
                        : <ChevronRight className="w-2.5 h-2.5 shrink-0" style={{ color: P.inkFaint }} />)
                    : <span className="w-2.5 shrink-0" />
                }
                {node.isDir
                    ? (node.open
                        ? <FolderOpen className="w-3 h-3 shrink-0" style={{ color: P.gold }} />
                        : <Folder className="w-3 h-3 shrink-0" style={{ color: P.inkMid }} />)
                    : <FileCode className="w-3 h-3 shrink-0" style={{ color: isActive ? P.gold : P.inkFaint }} />
                }
                <span className="text-[10px] truncate leading-none">{node.name}</span>
            </button>
            {node.isDir && node.open && (node.children ?? []).map(child => (
                <TreeNode
                    key={child.path}
                    node={child}
                    activeFilePath={activeFilePath}
                    depth={depth + 1}
                    onFileOpen={onFileOpen}
                    onDirToggle={onDirToggle}
                />
            ))}
        </>
    );
};

// ─── Monaco loading fallback ──────────────────────────────────────────────────
const EditorFallback = () => (
    <div className="flex-1 flex items-center justify-center gap-2" style={{ color: P.inkFaint }}>
        <Spin size={4} />
        <span className="text-xs">Loading editor…</span>
    </div>
);

// ─── Main module ──────────────────────────────────────────────────────────────
const ForgeModule = ({ activeTab }) => {
    const {
        claudeCodeCwd, claudeCodePath, claudeCodePermissionMode,
        aiProvider, claudeCliBinPath, claudeCliLoggedIn,
    } = useSettingsStore();

    // ── Tab ──────────────────────────────────────────────────────────────────
    const [localTab, setLocalTab] = useState(activeTab ?? 'edit');
    useEffect(() => setLocalTab(activeTab), [activeTab]);

    // ── File tree ────────────────────────────────────────────────────────────
    const [rootPath, setRootPath] = useState(claudeCodeCwd || '');
    const [tree, setTree] = useState([]);          // nested node objects
    const [treeLoading, setTreeLoading] = useState(false);
    const [showTree, setShowTree] = useState(true);

    // ── Editor ───────────────────────────────────────────────────────────────
    const [openFile, setOpenFile] = useState(null); // { path, language }
    const [editorContent, setEditorContent] = useState('');
    const [savedContent, setSavedContent] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const [showDiff, setShowDiff] = useState(false);
    const editorRef = useRef(null);

    // ── Pair programmer ──────────────────────────────────────────────────────
    const [pairMsgs, setPairMsgs] = useState([]);
    const [pairInput, setPairInput] = useState('');
    const [pairBusy, setPairBusy] = useState(false);
    const [showPair, setShowPair] = useState(false);
    const pairScrollRef = useRef(null);
    const callArgsRef = useRef({});  // tool call id → args (for write_file detection)

    // ── Slash command palette (mirrors GrimoireDashboard) ────────────────────
    const [pairPaletteOpen, setPairPaletteOpen]   = useState(false);
    const [pairPaletteQuery, setPairPaletteQuery] = useState('');

    const commandContext = React.useMemo(() => ({
        memoryStore: useMemoryStore,
        settingsStore: useSettingsStore,
        agentSpawner,
        agentRegistry: AGENT_REGISTRY,
        forgeService,
        modelCatalog: MODEL_CATALOG,
    }), []);

    const runForgeSlash = useCallback(async (raw) => {
        const reply = await executeCommand(raw, commandContext);
        if (reply == null) return false;
        setPairMsgs(prev => [
            ...prev,
            { id: crypto.randomUUID(), role: 'user', content: raw },
            { id: crypto.randomUUID(), role: 'assistant', content: reply },
        ]);
        return true;
    }, [commandContext]);

    const executePairPaletteDef = useCallback(async (def) => {
        if (def.argsHint && def.argsHint.includes('<')) {
            setPairInput(`/${def.name} `);
            setPairPaletteOpen(false);
            return;
        }
        setPairPaletteOpen(false);
        setPairPaletteQuery('');
        setPairInput('');
        await runForgeSlash(`/${def.name}`);
    }, [runForgeSlash]);

    useEffect(() => {
        if (pairInput.startsWith('/')) {
            setPairPaletteQuery(pairInput);
            setPairPaletteOpen(true);
        } else {
            setPairPaletteOpen(false);
        }
    }, [pairInput]);

    // ── Sessions ─────────────────────────────────────────────────────────────
    const [sessions, setSessions] = useState([]);
    const [activeSessId, setActiveSessId] = useState(null);
    const runnersRef = useRef({});
    const sessScrollRef = useRef(null);
    const [tickKey, setTickKey] = useState(0);  // forces elapsed re-renders
    useEffect(() => {
        const id = setInterval(() => setTickKey(k => k + 1), 2000);
        return () => clearInterval(id);
    }, []);

    // ── Load root tree ────────────────────────────────────────────────────────
    const loadDir = useCallback(async (dirPath) => {
        if (!window.electronAPI?.listDir) return [];
        const entries = await window.electronAPI.listDir(dirPath).catch(() => []);
        return entries
            .sort((a, b) => {
                if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
                return a.name.localeCompare(b.name);
            })
            .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '__pycache__')
            .map(e => ({
                name: e.name,
                path: joinPath(dirPath, e.name),
                isDir: e.isDir,
                open: false,
                children: null,
            }));
    }, []);

    useEffect(() => {
        if (!rootPath) return;
        setTreeLoading(true);
        loadDir(rootPath).then(nodes => {
            setTree(nodes);
            setTreeLoading(false);
        });
    }, [rootPath, loadDir]);

    // ── File tree toggle dir ──────────────────────────────────────────────────
    const toggleDir = useCallback(async (targetPath) => {
        const toggle = async (nodes) => {
            return Promise.all(nodes.map(async node => {
                if (node.path !== targetPath) {
                    if (node.isDir && node.children) {
                        return { ...node, children: await toggle(node.children) };
                    }
                    return node;
                }
                if (node.open) return { ...node, open: false };
                const children = node.children ?? await loadDir(targetPath);
                return { ...node, open: true, children };
            }));
        };
        setTree(await toggle(tree));
    }, [tree, loadDir]);

    // ── Open file in editor ───────────────────────────────────────────────────
    const openFileInEditor = useCallback(async (node) => {
        if (!window.electronAPI?.readFile) return;
        const raw = await window.electronAPI.readFile(node.path).catch(() => '');
        setOpenFile({ path: node.path, language: detectLang(node.name) });
        setEditorContent(raw);
        setSavedContent(raw);
        setIsDirty(false);
        setShowDiff(false);
    }, []);

    // ── Save file ─────────────────────────────────────────────────────────────
    // Use a ref so the Monaco onMount binding is always fresh without remounting
    const saveStateRef = useRef({ openFile, isDirty, editorContent });
    saveStateRef.current = { openFile, isDirty, editorContent };

    const handleSave = useCallback(async () => {
        const { openFile: f, isDirty: d, editorContent: c } = saveStateRef.current;
        if (!f || !d || !window.electronAPI?.writeFile) return;
        await window.electronAPI.writeFile(f.path, c).catch(() => {});
        setSavedContent(c);
        setIsDirty(false);
    }, []); // stable reference — reads latest values via ref

    // ── Monaco mount ──────────────────────────────────────────────────────────
    const handleEditorMount = useCallback((editor, monaco) => {
        editorRef.current = editor;
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, handleSave);
    }, [handleSave]);

    // ── Pair programmer scroll ────────────────────────────────────────────────
    useEffect(() => {
        pairScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [pairMsgs]);

    // ── Pair programmer send ──────────────────────────────────────────────────
    const handlePairSend = useCallback(async (e) => {
        e?.preventDefault();
        const text = pairInput.trim();
        if (!text || pairBusy) return;

        if (text.startsWith('/')) {
            setPairInput('');
            setPairPaletteOpen(false);
            await runForgeSlash(text);
            return;
        }

        setPairBusy(true);
        setPairInput('');

        const fileCtx = openFile
            ? `<current_file path="${openFile.path}">\n${editorContent}\n</current_file>\n\n`
            : '';
        const fullPrompt = fileCtx + text;

        const history = pairMsgs
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role, content: m.content }));

        const userMsg = { id: crypto.randomUUID(), role: 'user', content: text };
        setPairMsgs(prev => [...prev, userMsg]);

        try {
            const { agentLoop } = await import('../../../services/agent/AgentLoop');
            const result = await agentLoop.run(fullPrompt, history, {
                onChunk: (chunk) => {
                    setPairMsgs(prev => {
                        const last = prev.at(-1);
                        if (last?.role === 'streaming') {
                            return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
                        }
                        return [...prev, { id: 'stream', role: 'streaming', content: chunk }];
                    });
                },
                onStep: async (step) => {
                    if (step.type === 'tool_call') {
                        callArgsRef.current[step.id] = step.args;
                    }
                    if (step.type === 'tool_result' && step.name === 'write_file') {
                        const args = callArgsRef.current[step.id];
                        // Use ref for latest values (this runs async, state may have changed)
                        const { openFile: curFile, editorContent: curContent } = saveStateRef.current;
                        if (curFile && args?.path === curFile.path && window.electronAPI?.readFile) {
                            const fresh = await window.electronAPI.readFile(curFile.path).catch(() => null);
                            if (fresh !== null && fresh !== curContent) {
                                setSavedContent(curContent);
                                setEditorContent(fresh);
                                setShowDiff(true);
                            }
                        }
                    }
                },
            });

            setPairMsgs(prev => [
                ...prev.filter(m => m.role !== 'streaming'),
                { id: crypto.randomUUID(), role: 'assistant', content: result.reply || result.content || 'Done.' },
            ]);
        } catch (err) {
            setPairMsgs(prev => [
                ...prev.filter(m => m.role !== 'streaming'),
                { id: crypto.randomUUID(), role: 'error', content: err.message },
            ]);
        } finally {
            setPairBusy(false);
        }
    }, [pairInput, pairBusy, pairMsgs, runForgeSlash]); // openFile/editorContent read at call time (fresh) or via saveStateRef (async)

    // ── Run with Claude Code ──────────────────────────────────────────────────
    const handleRunCC = useCallback(async () => {
        const task = openFile
            ? `File: ${openFile.path}\n\n${pairInput.trim()}`
            : pairInput.trim();
        if (!task.trim()) return;

        // Pick the binary based on the active provider. When the user has
        // selected the Claude subscription CLI, route Forge through the same
        // authenticated binary so it consumes their subscription.
        const useSubscription = aiProvider === 'claude-cli';
        const binPath = useSubscription
            ? (claudeCliBinPath || 'claude')
            : (claudeCodePath || 'claude');

        // Auth gate: under the subscription provider, refuse to spawn until
        // the user has logged in (otherwise `claude --print` will print a
        // login banner and exit, which looks like a silent failure).
        if (useSubscription && !claudeCliLoggedIn) {
            const sessId = `sess_${Date.now()}`;
            setSessions(prev => [{
                id: sessId, task, startedAt: Date.now(),
                status: 'error', stdout: '',
                stderr: 'Claude CLI not authenticated. Open Grimoire → Systems → Auth and click "Login via Browser".',
                exitCode: -1,
            }, ...prev]);
            setActiveSessId(sessId);
            setLocalTab('sessions');
            return;
        }

        const sessId = `sess_${Date.now()}`;
        runnersRef.current[sessId] = new ClaudeCodeRunner();
        setSessions(prev => [{
            id: sessId, task, startedAt: Date.now(),
            status: 'running', stdout: '', stderr: '', exitCode: null,
        }, ...prev]);
        setActiveSessId(sessId);
        setLocalTab('sessions');
        setPairInput('');

        const result = await runnersRef.current[sessId].run(task, {
            cwd: claudeCodeCwd || undefined,
            permissionMode: claudeCodePermissionMode || 'acceptEdits',
            binPath,
            // Pipe the prompt over stdin. Without this, cmd.exe truncates
            // multi-line argv at the first newline on Windows (the task
            // contains "File: <path>\n\n<prompt>").
            viaStdin: true,
            onStdout: (_, total) => setSessions(prev =>
                prev.map(s => s.id === sessId ? { ...s, stdout: total } : s)),
            onStderr: (_, total) => setSessions(prev =>
                prev.map(s => s.id === sessId ? { ...s, stderr: total } : s)),
        });

        const status = result.error ? 'error' : 'done';
        setSessions(prev => prev.map(s => s.id === sessId
            ? { ...s, status, exitCode: result.code } : s));
        delete runnersRef.current[sessId];

        // Reload open file if it changed (use ref for latest values post-await)
        const { openFile: curFile, editorContent: curContent } = saveStateRef.current;
        if (curFile && window.electronAPI?.readFile) {
            const fresh = await window.electronAPI.readFile(curFile.path).catch(() => null);
            if (fresh !== null && fresh !== curContent) {
                setSavedContent(curContent);
                setEditorContent(fresh);
                setShowDiff(true);
                setLocalTab('edit');
            }
        }
    }, [pairInput, openFile, claudeCodeCwd, claudeCodePath, claudeCodePermissionMode,
        aiProvider, claudeCliBinPath, claudeCliLoggedIn]); // editorContent read via saveStateRef post-await

    // ── Cancel session ────────────────────────────────────────────────────────
    const cancelSession = useCallback((id) => {
        runnersRef.current[id]?.cancel();
        setSessions(prev => prev.map(s => s.id === id ? { ...s, status: 'error', exitCode: -1 } : s));
        delete runnersRef.current[id];
    }, []);

    // ── Clear sessions ────────────────────────────────────────────────────────
    const clearDoneSessions = useCallback(() => {
        setSessions(prev => prev.filter(s => s.status === 'running'));
        setActiveSessId(null);
    }, []);

    // ── Active session ────────────────────────────────────────────────────────
    const activeSess = sessions.find(s => s.id === activeSessId) ?? sessions[0] ?? null;
    useEffect(() => {
        sessScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeSess?.stdout]);

    // ── Root path edit ────────────────────────────────────────────────────────
    const [rootDraft, setRootDraft] = useState(rootPath);
    const applyRoot = () => {
        const p = rootDraft.trim();
        if (p) { setRootPath(p); setTree([]); setOpenFile(null); }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────
    const TABS = [
        { id: 'edit',      icon: Code2,    label: 'Code Editor' },
        { id: 'sessions',  icon: Terminal, label: 'Sessions' },
        { id: 'evolution', icon: GitBranch, label: 'Evolution' },
    ];

    return (
        <div className="flex-1 flex flex-col overflow-hidden">

            {/* Tab bar */}
            <div className="flex shrink-0" style={{ borderBottom: `1px solid ${P.border}`, background: 'rgba(0,0,0,0.2)' }}>
                {TABS.map(({ id, icon: Icon, label }) => (
                    <button
                        key={id}
                        onClick={() => setLocalTab(id)}
                        className="flex items-center gap-1.5 px-4 py-2.5 text-[10px] uppercase tracking-wider transition-colors border-b-2"
                        style={localTab === id
                            ? { borderColor: P.gold, color: P.gold }
                            : { borderColor: 'transparent', color: P.inkFaint }}
                        onMouseEnter={e => { if (localTab !== id) e.currentTarget.style.color = P.inkMid; }}
                        onMouseLeave={e => { if (localTab !== id) e.currentTarget.style.color = P.inkFaint; }}
                    >
                        <Icon className="w-3 h-3" />
                        {label}
                        {id === 'sessions' && sessions.some(s => s.status === 'running') && (
                            <span className="ml-1 w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        )}
                    </button>
                ))}
            </div>

            {/* ── EDIT TAB ─────────────────────────────────────────────────── */}
            {localTab === 'edit' && (
                <div className="flex-1 flex overflow-hidden">

                    {/* File Tree Panel */}
                    {showTree && (
                        <div className="flex flex-col shrink-0 overflow-hidden" style={{ width: 148, borderRight: `1px solid ${P.borderFaint}` }}>
                            {/* Root path row */}
                            <div className="flex items-center gap-1 px-2 py-1.5 shrink-0" style={{ borderBottom: `1px solid ${P.borderFaint}` }}>
                                <input
                                    value={rootDraft}
                                    onChange={e => setRootDraft(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && applyRoot()}
                                    onBlur={applyRoot}
                                    placeholder="Working dir…"
                                    className="flex-1 min-w-0 text-[9px] bg-transparent border-none outline-none"
                                    style={{ color: P.inkMid }}
                                />
                                {treeLoading && <Spin />}
                            </div>
                            {/* Tree nodes */}
                            <div className="flex-1 overflow-y-auto py-1">
                                {tree.length === 0 && !treeLoading && (
                                    <div className="px-3 py-4 text-[9px] text-center" style={{ color: P.inkFaint }}>
                                        {rootPath ? 'Empty or inaccessible' : 'Set a working dir'}
                                    </div>
                                )}
                                {tree.map(node => (
                                    <TreeNode
                                        key={node.path}
                                        node={node}
                                        activeFilePath={openFile?.path}
                                        depth={0}
                                        onFileOpen={openFileInEditor}
                                        onDirToggle={toggleDir}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Editor area */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Editor toolbar */}
                        <div className="flex items-center gap-2 px-2 py-1 shrink-0" style={{ borderBottom: `1px solid ${P.borderFaint}`, background: 'rgba(0,0,0,0.15)' }}>
                            {/* Tree toggle */}
                            <button
                                onClick={() => setShowTree(v => !v)}
                                title={showTree ? 'Hide file tree' : 'Show file tree'}
                                style={{ color: showTree ? P.gold : P.inkFaint }}
                                onMouseEnter={e => e.currentTarget.style.color = P.gold}
                                onMouseLeave={e => e.currentTarget.style.color = showTree ? P.gold : P.inkFaint}
                            >
                                {showTree
                                    ? <PanelLeftClose className="w-3.5 h-3.5" />
                                    : <PanelLeftOpen className="w-3.5 h-3.5" />
                                }
                            </button>

                            {/* File path breadcrumb */}
                            <span className="flex-1 text-[9px] font-mono truncate" style={{ color: openFile ? P.inkMid : P.inkFaint }}>
                                {openFile ? openFile.path : 'No file open'}
                            </span>

                            {/* Dirty indicator */}
                            {isDirty && !showDiff && (
                                <span className="text-[9px]" style={{ color: P.goldDim }}>●</span>
                            )}

                            {/* Diff controls */}
                            {showDiff && (
                                <>
                                    <button
                                        onClick={() => { setSavedContent(editorContent); setShowDiff(false); }}
                                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px]"
                                        style={{ background: 'rgba(74,174,74,0.15)', color: '#6dca6d', border: '1px solid rgba(74,174,74,0.3)' }}
                                    >
                                        <Check className="w-2.5 h-2.5" /> Accept
                                    </button>
                                    <button
                                        onClick={() => { setEditorContent(savedContent); setShowDiff(false); setIsDirty(false); }}
                                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px]"
                                        style={{ background: 'rgba(174,74,74,0.15)', color: '#ca6d6d', border: '1px solid rgba(174,74,74,0.3)' }}
                                    >
                                        <RotateCcw className="w-2.5 h-2.5" /> Revert
                                    </button>
                                </>
                            )}

                            {/* Save button */}
                            {!showDiff && (
                                <button
                                    onClick={handleSave}
                                    disabled={!isDirty}
                                    title="Save (Ctrl+S)"
                                    style={{ color: isDirty ? P.gold : P.inkFaint, opacity: isDirty ? 1 : 0.4 }}
                                    onMouseEnter={e => { if (isDirty) e.currentTarget.style.color = '#e8c96d'; }}
                                    onMouseLeave={e => { if (isDirty) e.currentTarget.style.color = P.gold; }}
                                >
                                    <Save className="w-3.5 h-3.5" />
                                </button>
                            )}

                            {/* Pair programmer toggle */}
                            <button
                                onClick={() => setShowPair(v => !v)}
                                title={showPair ? 'Hide pair programmer' : 'Show pair programmer'}
                                style={{ color: showPair ? P.gold : P.inkFaint }}
                                onMouseEnter={e => e.currentTarget.style.color = P.gold}
                                onMouseLeave={e => e.currentTarget.style.color = showPair ? P.gold : P.inkFaint}
                            >
                                {showPair
                                    ? <PanelRightClose className="w-3.5 h-3.5" />
                                    : <PanelRightOpen className="w-3.5 h-3.5" />
                                }
                            </button>
                        </div>

                        {/* Editor + pair programmer columns */}
                        <div className="flex-1 flex overflow-hidden">
                            {/* Monaco */}
                            <div className="flex-1 min-w-0 overflow-hidden">
                                {!openFile && (
                                    <div className="h-full flex flex-col items-center justify-center gap-3" style={{ color: P.inkFaint }}>
                                        <FileCode className="w-8 h-8 opacity-30" />
                                        <span className="text-[10px]">Open a file from the tree</span>
                                    </div>
                                )}
                                {openFile && (
                                    <Suspense fallback={<EditorFallback />}>
                                        {showDiff ? (
                                            <DiffEditor
                                                height="100%"
                                                original={savedContent}
                                                modified={editorContent}
                                                language={openFile.language}
                                                theme="vs-dark"
                                                options={{ readOnly: true, fontSize: 12, minimap: { enabled: false } }}
                                            />
                                        ) : (
                                            <Editor
                                                key={openFile.path}
                                                height="100%"
                                                language={openFile.language}
                                                value={editorContent}
                                                onChange={v => {
                                                    const val = v ?? '';
                                                    setEditorContent(val);
                                                    setIsDirty(val !== savedContent);
                                                }}
                                                theme="vs-dark"
                                                options={{
                                                    fontSize: 12,
                                                    minimap: { enabled: false },
                                                    scrollBeyondLastLine: false,
                                                    fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
                                                    lineNumbers: 'on',
                                                    wordWrap: 'off',
                                                    renderLineHighlight: 'line',
                                                    overviewRulerBorder: false,
                                                    hideCursorInOverviewRuler: true,
                                                    scrollbar: { verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
                                                }}
                                                onMount={handleEditorMount}
                                            />
                                        )}
                                    </Suspense>
                                )}
                            </div>

                            {/* Pair Programmer Panel */}
                            {showPair && (
                                <div className="flex flex-col shrink-0" style={{ width: 260, borderLeft: `1px solid ${P.borderFaint}` }}>
                                    {/* Header */}
                                    <div className="px-3 py-2 shrink-0 flex items-center gap-1.5" style={{ borderBottom: `1px solid ${P.borderFaint}` }}>
                                        <span className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: P.goldDim, fontFamily: 'serif' }}>
                                            Pair Programmer
                                        </span>
                                        {pairBusy && <Spin />}
                                    </div>

                                    {/* Messages */}
                                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                                        {pairMsgs.length === 0 && (
                                            <div className="text-[9px] text-center py-6 leading-relaxed" style={{ color: P.inkFaint }}>
                                                Ask anything about the open file.<br />
                                                The AI sees your code.
                                            </div>
                                        )}
                                        {pairMsgs.map(msg => (
                                            <div key={msg.id} className={`text-[10px] leading-relaxed rounded px-2 py-1.5 ${
                                                msg.role === 'user'
                                                    ? 'ml-3'
                                                    : msg.role === 'error'
                                                    ? ''
                                                    : 'mr-2'
                                            }`} style={{
                                                background: msg.role === 'user'
                                                    ? 'rgba(74,127,165,0.12)'
                                                    : msg.role === 'error'
                                                    ? 'rgba(174,74,74,0.12)'
                                                    : 'rgba(201,168,76,0.06)',
                                                border: `1px solid ${
                                                    msg.role === 'user'
                                                        ? 'rgba(74,127,165,0.2)'
                                                        : msg.role === 'error'
                                                        ? 'rgba(174,74,74,0.2)'
                                                        : 'rgba(201,168,76,0.12)'
                                                }`,
                                                color: msg.role === 'error' ? '#ca6d6d' : P.ink,
                                                fontFamily: msg.role === 'assistant' || msg.role === 'streaming' ? 'serif' : 'inherit',
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                            }}>
                                                {msg.content}
                                                {msg.role === 'streaming' && (
                                                    <span className="animate-pulse" style={{ color: P.goldDim }}>▋</span>
                                                )}
                                            </div>
                                        ))}
                                        <div ref={pairScrollRef} />
                                    </div>

                                    {/* Input */}
                                    <div className="shrink-0 p-2 pb-3 space-y-1 relative" style={{ borderTop: `1px solid ${P.borderFaint}` }}>
                                        {pairPaletteOpen && (
                                            <CommandPalette
                                                open={pairPaletteOpen}
                                                mode="dropdown"
                                                query={pairPaletteQuery}
                                                onQueryChange={(q) => { setPairPaletteQuery(q); setPairInput(q); }}
                                                onExecute={executePairPaletteDef}
                                                onClose={() => setPairPaletteOpen(false)}
                                            />
                                        )}
                                        <textarea
                                            value={pairInput}
                                            onChange={e => setPairInput(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handlePairSend();
                                                }
                                            }}
                                            placeholder="Ask or instruct…"
                                            rows={2}
                                            disabled={pairBusy}
                                            className="w-full resize-none text-[10px] rounded px-2 py-1.5 outline-none"
                                            style={{
                                                background: 'rgba(0,0,0,0.3)',
                                                border: `1px solid ${P.border}`,
                                                color: P.ink,
                                                fontFamily: 'inherit',
                                            }}
                                            onFocus={e => e.currentTarget.style.borderColor = P.goldDim}
                                            onBlur={e => e.currentTarget.style.borderColor = P.border}
                                        />
                                        {/* Model selector + action buttons */}
                                        <div className="flex items-center gap-1">
                                            <ModelPicker theme="grimoire" align="left" />
                                            <div className="flex-1" />
                                            <button
                                                onClick={handlePairSend}
                                                disabled={pairBusy || !pairInput.trim()}
                                                className="flex items-center justify-center gap-1 px-2 py-1 rounded text-[9px] transition-colors"
                                                style={{
                                                    background: pairBusy || !pairInput.trim() ? 'rgba(201,168,76,0.05)' : P.goldGlow,
                                                    border: `1px solid ${P.goldDim}44`,
                                                    color: pairBusy || !pairInput.trim() ? P.inkFaint : P.gold,
                                                }}
                                            >
                                                {pairBusy ? <Spin size={2.5} /> : <Send className="w-2.5 h-2.5" />}
                                                Ask
                                            </button>
                                            <button
                                                onClick={handleRunCC}
                                                disabled={pairBusy || !pairInput.trim()}
                                                title={aiProvider === 'claude-cli'
                                                    ? (claudeCliLoggedIn
                                                        ? 'Run with Claude Code CLI (using your subscription)'
                                                        : 'Claude CLI: not authenticated — login in Grimoire → Systems → Auth')
                                                    : 'Run with Claude Code CLI (uses configured binary path)'}
                                                className="flex items-center justify-center gap-1 px-2 py-1 rounded text-[9px] transition-colors"
                                                style={{
                                                    background: 'rgba(74,127,165,0.1)',
                                                    border: '1px solid rgba(74,127,165,0.25)',
                                                    color: pairBusy || !pairInput.trim() ? P.inkFaint : '#7ab0cc',
                                                }}
                                            >
                                                <Play className="w-2.5 h-2.5" />
                                                CC
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── SESSIONS TAB ─────────────────────────────────────────────── */}
            {localTab === 'sessions' && (
                <div className="flex-1 flex overflow-hidden">
                    {/* Session list */}
                    <div className="flex flex-col shrink-0 overflow-hidden" style={{ width: 200, borderRight: `1px solid ${P.borderFaint}` }}>
                        <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ borderBottom: `1px solid ${P.borderFaint}` }}>
                            <span className="text-[9px] uppercase tracking-widest" style={{ color: P.inkFaint, fontFamily: 'serif' }}>Runs</span>
                            {sessions.some(s => s.status !== 'running') && (
                                <button onClick={clearDoneSessions} title="Clear finished" style={{ color: P.inkFaint }}
                                    onMouseEnter={e => e.currentTarget.style.color = P.inkMid}
                                    onMouseLeave={e => e.currentTarget.style.color = P.inkFaint}>
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto py-1">
                            {sessions.length === 0 && (
                                <div className="px-3 py-6 text-[9px] text-center" style={{ color: P.inkFaint }}>
                                    No sessions yet.<br />Use "CC" button in the editor.
                                </div>
                            )}
                            {sessions.map(sess => {
                                const isActive = sess.id === activeSessId;
                                const StatusIcon = sess.status === 'done' ? CheckCircle2
                                    : sess.status === 'error' ? XCircle
                                    : Dot;
                                const statusColor = sess.status === 'done' ? '#6dca6d'
                                    : sess.status === 'error' ? '#ca6d6d'
                                    : '#6dca6d';
                                return (
                                    <button
                                        key={sess.id}
                                        onClick={() => setActiveSessId(sess.id)}
                                        className="w-full px-2 py-2 text-left flex flex-col gap-0.5 rounded transition-all"
                                        style={{
                                            background: isActive ? P.goldGlow : 'transparent',
                                            border: `1px solid ${isActive ? P.goldDim + '44' : 'transparent'}`,
                                            margin: '1px 4px',
                                            width: 'calc(100% - 8px)',
                                        }}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <StatusIcon
                                                className={`w-2.5 h-2.5 shrink-0 ${sess.status === 'running' ? 'animate-pulse' : ''}`}
                                                style={{ color: statusColor }}
                                            />
                                            <span className="text-[9px] truncate" style={{ color: isActive ? P.gold : P.inkMid }}>
                                                {sess.task.split('\n')[0].slice(0, 30)}
                                            </span>
                                        </div>
                                        <div className="text-[8px] pl-4" style={{ color: P.inkFaint }}>
                                            {fmtElapsed(sess.startedAt)}
                                            {sess.exitCode !== null && sess.exitCode !== 0 && ` · exit ${sess.exitCode}`}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Session detail */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {!activeSess ? (
                            <div className="flex-1 flex items-center justify-center" style={{ color: P.inkFaint }}>
                                <span className="text-[10px]">Select a session</span>
                            </div>
                        ) : (
                            <>
                                {/* Detail header */}
                                <div className="px-3 py-2 shrink-0 flex items-center gap-2" style={{ borderBottom: `1px solid ${P.borderFaint}` }}>
                                    <span className="flex-1 text-[9px] font-mono truncate" style={{ color: P.inkMid }}>
                                        {activeSess.task.split('\n')[0]}
                                    </span>
                                    {activeSess.status === 'running' && (
                                        <button
                                            onClick={() => cancelSession(activeSess.id)}
                                            className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px]"
                                            style={{ background: 'rgba(174,74,74,0.15)', color: '#ca6d6d', border: '1px solid rgba(174,74,74,0.3)' }}
                                        >
                                            <Square className="w-2.5 h-2.5" /> Cancel
                                        </button>
                                    )}
                                    {activeSess.status === 'done' && (
                                        <span className="text-[9px]" style={{ color: '#6dca6d' }}>✓ Done</span>
                                    )}
                                    {activeSess.status === 'error' && (
                                        <span className="text-[9px]" style={{ color: '#ca6d6d' }}>✗ Failed (exit {activeSess.exitCode})</span>
                                    )}
                                </div>

                                {/* stdout */}
                                <div className="flex-1 overflow-y-auto" style={{ background: '#0d0d0d' }}>
                                    <pre
                                        className="p-3 text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-words"
                                        style={{ color: '#c0c0c0' }}
                                    >
                                        {activeSess.stdout || (activeSess.status === 'running' ? 'Waiting for output…' : 'No output.')}
                                    </pre>
                                    {activeSess.stderr && (
                                        <pre className="px-3 pb-3 text-[10px] font-mono whitespace-pre-wrap break-words" style={{ color: '#ca8080' }}>
                                            {activeSess.stderr}
                                        </pre>
                                    )}
                                    <div ref={sessScrollRef} />
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
            {/* ── EVOLUTION TAB ────────────────────────────────────────────── */}
            {localTab === 'evolution' && <EvolutionPanel />}

        </div>
    );
};

// ─── Evolution Panel ─────────────────────────────────────────────────────────
// Renders active sandboxes, the staged merge proposal (if any), and history.
const EvolutionPanel = () => {
    const { experiments, pendingMerge, history, clearPendingMerge, recordDecision } =
        useEvolutionStore();
    const [selectedFile, setSelectedFile] = useState(null);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Default to first changed file when a proposal is staged.
        if (pendingMerge?.diff?.files?.length && !selectedFile) {
            setSelectedFile(pendingMerge.diff.files[0]);
        }
        if (!pendingMerge) setSelectedFile(null);
    }, [pendingMerge, selectedFile]);

    const handleApply = async () => {
        if (!pendingMerge) return;
        setApplying(true);
        setError(null);
        const res = await forgeService.applyEvolution(
            pendingMerge.sandboxId,
            pendingMerge.report?.summary,
        );
        setApplying(false);
        if (res?.error) {
            setError(res.error);
            return;
        }
        if (res?.cancelled) return;
        recordDecision(pendingMerge.sandboxId, 'accepted', pendingMerge.report?.summary);
    };

    const handleReject = () => {
        if (!pendingMerge) return;
        recordDecision(pendingMerge.sandboxId, 'rejected', pendingMerge.report?.summary);
        clearPendingMerge();
    };

    const expEntries = Object.entries(experiments).sort((a, b) => b[1].createdAt - a[1].createdAt);

    return (
        <div className="flex-1 flex overflow-hidden">

            {/* Left: experiments + history list */}
            <div className="flex flex-col shrink-0 overflow-hidden" style={{ width: 220, borderRight: `1px solid ${P.borderFaint}` }}>
                <div className="px-3 py-2 shrink-0 flex items-center gap-1.5" style={{ borderBottom: `1px solid ${P.borderFaint}` }}>
                    <Beaker className="w-3 h-3" style={{ color: P.goldDim }} />
                    <span className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: P.goldDim, fontFamily: 'serif' }}>
                        Experiments
                    </span>
                    <span className="text-[9px]" style={{ color: P.inkFaint }}>({expEntries.length})</span>
                </div>
                <div className="flex-1 overflow-y-auto py-1">
                    {expEntries.length === 0 && (
                        <div className="px-3 py-6 text-[9px] text-center leading-relaxed" style={{ color: P.inkFaint }}>
                            No experiments yet.<br />Ask the Evolver to optimize a component.
                        </div>
                    )}
                    {expEntries.map(([id, exp]) => {
                        const isPending = pendingMerge?.sandboxId === id;
                        const StatusIcon = exp.status === 'merged' ? CheckCircle2
                            : exp.status === 'rejected' ? XCircle
                            : isPending ? AlertTriangle
                            : Zap;
                        const color = exp.status === 'merged' ? '#6dca6d'
                            : exp.status === 'rejected' ? '#ca6d6d'
                            : isPending ? P.gold
                            : P.goldDim;
                        return (
                            <div key={id} className="px-2 py-2 mx-1 rounded" style={{
                                background: isPending ? P.goldGlow : 'transparent',
                                border: `1px solid ${isPending ? P.goldDim + '44' : 'transparent'}`,
                            }}>
                                <div className="flex items-center gap-1.5">
                                    <StatusIcon className="w-2.5 h-2.5 shrink-0" style={{ color }} />
                                    <span className="text-[9px] font-mono" style={{ color: P.inkMid }}>{id}</span>
                                </div>
                                <div className="text-[9px] mt-1 leading-tight" style={{ color: P.ink }}>
                                    {exp.goal}
                                </div>
                                <div className="text-[8px] mt-0.5 flex items-center gap-2" style={{ color: P.inkFaint }}>
                                    <span>{exp.benchmarks.length} run{exp.benchmarks.length === 1 ? '' : 's'}</span>
                                    <span>{exp.status}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {history.length > 0 && (
                    <div className="shrink-0 max-h-32 overflow-y-auto" style={{ borderTop: `1px solid ${P.borderFaint}` }}>
                        <div className="px-3 py-1.5 text-[9px] uppercase tracking-widest" style={{ color: P.inkFaint, fontFamily: 'serif' }}>
                            History
                        </div>
                        {history.slice(0, 10).map(h => (
                            <div key={h.sandboxId + h.mergedAt} className="px-3 py-1 text-[9px] flex items-center gap-1.5" style={{ color: P.inkMid }}>
                                {h.decision === 'accepted'
                                    ? <Check className="w-2.5 h-2.5" style={{ color: '#6dca6d' }} />
                                    : <XCircle className="w-2.5 h-2.5" style={{ color: '#ca6d6d' }} />}
                                <span className="truncate">{h.summary || h.sandboxId}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Right: pending merge proposal + diff viewer */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {!pendingMerge ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: P.inkFaint }}>
                        <GitBranch className="w-8 h-8 opacity-30" />
                        <span className="text-[10px] text-center max-w-xs leading-relaxed">
                            No staged proposal.<br />
                            When the Evolver calls <code style={{ color: P.goldDim }}>forge_propose_evolution</code>,<br />
                            its report and diff will appear here for your review.
                        </span>
                    </div>
                ) : (
                    <>
                        {/* Report header */}
                        <div className="shrink-0 px-3 py-2.5 space-y-1.5" style={{ borderBottom: `1px solid ${P.borderFaint}`, background: 'rgba(201,168,76,0.04)' }}>
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-3 h-3" style={{ color: P.gold }} />
                                <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: P.gold, fontFamily: 'serif' }}>
                                    Evolution Report
                                </span>
                                <span className="text-[9px] font-mono" style={{ color: P.inkFaint }}>
                                    {pendingMerge.sandboxId}
                                </span>
                                <div className="flex-1" />
                                <button
                                    onClick={handleReject}
                                    disabled={applying}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px]"
                                    style={{ background: 'rgba(174,74,74,0.15)', color: '#ca6d6d', border: '1px solid rgba(174,74,74,0.3)' }}
                                >
                                    <XCircle className="w-2.5 h-2.5" /> Reject
                                </button>
                                <button
                                    onClick={handleApply}
                                    disabled={applying}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px]"
                                    style={{ background: 'rgba(74,174,74,0.15)', color: '#6dca6d', border: '1px solid rgba(74,174,74,0.3)' }}
                                >
                                    {applying ? <Spin size={2.5} /> : <Check className="w-2.5 h-2.5" />}
                                    Apply Evolution
                                </button>
                            </div>
                            <div className="text-[10px]" style={{ color: P.ink }}>
                                {pendingMerge.report?.summary}
                            </div>
                            <div className="text-[9px] leading-relaxed" style={{ color: P.inkMid }}>
                                {pendingMerge.report?.rationale}
                            </div>
                            <div className="flex items-center gap-3 text-[9px] pt-1" style={{ color: P.inkFaint }}>
                                <span>metric: <span style={{ color: P.goldDim }}>{pendingMerge.report?.metric}</span></span>
                                <span>baseline: <span style={{ color: P.inkMid }}>{pendingMerge.report?.baseline}</span></span>
                                <span>measured: <span style={{ color: '#6dca6d' }}>{pendingMerge.report?.measured}</span></span>
                                <span>{pendingMerge.diff?.count ?? 0} file{pendingMerge.diff?.count === 1 ? '' : 's'} changed</span>
                            </div>
                            {error && (
                                <div className="text-[9px] mt-1" style={{ color: '#ca6d6d' }}>⚠ {error}</div>
                            )}
                        </div>

                        {/* Diff: file list + diff editor */}
                        <div className="flex-1 flex overflow-hidden">
                            <div className="flex flex-col shrink-0 overflow-hidden" style={{ width: 200, borderRight: `1px solid ${P.borderFaint}` }}>
                                <div className="px-3 py-1.5 shrink-0 text-[9px] uppercase tracking-widest" style={{ color: P.inkFaint, fontFamily: 'serif', borderBottom: `1px solid ${P.borderFaint}` }}>
                                    Changed files
                                </div>
                                <div className="flex-1 overflow-y-auto py-1">
                                    {(pendingMerge.diff?.files ?? []).map(f => {
                                        const isActive = selectedFile?.path === f.path;
                                        return (
                                            <button
                                                key={f.path}
                                                onClick={() => setSelectedFile(f)}
                                                className="w-full text-left px-2 py-1 text-[9px] flex items-center gap-1.5"
                                                style={{
                                                    background: isActive ? P.goldGlow : 'transparent',
                                                    color: isActive ? P.gold : P.inkMid,
                                                    border: `1px solid ${isActive ? P.goldDim + '44' : 'transparent'}`,
                                                    margin: '1px 4px',
                                                    width: 'calc(100% - 8px)',
                                                    borderRadius: 3,
                                                }}
                                            >
                                                <span style={{
                                                    color: f.status === 'added' ? '#6dca6d'
                                                        : f.status === 'deleted' ? '#ca6d6d'
                                                        : P.goldDim,
                                                    width: 8, textAlign: 'center',
                                                }}>
                                                    {f.status === 'added' ? '+' : f.status === 'deleted' ? '−' : '~'}
                                                </span>
                                                <span className="truncate font-mono">{f.path}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="flex-1 overflow-hidden">
                                {selectedFile ? (
                                    <Suspense fallback={<EditorFallback />}>
                                        <DiffEditor
                                            height="100%"
                                            original={selectedFile.before}
                                            modified={selectedFile.after}
                                            language={detectLang(selectedFile.path.split('/').pop())}
                                            theme="vs-dark"
                                            options={{ readOnly: true, fontSize: 11, minimap: { enabled: false } }}
                                        />
                                    </Suspense>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-[10px]" style={{ color: P.inkFaint }}>
                                        Select a file
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ForgeModule;
