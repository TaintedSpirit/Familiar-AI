import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import {
    X, Send, Mic, SquarePen, Trash2, BookOpen, ChevronRight,
    Radio, Brain, Sparkles, Database, FolderOpen, Server, Plug, Clock,
    Shield, ShieldCheck, FolderLock, History, Activity, Zap, BarChart2,
    Hash, Settings, User, Swords, Fingerprint, Users, ListChecks,
    MessageSquare, CheckCircle2, ExternalLink, GripHorizontal,
    Hammer, Code2, Terminal,
} from 'lucide-react';
import { useMemoryStore } from '../../services/memory/MemoryStore';
import { useSettingsStore } from '../../services/settings/SettingsStore';
import { AGENT_REGISTRY } from '../../services/agent/AgentRegistry';
import { agentSpawner } from '../../services/agent/AgentSpawner';
import { forgeService } from '../../services/forge/ForgeService';
import { MODEL_CATALOG } from '../../services/llm/ModelCatalog';
import { executeCommand } from '../../services/commands/CommandRegistry';
import CommandPalette from './CommandPalette';
import ToolBlock from './ToolBlock';
import ActivityTicker from './ActivityTicker';

// ─── Nav structure (mirrored from DetachedChat) ──────────────────────────────
const NAV_STRUCTURE = [
    { category: 'Comms',   icon: Radio,    items: [
        { id: 'comms:chat',       label: 'Chat',           icon: MessageSquare },
        { id: 'comms:channels',   label: 'Ext. Channels',  icon: Hash },
    ]},
    { category: 'Brain',   icon: Brain,    items: [
        { id: 'brain:memory',     label: 'Memory Browser', icon: Database },
        { id: 'brain:projects',   label: 'Projects',       icon: FolderOpen },
    ]},
    { category: 'Skills',  icon: Swords,   items: [
        { id: 'skills:arsenal',   label: 'Arsenal',        icon: Swords },
    ]},
    { category: 'Soul',    icon: Sparkles, items: [
        { id: 'soul:identity',    label: 'Identity',       icon: Fingerprint },
        { id: 'soul:persona',     label: 'Persona',        icon: User },
        { id: 'soul:senses',      label: 'Senses',         icon: Mic },
    ]},
    { category: 'Systems', icon: Server,   items: [
        { id: 'systems:mcp',      label: 'MCP Servers',    icon: Plug },
        { id: 'systems:cron',     label: 'Automation',     icon: Clock },
        { id: 'systems:config',   label: 'App Settings',   icon: Settings },
    ]},
    { category: 'Safety',  icon: Shield,   items: [
        { id: 'safety:policies',  label: 'Tool Policies',  icon: ShieldCheck },
        { id: 'safety:paths',     label: 'Write Paths',    icon: FolderLock },
        { id: 'safety:snapshots', label: 'Safety Log',     icon: History },
    ]},
    { category: 'Monitor', icon: Activity, items: [
        { id: 'monitor:live',     label: 'Live Telemetry', icon: Zap },
        { id: 'monitor:audit',    label: 'Neural Audit',   icon: BarChart2 },
    ]},
    { category: 'Agents',  icon: Users,    items: [
        { id: 'agents:registry',  label: 'Registry',       icon: Users },
        { id: 'agents:tasks',     label: 'Active Tasks',   icon: ListChecks },
    ]},
    { category: 'Forge',   icon: Hammer,   items: [
        { id: 'forge:hub',        label: 'Projects',       icon: FolderOpen },
        { id: 'forge:edit',       label: 'Code Editor',    icon: Code2 },
        { id: 'forge:sessions',   label: 'Code Sessions',  icon: Terminal },
    ]},
];

// ─── Lazy modules ─────────────────────────────────────────────────────────────
const CommsModule   = React.lazy(() => import('./modules/CommsModule'));
const BrainModule   = React.lazy(() => import('./modules/BrainModule'));
const SkillsModule  = React.lazy(() => import('./modules/SkillsModule'));
const SoulModule    = React.lazy(() => import('./modules/SoulModule'));
const SystemsModule = React.lazy(() => import('./modules/SystemsModule'));
const SafetyModule  = React.lazy(() => import('./modules/SafetyModule'));
const MonitorModule = React.lazy(() => import('./modules/MonitorModule'));
const AgentsModule  = React.lazy(() => import('./modules/AgentsModule'));
const ForgeModule   = React.lazy(() => import('./modules/ForgeModule'));
const WorkspaceHub  = React.lazy(() => import('./modules/WorkspaceHub'));

const MODULE_MAP = {
    'comms:channels':   [CommsModule,   'channels'],
    'brain:memory':     [BrainModule,   'memory'],
    'brain:projects':   [BrainModule,   'projects'],
    'skills:arsenal':   [SkillsModule,  'arsenal'],
    'soul:identity':    [SoulModule,    'identity'],
    'soul:persona':     [SoulModule,    'persona'],
    'soul:senses':      [SoulModule,    'senses'],
    'systems:mcp':      [SystemsModule, 'mcp'],
    'systems:cron':     [SystemsModule, 'cron'],
    'systems:config':   [SystemsModule, 'config'],
    'safety:policies':  [SafetyModule,  'policies'],
    'safety:paths':     [SafetyModule,  'paths'],
    'safety:snapshots': [SafetyModule,  'snapshots'],
    'monitor:live':     [MonitorModule, 'live'],
    'monitor:audit':    [MonitorModule, 'audit'],
    'agents:registry':  [AgentsModule,  'registry'],
    'agents:tasks':     [AgentsModule,  'tasks'],
    'forge:edit':       [ForgeModule,   'edit'],
    'forge:sessions':   [ForgeModule,   'sessions'],
};

// ─── Embed protocol ──────────────────────────────────────────────────────────
const EMBED_REGEX = /\[embed:(\w+)\]/g;
const EMBED_ID_MAP = {
    Comms: 'comms:channels', Brain: 'brain:memory', Skills: 'skills:arsenal',
    Soul: 'soul:identity', Systems: 'systems:mcp', Safety: 'safety:policies',
    Monitor: 'monitor:live', Agents: 'agents:registry', Forge: 'forge:hub',
};

const parseEmbeds = (content) => {
    const parts = [];
    let last = 0;
    EMBED_REGEX.lastIndex = 0;
    let m;
    while ((m = EMBED_REGEX.exec(content)) !== null) {
        if (m.index > last) parts.push({ type: 'text', value: content.slice(last, m.index) });
        parts.push({ type: 'embed', name: m[1] });
        last = m.index + m[0].length;
    }
    if (last < content.length) parts.push({ type: 'text', value: content.slice(last) });
    return parts;
};

const EmbedCard = ({ name, onOpen }) => {
    const moduleId = EMBED_ID_MAP[name] ?? 'comms:chat';
    const navItem = NAV_STRUCTURE.flatMap(g => g.items).find(i => i.id === moduleId);
    if (!navItem) return <span style={{ color: PALETTE.inkFaint }} className="text-xs">[embed:{name}]</span>;
    const Icon = navItem.icon;
    return (
        <motion.button
            onClick={() => onOpen(moduleId)}
            whileHover={{ scale: 1.01 }}
            className="flex items-center gap-3 px-3 py-2 mt-2 rounded-lg w-full text-left text-xs font-mono transition-colors"
            style={{
                background: 'rgba(201,168,76,0.08)',
                border: '1px solid rgba(201,168,76,0.2)',
                color: PALETTE.gold,
            }}
        >
            <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: PALETTE.gold }} />
            <span className="flex-1">{navItem.label}</span>
            <span style={{ color: PALETTE.inkFaint }} className="text-[10px]">Open →</span>
        </motion.button>
    );
};

// Slash commands now live in src/services/commands/CommandRegistry.js.

// ─── Agent announce card ──────────────────────────────────────────────────────
const AgentAnnounceCard = ({ content, onViewDetails }) => {
    const headerMatch = content.match(/^\[AGENT_ANNOUNCE\]\s*(.+?)\s+completed\s+"(.+?)"\s+in\s+(\d+)s\./);
    const agentName = headerMatch?.[1] ?? 'Sub-Agent';
    const taskLabel = headerMatch?.[2] ?? 'Task';
    const elapsed   = headerMatch?.[3] ?? '?';
    const resultText = content.split('\n\nResult:\n').slice(1).join('\n\nResult:\n').trim();
    return (
        <div className="w-full max-w-[90%] rounded-lg overflow-hidden" style={{ border: '1px solid rgba(201,168,76,0.25)', background: 'rgba(201,168,76,0.05)' }}>
            <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid rgba(201,168,76,0.15)', background: 'rgba(201,168,76,0.08)' }}>
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: PALETTE.gold }} />
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: PALETTE.gold }}>Agent Report</span>
                <span className="ml-auto text-[9px] font-mono" style={{ color: PALETTE.inkFaint }}>{elapsed}s</span>
            </div>
            <div className="px-3 py-2.5 space-y-1.5">
                <div className="text-[10px]" style={{ color: PALETTE.inkFaint }}>{agentName}</div>
                <div className="text-xs font-medium leading-snug" style={{ color: PALETTE.ink }}>{taskLabel}</div>
                {resultText && <p className="text-[10px] leading-relaxed line-clamp-3" style={{ color: PALETTE.inkMid }}>{resultText}</p>}
            </div>
            {resultText && (
                <button onClick={onViewDetails} className="w-full flex items-center justify-center gap-1.5 py-2 text-[10px] transition-colors" style={{ borderTop: '1px solid rgba(201,168,76,0.15)', color: PALETTE.inkFaint }}>
                    <ExternalLink className="w-3 h-3" />
                    View in Agents → Tasks
                </button>
            )}
        </div>
    );
};

// ─── Palette ──────────────────────────────────────────────────────────────────
const PALETTE = {
    leather:   '#0e0905',
    leatherMid:'#1a0f06',
    page:      '#110c07',
    pageMid:   '#160f09',
    spine:     '#1e1409',
    border:    '#3a2712',
    borderFaint:'#261a0d',
    gold:      '#c9a84c',
    goldDim:   '#7a6028',
    goldGlow:  'rgba(201,168,76,0.15)',
    ink:       '#c4b49a',
    inkMid:    '#8a7a65',
    inkFaint:  '#4a3f30',
    runeBlue:  '#4a7fa5',
    runeBlueDim:'rgba(74,127,165,0.15)',
};

// ─── Decorative rune ornament ─────────────────────────────────────────────────
const Ornament = ({ className = '' }) => (
    <span className={`select-none pointer-events-none ${className}`} style={{ color: PALETTE.goldDim, fontFamily: 'serif' }}>
        ✦
    </span>
);

// ─── Module spinner ───────────────────────────────────────────────────────────
const ModuleLoader = () => (
    <div className="flex-1 flex items-center justify-center">
        <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
            className="text-2xl select-none"
            style={{ color: PALETTE.goldDim }}
        >
            ✦
        </motion.div>
    </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
const GrimoireDashboard = ({ onClose, onSend, onOpenSettings }) => {
    const {
        projects, activeProjectId, switchProject, createProject, deleteProject, streamingText,
        addChatThread, switchChatThread, deleteChatThread,
    } = useMemoryStore();
    const activeProject = projects.find(p => p.id === activeProjectId);
    const activeChatThread = activeProject?.chatThreads?.find(t => t.id === activeProject.activeChatThreadId)
        ?? activeProject?.chatThreads?.[0];
    const messages = activeChatThread?.messages ?? [];

    const [inputValue, setInputValue] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [activeModule, setActiveModule] = useState('comms:chat');
    const [dims, setDims] = useState({ w: 860, h: 640 });

    // Command palette
    const [paletteOpen, setPaletteOpen]     = useState(false);
    const [paletteMode, setPaletteMode]     = useState('overlay'); // 'overlay' | 'dropdown'
    const [paletteQuery, setPaletteQuery]   = useState('');

    const commandContext = React.useMemo(() => ({
        memoryStore: useMemoryStore,
        settingsStore: useSettingsStore,
        agentSpawner,
        agentRegistry: AGENT_REGISTRY,
        forgeService,
        modelCatalog: MODEL_CATALOG,
        openSettings: onOpenSettings,
    }), [onOpenSettings]);

    const runSlashCommand = React.useCallback(async (raw) => {
        const reply = await executeCommand(raw, commandContext);
        if (reply == null) return false;
        const { addMessage } = useMemoryStore.getState();
        addMessage({ role: 'user', content: raw });
        addMessage({ role: 'assistant', content: reply });
        return true;
    }, [commandContext]);

    const executePaletteDef = React.useCallback(async (def) => {
        // If the command takes args, drop the user back into the input pre-filled.
        if (def.argsHint && def.argsHint.includes('<')) {
            setInputValue(`/${def.name} `);
            setPaletteOpen(false);
            return;
        }
        setPaletteOpen(false);
        setPaletteQuery('');
        await runSlashCommand(`/${def.name}`);
    }, [runSlashCommand]);

    // Cmd/Ctrl+K toggles the overlay palette.
    useEffect(() => {
        const onKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setPaletteMode('overlay');
                setPaletteQuery('');
                setPaletteOpen(o => !o);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Inline `/` dropdown — open as the user types a slash command.
    useEffect(() => {
        if (inputValue.startsWith('/')) {
            setPaletteMode('dropdown');
            setPaletteQuery(inputValue);
            setPaletteOpen(true);
        } else if (paletteMode === 'dropdown') {
            setPaletteOpen(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inputValue]);

    const messagesEndRef = useRef(null);
    const dragControls   = useDragControls();
    const dimsRef        = useRef(dims);
    useEffect(() => { dimsRef.current = dims; }, [dims]);

    const startResize = useCallback((e, edges) => {
        e.stopPropagation();
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const { w: startW, h: startH } = dimsRef.current;
        const MIN_W = 520, MIN_H = 380, MAX_W = 1600, MAX_H = 1100;
        const onMove = (ev) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            setDims(prev => ({
                w: edges.right  ? Math.max(MIN_W, Math.min(MAX_W, startW + dx)) : prev.w,
                h: edges.bottom ? Math.max(MIN_H, Math.min(MAX_H, startH + dy)) : prev.h,
            }));
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        const meaningful = messages.filter(m => m.role === 'user' || m.role === 'assistant');
        if (meaningful.length > 0) {
            setIsThinking(meaningful[meaningful.length - 1].role === 'user');
        }
    }, [messages]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmed = inputValue.trim();
        if (!trimmed) return;
        if (trimmed.startsWith('/')) {
            const handled = await runSlashCommand(trimmed);
            setInputValue('');
            setPaletteOpen(false);
            if (handled) return;
        }
        onSend(trimmed);
        setInputValue('');
        setIsThinking(true);
    };

    // ── Chat page ─────────────────────────────────────────────────────────────
    const ChatPanel = () => (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-5 space-y-4" onPointerDown={e => e.stopPropagation()}>
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center gap-3 select-none">
                        <Ornament className="text-3xl" />
                        <p className="text-sm italic" style={{ color: PALETTE.inkFaint, fontFamily: 'serif' }}>
                            The pages await your words…
                        </p>
                    </div>
                )}

                <AnimatePresence mode="popLayout">
                    {messages.map((msg, idx) => {
                        if (msg.role === 'tool') return (
                            <motion.div key={msg.id || idx} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="flex justify-start">
                                <ToolBlock name={msg.name} args={msg.args} result={msg.result} status={msg.status} />
                            </motion.div>
                        );
                        if (msg.role === 'system') return null;
                        if (msg.isAgentAnnounce) return (
                            <motion.div key={msg.id || idx} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="flex justify-start">
                                <AgentAnnounceCard content={msg.content} onViewDetails={() => setActiveModule('agents:tasks')} />
                            </motion.div>
                        );

                        const isUser = msg.role === 'user';
                        return (
                            <motion.div
                                key={msg.id || idx}
                                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ duration: 0.25 }}
                                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                            >
                                {!isUser && (
                                    <div className="mr-2 mt-1 shrink-0 text-xs select-none" style={{ color: PALETTE.goldDim }}>✦</div>
                                )}
                                <div
                                    className="max-w-[82%] px-4 py-3 text-sm leading-relaxed"
                                    style={isUser ? {
                                        background: 'rgba(74,127,165,0.1)',
                                        border: `1px solid rgba(74,127,165,0.25)`,
                                        color: '#a8c4d8',
                                        borderRadius: '12px 12px 4px 12px',
                                    } : {
                                        background: 'rgba(201,168,76,0.05)',
                                        border: `1px solid ${PALETTE.borderFaint}`,
                                        color: PALETTE.ink,
                                        borderRadius: '4px 12px 12px 12px',
                                        fontFamily: 'serif',
                                    }}
                                >
                                    {msg.role === 'assistant' ? (
                                        <div>
                                            {parseEmbeds(msg.content).map((part, i) =>
                                                part.type === 'text'
                                                    ? <span key={i} className="whitespace-pre-wrap">{part.value}</span>
                                                    : <EmbedCard key={i} name={part.name} onOpen={setActiveModule} />
                                            )}
                                        </div>
                                    ) : (
                                        <span className="whitespace-pre-wrap">{msg.content}</span>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                <AnimatePresence>
                    {streamingText ? (
                        <motion.div key="streaming" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex justify-start">
                            <div className="mr-2 mt-1 text-xs select-none" style={{ color: PALETTE.goldDim }}>✦</div>
                            <div className="max-w-[82%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap" style={{ background: 'rgba(201,168,76,0.05)', border: `1px solid ${PALETTE.borderFaint}`, color: PALETTE.ink, borderRadius: '4px 12px 12px 12px', fontFamily: 'serif' }}>
                                {streamingText}
                                <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 0.8 }} className="inline-block w-0.5 h-3.5 ml-0.5 align-middle" style={{ background: PALETTE.gold }} />
                            </div>
                        </motion.div>
                    ) : isThinking && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                        <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3 ml-6">
                            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 3, ease: 'linear' }} className="text-sm" style={{ color: PALETTE.goldDim }}>
                                ✦
                            </motion.div>
                            <span className="text-[10px] uppercase tracking-[0.3em]" style={{ color: PALETTE.inkFaint, fontFamily: 'serif', fontStyle: 'italic' }}>
                                consulting the ether…
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div ref={messagesEndRef} />
            </div>

            {/* Activity strip */}
            <div style={{ borderTop: `1px solid ${PALETTE.borderFaint}`, background: 'rgba(0,0,0,0.3)' }}>
                <ActivityTicker />
            </div>

            {/* Input */}
            <form
                onSubmit={handleSubmit}
                className="p-4 shrink-0"
                style={{ borderTop: `1px solid ${PALETTE.borderFaint}`, background: PALETTE.page }}
                onPointerDown={e => e.stopPropagation()}
            >
                {/* Decorative line above input */}
                <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${PALETTE.goldDim}, transparent)` }} />
                    <Ornament className="text-xs" />
                    <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${PALETTE.goldDim}, transparent)` }} />
                </div>
                <div className="relative">
                    {paletteMode === 'dropdown' && (
                        <CommandPalette
                            open={paletteOpen}
                            mode="dropdown"
                            query={paletteQuery}
                            onQueryChange={(q) => { setPaletteQuery(q); setInputValue(q); }}
                            onExecute={executePaletteDef}
                            onClose={() => setPaletteOpen(false)}
                        />
                    )}
                    <textarea
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e);
                            }
                        }}
                        placeholder="Inscribe your query…"
                        className="w-full rounded-lg px-4 py-3 pr-20 text-sm resize-none focus:outline-none transition-all"
                        style={{
                            background: PALETTE.leatherMid,
                            border: `1px solid ${PALETTE.border}`,
                            color: PALETTE.ink,
                            minHeight: '50px',
                            fontFamily: 'serif',
                            caretColor: PALETTE.gold,
                        }}
                        onFocus={e => { e.target.style.borderColor = PALETTE.goldDim; e.target.style.boxShadow = `0 0 0 1px ${PALETTE.goldDim}22`; }}
                        onBlur={e => { e.target.style.borderColor = PALETTE.border; e.target.style.boxShadow = 'none'; }}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => {
                                if (!('webkitSpeechRecognition' in window) || isListening) return;
                                const r = new window.webkitSpeechRecognition();
                                r.lang = 'en-US';
                                r.onstart = () => setIsListening(true);
                                r.onend = () => setIsListening(false);
                                r.onresult = e => setInputValue(p => (p ? p + ' ' : '') + e.results[0][0].transcript);
                                r.start();
                            }}
                            className="p-2 rounded-full transition-colors"
                            style={{ color: isListening ? '#e88' : PALETTE.inkFaint }}
                        >
                            <Mic className="w-4 h-4" />
                        </button>
                        <button
                            type="submit"
                            disabled={!inputValue.trim()}
                            className="p-2 rounded-full transition-colors disabled:opacity-30"
                            style={{ color: inputValue.trim() ? PALETTE.gold : PALETTE.inkFaint }}
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );

    // ── Module renderer ───────────────────────────────────────────────────────
    const renderModule = () => {
        if (activeModule === 'comms:chat') return <ChatPanel />;
        if (activeModule === 'forge:hub') return (
            <React.Suspense fallback={<ModuleLoader />}>
                <WorkspaceHub onOpenForge={setActiveModule} />
            </React.Suspense>
        );
        const entry = MODULE_MAP[activeModule];
        if (!entry) return null;
        const [Component, tab] = entry;
        return (
            <React.Suspense fallback={<ModuleLoader />}>
                <Component activeTab={tab} />
            </React.Suspense>
        );
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <>
        {paletteMode === 'overlay' && (
            <CommandPalette
                open={paletteOpen}
                mode="overlay"
                query={paletteQuery}
                onQueryChange={setPaletteQuery}
                onExecute={executePaletteDef}
                onClose={() => setPaletteOpen(false)}
            />
        )}
        <motion.div
            drag
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            dragConstraints={{ left: -3000, right: 3000, top: -2000, bottom: 2000 }}
            dragElastic={0.08}
            initial={{ opacity: 0, scale: 0.94, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 30 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto"
            style={{
                width: dims.w,
                height: dims.h,
                background: PALETTE.leather,
                borderRadius: 6,
                border: `2px solid ${PALETTE.border}`,
                boxShadow: `0 32px 80px rgba(0,0,0,0.9), 0 0 0 1px ${PALETTE.goldDim}33, inset 0 1px 0 ${PALETTE.goldDim}22`,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                position: 'relative',
            }}
        >
            {/* ── Cover strip / drag handle ───────────────────────────────── */}
            <div
                onPointerDown={e => dragControls.start(e)}
                className="shrink-0 flex items-center justify-between px-5 select-none cursor-move"
                style={{
                    height: 48,
                    background: `linear-gradient(to bottom, #0a0603, ${PALETTE.leatherMid})`,
                    borderBottom: `1px solid ${PALETTE.border}`,
                }}
            >
                {/* Left ornament */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: PALETTE.goldDim, boxShadow: `0 0 6px ${PALETTE.goldDim}` }} />
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: PALETTE.inkFaint }} />
                        <div className="w-1 h-1 rounded-full" style={{ background: PALETTE.inkFaint }} />
                    </div>
                    <div className="h-4 w-px" style={{ background: PALETTE.borderFaint }} />
                    <span className="text-[9px] uppercase tracking-[0.3em] font-mono" style={{ color: PALETTE.inkFaint }}>
                        Arcane Codex · Vol. I
                    </span>
                </div>

                {/* Title */}
                <div className="flex items-center gap-3 absolute left-1/2 -translate-x-1/2">
                    <Ornament />
                    <span
                        className="text-sm uppercase tracking-[0.35em]"
                        style={{ color: PALETTE.gold, fontFamily: 'Georgia, serif', fontWeight: 400, letterSpacing: '0.35em' }}
                    >
                        Grimoire
                    </span>
                    <Ornament />
                </div>

                {/* Controls */}
                <div className="flex items-center gap-3">
                    <GripHorizontal className="w-4 h-4" style={{ color: PALETTE.inkFaint }} />
                    <button
                        onClick={onClose}
                        className="transition-colors"
                        style={{ color: PALETTE.inkFaint }}
                        onMouseEnter={e => e.currentTarget.style.color = '#e88'}
                        onMouseLeave={e => e.currentTarget.style.color = PALETTE.inkFaint}
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* ── Book body ────────────────────────────────────────────────── */}
            <div className="flex flex-1 overflow-hidden" style={{ background: PALETTE.pageMid }}>

                {/* LEFT PAGE — Navigation ─────────────────────────────────── */}
                <div
                    className="flex flex-col overflow-hidden shrink-0"
                    style={{
                        width: 190,
                        background: `linear-gradient(to right, ${PALETTE.page}, ${PALETTE.pageMid})`,
                        borderRight: `1px solid ${PALETTE.borderFaint}`,
                    }}
                >
                    {/* Chapter heading */}
                    <div className="px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${PALETTE.borderFaint}` }}>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 h-px" style={{ background: PALETTE.borderFaint }} />
                            <span className="text-[8px] uppercase tracking-[0.3em]" style={{ color: PALETTE.inkFaint, fontFamily: 'serif' }}>
                                Index
                            </span>
                            <div className="flex-1 h-px" style={{ background: PALETTE.borderFaint }} />
                        </div>
                    </div>

                    {/* Nav groups */}
                    <div className="flex-1 overflow-y-auto py-3 space-y-2">
                        {NAV_STRUCTURE.map((group, gi) => (
                            <div key={group.category} className="px-3">
                                {gi > 0 && (
                                    <div className="mb-2 mt-0.5 h-px mx-1" style={{ background: PALETTE.borderFaint }} />
                                )}
                                <div
                                    className="px-1 pb-1 text-[8px] uppercase tracking-[0.25em] font-semibold"
                                    style={{ color: PALETTE.inkFaint, fontFamily: 'serif', letterSpacing: '0.25em' }}
                                >
                                    {group.category}
                                </div>
                                <div className="space-y-0.5">
                                    {group.items.map(item => {
                                        const Icon = item.icon;
                                        const isActive = activeModule === item.id;
                                        return (
                                            <button
                                                key={item.id}
                                                onClick={() => setActiveModule(item.id)}
                                                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-xs transition-all text-left"
                                                style={isActive ? {
                                                    background: PALETTE.goldGlow,
                                                    border: `1px solid ${PALETTE.goldDim}44`,
                                                    color: PALETTE.gold,
                                                } : {
                                                    background: 'transparent',
                                                    border: '1px solid transparent',
                                                    color: PALETTE.inkMid,
                                                }}
                                                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = PALETTE.ink; e.currentTarget.style.background = 'rgba(201,168,76,0.04)'; } }}
                                                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = PALETTE.inkMid; e.currentTarget.style.background = 'transparent'; } }}
                                            >
                                                {isActive
                                                    ? <span className="text-[10px]" style={{ color: PALETTE.gold }}>✦</span>
                                                    : <Icon className="w-3 h-3 shrink-0" />
                                                }
                                                <span className="truncate" style={{ fontFamily: isActive ? 'serif' : 'inherit' }}>{item.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Tomes (Projects) + Chapters (Chat Threads) */}
                    <div className="shrink-0 flex flex-col" style={{ borderTop: `1px solid ${PALETTE.borderFaint}`, maxHeight: 220 }}>
                        {/* Tomes header */}
                        <div className="px-4 py-2 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-1.5">
                                <BookOpen className="w-2.5 h-2.5" style={{ color: PALETTE.inkFaint }} />
                                <span className="text-[8px] uppercase tracking-[0.25em]" style={{ color: PALETTE.inkFaint, fontFamily: 'serif' }}>
                                    Tomes
                                </span>
                            </div>
                            <button
                                onClick={() => createProject(`Tome ${projects.length + 1}`)}
                                className="transition-colors"
                                style={{ color: PALETTE.inkFaint }}
                                title="New Tome"
                                onMouseEnter={e => e.currentTarget.style.color = PALETTE.gold}
                                onMouseLeave={e => e.currentTarget.style.color = PALETTE.inkFaint}
                            >
                                <SquarePen className="w-3 h-3" />
                            </button>
                        </div>

                        {/* Tomes list */}
                        <div className="overflow-y-auto space-y-0.5 px-3 shrink-0" style={{ maxHeight: 72 }}>
                            {projects.map(proj => (
                                <div key={proj.id} className="group flex items-center gap-1">
                                    <button
                                        onClick={() => switchProject(proj.id)}
                                        className="flex-1 text-left px-2 py-1.5 rounded text-[11px] truncate transition-all"
                                        style={activeProjectId === proj.id ? {
                                            background: PALETTE.goldGlow,
                                            border: `1px solid ${PALETTE.goldDim}44`,
                                            color: PALETTE.gold,
                                        } : {
                                            background: 'transparent',
                                            border: '1px solid transparent',
                                            color: PALETTE.inkMid,
                                        }}
                                    >
                                        {activeProjectId === proj.id && (
                                            <ChevronRight className="w-2.5 h-2.5 inline mr-1 -mt-0.5" style={{ color: PALETTE.goldDim }} />
                                        )}
                                        {proj.name}
                                    </button>
                                    {projects.length > 1 && (
                                        <button
                                            onClick={() => deleteProject(proj.id)}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                                            style={{ color: PALETTE.inkFaint }}
                                            title="Delete Tome"
                                            onMouseEnter={e => e.currentTarget.style.color = '#e88'}
                                            onMouseLeave={e => e.currentTarget.style.color = PALETTE.inkFaint}
                                        >
                                            <Trash2 className="w-2.5 h-2.5" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Chapters (chat threads) for active Tome */}
                        {activeProject && (
                            <>
                                <div className="px-4 pt-2 pb-1 flex items-center justify-between shrink-0" style={{ borderTop: `1px solid ${PALETTE.borderFaint}` }}>
                                    <span className="text-[8px] uppercase tracking-[0.25em]" style={{ color: PALETTE.inkFaint, fontFamily: 'serif' }}>
                                        Chapters
                                    </span>
                                    <button
                                        onClick={() => addChatThread('New Chapter')}
                                        className="transition-colors"
                                        style={{ color: PALETTE.inkFaint }}
                                        title="New Chapter"
                                        onMouseEnter={e => e.currentTarget.style.color = PALETTE.gold}
                                        onMouseLeave={e => e.currentTarget.style.color = PALETTE.inkFaint}
                                    >
                                        <SquarePen className="w-3 h-3" />
                                    </button>
                                </div>
                                <div className="overflow-y-auto space-y-0.5 px-3 pb-2" style={{ maxHeight: 88 }}>
                                    {(activeProject.chatThreads || []).map(thread => (
                                        <div key={thread.id} className="group flex items-center gap-1">
                                            <button
                                                onClick={() => { switchChatThread(thread.id); setActiveModule('comms:chat'); }}
                                                className="flex-1 text-left px-2 py-1 rounded text-[10px] truncate transition-all"
                                                style={activeChatThread?.id === thread.id ? {
                                                    background: 'rgba(74,127,165,0.12)',
                                                    border: '1px solid rgba(74,127,165,0.25)',
                                                    color: '#a8c4d8',
                                                } : {
                                                    background: 'transparent',
                                                    border: '1px solid transparent',
                                                    color: PALETTE.inkMid,
                                                }}
                                            >
                                                {activeChatThread?.id === thread.id && (
                                                    <span className="mr-1 text-[8px]" style={{ color: PALETTE.runeBlue }}>▸</span>
                                                )}
                                                {thread.title}
                                            </button>
                                            {(activeProject.chatThreads || []).length > 1 && (
                                                <button
                                                    onClick={() => deleteChatThread(thread.id)}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                                                    style={{ color: PALETTE.inkFaint }}
                                                    title="Delete Chapter"
                                                    onMouseEnter={e => e.currentTarget.style.color = '#e88'}
                                                    onMouseLeave={e => e.currentTarget.style.color = PALETTE.inkFaint}
                                                >
                                                    <Trash2 className="w-2.5 h-2.5" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* SPINE ornament ──────────────────────────────────────────── */}
                <div
                    className="shrink-0 flex flex-col items-center py-4 gap-3"
                    style={{
                        width: 18,
                        background: `linear-gradient(to right, ${PALETTE.spine}, #2a1c0f, ${PALETTE.spine})`,
                        borderRight: `1px solid ${PALETTE.borderFaint}`,
                        borderLeft: `1px solid ${PALETTE.borderFaint}`,
                    }}
                >
                    {/* Spine decorations */}
                    <div className="w-px flex-1" style={{ background: `linear-gradient(to bottom, transparent, ${PALETTE.goldDim}, transparent)` }} />
                    <div className="text-[8px] select-none" style={{ color: PALETTE.goldDim, writingMode: 'vertical-rl', letterSpacing: '0.2em', fontFamily: 'serif' }}>
                        ✦
                    </div>
                    <div className="w-px flex-1" style={{ background: `linear-gradient(to bottom, transparent, ${PALETTE.goldDim}, transparent)` }} />
                </div>

                {/* RIGHT PAGE — Content ────────────────────────────────────── */}
                <div className="flex-1 flex flex-col overflow-hidden" style={{ background: PALETTE.pageMid }}>
                    {/* Page header */}
                    <div className="px-5 py-2 shrink-0 flex items-center justify-between" style={{ borderBottom: `1px solid ${PALETTE.borderFaint}` }}>
                        <span className="text-[9px] uppercase tracking-[0.2em]" style={{ color: PALETTE.inkFaint, fontFamily: 'serif' }}>
                            {activeModule === 'comms:chat' && activeChatThread
                                ? activeChatThread.title
                                : (NAV_STRUCTURE.flatMap(g => g.items).find(i => i.id === activeModule)?.label ?? 'Chat')
                            }
                        </span>
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full animate-pulse" style={{ background: PALETTE.goldDim }} />
                            <span className="text-[8px] font-mono" style={{ color: PALETTE.inkFaint }}>BOUND</span>
                        </div>
                    </div>

                    {/* Module area */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeModule}
                            initial={{ opacity: 0, x: 6 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -6 }}
                            transition={{ duration: 0.15 }}
                            className="flex-1 flex flex-col min-w-0 overflow-hidden"
                        >
                            {renderModule()}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* ── Footer ──────────────────────────────────────────────────── */}
            <div
                className="shrink-0 flex items-center justify-between px-5"
                style={{
                    height: 24,
                    background: `linear-gradient(to top, #060402, ${PALETTE.leatherMid})`,
                    borderTop: `1px solid ${PALETTE.border}`,
                }}
            >
                <span className="text-[7px] uppercase tracking-[0.3em] font-mono" style={{ color: PALETTE.inkFaint }}>
                    Arcane Familiar v∞
                </span>
                <div className="flex items-center gap-1.5">
                    <div className="h-px w-12" style={{ background: `linear-gradient(to right, transparent, ${PALETTE.goldDim})` }} />
                    <Ornament className="text-[8px]" />
                    <div className="h-px w-12" style={{ background: `linear-gradient(to left, transparent, ${PALETTE.goldDim})` }} />
                </div>
                {/* Resize corner grip — bottom-right of footer */}
                <div
                    onPointerDown={e => startResize(e, { right: true, bottom: true })}
                    className="flex items-center justify-center select-none"
                    style={{ cursor: 'se-resize', padding: 2, marginRight: -2 }}
                    title="Drag to resize"
                >
                    <svg width="10" height="10" viewBox="0 0 10 10">
                        <circle cx="8" cy="8" r="1.2" fill={PALETTE.inkFaint} />
                        <circle cx="4.5" cy="8" r="1.2" fill={PALETTE.inkFaint} />
                        <circle cx="8" cy="4.5" r="1.2" fill={PALETTE.inkFaint} />
                    </svg>
                </div>
            </div>

            {/* ── Resize edges (invisible hit areas) ──────────────────────── */}
            {/* Right edge */}
            <div
                onPointerDown={e => startResize(e, { right: true })}
                style={{
                    position: 'absolute', right: 0, top: 0, bottom: 0,
                    width: 5, cursor: 'e-resize', zIndex: 100,
                }}
            />
            {/* Bottom edge */}
            <div
                onPointerDown={e => startResize(e, { bottom: true })}
                style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    height: 5, cursor: 's-resize', zIndex: 100,
                }}
            />
            {/* Bottom-right corner (priority over edges) */}
            <div
                onPointerDown={e => startResize(e, { right: true, bottom: true })}
                style={{
                    position: 'absolute', right: 0, bottom: 0,
                    width: 14, height: 14, cursor: 'se-resize', zIndex: 101,
                }}
            />
        </motion.div>
        </>
    );
};

export default GrimoireDashboard;
