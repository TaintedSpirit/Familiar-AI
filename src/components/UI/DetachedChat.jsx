import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import {
    X, MessageSquare, Send, GripHorizontal, Mic, SquarePen, Terminal,
    Radio, Brain, Sparkles, Database, FolderOpen, Server, Plug, Clock,
    Shield, ShieldCheck, FolderLock, History, Activity, Zap, BarChart2,
    Hash, Eye, Settings, User, Swords, Fingerprint, Users, ListChecks,
    CheckCircle2, ExternalLink
} from 'lucide-react';
import { useMemoryStore } from '../../services/memory/MemoryStore';
import { AGENT_REGISTRY } from '../../services/agent/AgentRegistry';
import { useAgentTaskStore } from '../../services/agent/AgentTaskStore';
import { agentSpawner } from '../../services/agent/AgentSpawner';
import ToolBlock from './ToolBlock';
import ActivityTicker from './ActivityTicker';

// ---------------------------------------------------------------------------
// Navigation structure
// ---------------------------------------------------------------------------
const NAV_STRUCTURE = [
    {
        category: 'Comms', icon: Radio, items: [
            { id: 'comms:chat',      label: 'Chat',           icon: MessageSquare },
            { id: 'comms:channels',  label: 'Ext. Channels',  icon: Hash },
        ]
    },
    {
        category: 'Brain', icon: Brain, items: [
            { id: 'brain:memory',    label: 'Memory Browser', icon: Database },
            { id: 'brain:projects',  label: 'Projects',       icon: FolderOpen },
        ]
    },
    {
        category: 'Skills', icon: Swords, items: [
            { id: 'skills:arsenal',  label: 'Arsenal',       icon: Swords },
        ]
    },
    {
        category: 'Soul', icon: Sparkles, items: [
            { id: 'soul:identity',   label: 'Identity',      icon: Fingerprint },
            { id: 'soul:persona',    label: 'Persona',       icon: User },
            { id: 'soul:senses',     label: 'Senses',        icon: Mic },
        ]
    },
    {
        category: 'Systems', icon: Server, items: [
            { id: 'systems:mcp',     label: 'MCP Servers',    icon: Plug },
            { id: 'systems:cron',    label: 'Automation',     icon: Clock },
            { id: 'systems:config',  label: 'App Settings',   icon: Settings },
        ]
    },
    {
        category: 'Safety', icon: Shield, items: [
            { id: 'safety:policies', label: 'Tool Policies',  icon: ShieldCheck },
            { id: 'safety:paths',    label: 'Write Paths',    icon: FolderLock },
            { id: 'safety:snapshots',label: 'Safety Log',     icon: History },
        ]
    },
    {
        category: 'Monitor', icon: Activity, items: [
            { id: 'monitor:live',    label: 'Live Telemetry', icon: Zap },
            { id: 'monitor:audit',   label: 'Neural Audit',   icon: BarChart2 },
        ]
    },
    {
        category: 'Agents', icon: Users, items: [
            { id: 'agents:registry', label: 'Registry',    icon: Users },
            { id: 'agents:tasks',    label: 'Active Tasks', icon: ListChecks },
        ]
    },
];

// ---------------------------------------------------------------------------
// Lazy-loaded modules
// ---------------------------------------------------------------------------
const CommsModule   = React.lazy(() => import('./modules/CommsModule'));
const BrainModule   = React.lazy(() => import('./modules/BrainModule'));
const SkillsModule  = React.lazy(() => import('./modules/SkillsModule'));
const SoulModule    = React.lazy(() => import('./modules/SoulModule'));
const SystemsModule = React.lazy(() => import('./modules/SystemsModule'));
const SafetyModule  = React.lazy(() => import('./modules/SafetyModule'));
const MonitorModule = React.lazy(() => import('./modules/MonitorModule'));
const AgentsModule  = React.lazy(() => import('./modules/AgentsModule'));

const ModuleLoader = () => (
    <div className="flex-1 flex items-center justify-center">
        <div className="w-5 h-5 border border-white/20 border-t-white/60 rounded-full animate-spin" />
    </div>
);

// ---------------------------------------------------------------------------
// Rich Embed Protocol
// ---------------------------------------------------------------------------
const EMBED_REGEX = /\[embed:(\w+)\]/g;

const EMBED_ID_MAP = {
    Comms:   'comms:channels',
    Brain:   'brain:memory',
    Skills:  'skills:arsenal',
    Soul:    'soul:identity',
    Systems: 'systems:mcp',
    Safety:  'safety:policies',
    Monitor: 'monitor:live',
    Agents:  'agents:registry',
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
    if (!navItem) return <span className="text-white/30 text-xs">[embed:{name}]</span>;
    const Icon = navItem.icon;
    return (
        <motion.button
            onClick={() => onOpen(moduleId)}
            whileHover={{ scale: 1.01 }}
            className="flex items-center gap-3 px-3 py-2 mt-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-200 text-xs font-mono hover:bg-blue-500/20 transition-colors w-full text-left"
        >
            <Icon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="flex-1">{navItem.label}</span>
            <span className="text-blue-400/60 text-[10px]">Open →</span>
        </motion.button>
    );
};

// ---------------------------------------------------------------------------
// Module router map
// ---------------------------------------------------------------------------
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
};

// ---------------------------------------------------------------------------
// Agent Announce Report Card
// ---------------------------------------------------------------------------
const AgentAnnounceCard = ({ content, onViewDetails }) => {
    // Parse: "[AGENT_ANNOUNCE] Name completed "label" in Xs.\n\nResult:\n..."
    const headerMatch = content.match(/^\[AGENT_ANNOUNCE\]\s*(.+?)\s+completed\s+"(.+?)"\s+in\s+(\d+)s\./);
    const agentName  = headerMatch?.[1] ?? 'Sub-Agent';
    const taskLabel  = headerMatch?.[2] ?? 'Task';
    const elapsed    = headerMatch?.[3] ?? '?';
    const resultText = content.split('\n\nResult:\n').slice(1).join('\n\nResult:\n').trim();

    return (
        <div className="w-full max-w-[85%] rounded-2xl rounded-tl-sm overflow-hidden border border-green-500/20 bg-green-500/5">
            <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border-b border-green-500/15">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                <span className="text-[10px] font-bold text-green-300 uppercase tracking-widest">Agent Report</span>
                <span className="ml-auto text-[9px] text-green-400/50 font-mono">{elapsed}s</span>
            </div>
            <div className="px-3 py-2.5 space-y-1.5">
                <div className="text-[10px] text-white/40">{agentName}</div>
                <div className="text-xs text-white/80 font-medium leading-snug">{taskLabel}</div>
                {resultText && (
                    <p className="text-[10px] text-white/50 leading-relaxed line-clamp-3">{resultText}</p>
                )}
            </div>
            {resultText && (
                <button
                    onClick={onViewDetails}
                    className="w-full flex items-center justify-center gap-1.5 py-2 border-t border-green-500/15 text-[10px] text-green-400/60 hover:text-green-300 hover:bg-green-500/10 transition-colors"
                >
                    <ExternalLink className="w-3 h-3" />
                    View in Agents → Tasks
                </button>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Slash-command resolver — returns a {role:'assistant', content} message or null
// ---------------------------------------------------------------------------
const resolveSlashCommand = (input) => {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return null;

    const [cmd, ...rest] = trimmed.slice(1).split(/\s+/);

    if (cmd === 'agents') {
        const lines = Object.values(AGENT_REGISTRY).map(p =>
            `**${p.name}** (${p.archetype})\n${p.description}\nTools: ${p.allowedTools.join(', ')}`
        );
        return `Pack Roster:\n\n${lines.join('\n\n')}\n\nUse: spawn_agent agentId="researcher|builder|auditor" task="…"`;
    }

    if (cmd === 'subagents') {
        const list = agentSpawner.list();
        if (!list.length) return 'No active sub-agents.';
        const rows = list.map(s => `• [${s.id.slice(-6)}] "${s.label || s.task?.slice(0, 40)}" — ${s.runningFor}s`);
        return `Active Sub-Agents (${list.length}):\n\n${rows.join('\n')}`;
    }

    if (cmd === 'stopagent') {
        const targetId = rest[0];
        if (!targetId) return 'Usage: /stopagent [id]';
        const list = agentSpawner.list();
        const match = list.find(s => s.id.endsWith(targetId) || s.id === targetId);
        if (!match) return `No active agent matching "${targetId}".`;
        agentSpawner.kill(match.id);
        return `Agent [${match.id.slice(-6)}] "${match.label || match.task?.slice(0, 40)}" terminated.`;
    }

    return null; // not a recognized slash command
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const DetachedChat = ({ onClose, onSend }) => {
    const { projects, activeProjectId, switchProject, createProject, streamingText } = useMemoryStore();
    const activeProject = projects.find(p => p.id === activeProjectId);
    const messages = activeProject ? activeProject.messages : [];

    const [inputValue, setInputValue]   = useState('');
    const [isThinking, setIsThinking]   = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [activeModule, setActiveModule] = useState('comms:chat');

    const messagesEndRef = useRef(null);
    const dragControls   = useDragControls();

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        const meaningful = messages.filter(m => m.role === 'user' || m.role === 'assistant');
        if (meaningful.length > 0) {
            setIsThinking(meaningful[meaningful.length - 1].role === 'user');
        }
    }, [messages]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const trimmed = inputValue.trim();
        if (!trimmed) return;

        const slashResult = resolveSlashCommand(trimmed);
        if (slashResult !== null) {
            // Slash commands: echo the command as a user message, then inject the response locally
            const { addMessage } = useMemoryStore.getState();
            addMessage({ role: 'user', content: trimmed });
            addMessage({ role: 'assistant', content: slashResult });
            setInputValue('');
            return;
        }

        onSend(trimmed);
        setInputValue('');
        setIsThinking(true);
    };

    // -----------------------------------------------------------------------
    // Chat panel (default comms:chat view — identical to original)
    // -----------------------------------------------------------------------
    const ChatPanel = () => (
        <div className="flex-1 flex flex-col min-w-0">
            <div
                className="flex-1 overflow-y-auto p-4 space-y-4"
                onPointerDown={(e) => e.stopPropagation()}
            >
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-white/20 text-sm italic">
                        <p>Channel open.</p>
                        <p>Awaiting input.</p>
                    </div>
                )}

                <AnimatePresence mode="popLayout">
                    {messages.map((msg, idx) => {
                        if (msg.role === 'tool') {
                            return (
                                <motion.div
                                    key={msg.id || idx}
                                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ duration: 0.3, ease: 'easeOut' }}
                                    className="flex justify-start"
                                >
                                    <ToolBlock name={msg.name} args={msg.args} result={msg.result} status={msg.status} />
                                </motion.div>
                            );
                        }
                        if (msg.role === 'system') return null;

                        // Agent announce messages get a premium Report Card
                        if (msg.isAgentAnnounce) {
                            return (
                                <motion.div
                                    key={msg.id || idx}
                                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ duration: 0.3, ease: 'easeOut' }}
                                    className="flex justify-start"
                                >
                                    <AgentAnnounceCard
                                        content={msg.content}
                                        onViewDetails={() => setActiveModule('agents:tasks')}
                                    />
                                </motion.div>
                            );
                        }

                        return (
                            <motion.div
                                key={msg.id || idx}
                                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ duration: 0.3, ease: 'easeOut' }}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm font-light leading-relaxed shadow-sm
                                    ${msg.role === 'user'
                                        ? 'bg-blue-500/10 border border-blue-500/20 text-blue-100 rounded-tr-sm'
                                        : 'bg-white/5 border border-white/5 text-white/90 rounded-tl-sm'
                                    }`}
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
                        <motion.div
                            key="streaming"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex justify-start"
                        >
                            <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm font-light leading-relaxed whitespace-pre-wrap bg-white/5 border border-white/5 text-white/90">
                                {streamingText}
                                <motion.span
                                    animate={{ opacity: [1, 0, 1] }}
                                    transition={{ repeat: Infinity, duration: 0.8 }}
                                    className="inline-block w-0.5 h-3.5 bg-white/60 ml-0.5 align-middle"
                                />
                            </div>
                        </motion.div>
                    ) : isThinking && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                        <motion.div
                            key="thinking"
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="flex justify-start items-center gap-3 ml-1 mt-2 mb-2"
                        >
                            <div className="relative flex items-center justify-center w-8 h-8">
                                <motion.div
                                    className="absolute inset-0 rounded-full border border-blue-400/30"
                                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                                    transition={{ repeat: Infinity, duration: 2 }}
                                />
                                <motion.div
                                    className="w-1.5 h-1.5 bg-blue-400 rounded-full"
                                    animate={{ opacity: [0.5, 1, 0.5] }}
                                    transition={{ repeat: Infinity, duration: 1 }}
                                />
                            </div>
                            <span className="text-xs text-blue-300/50 font-mono tracking-widest uppercase animate-pulse">Processing</span>
                        </motion.div>
                    )}
                </AnimatePresence>
                <div ref={messagesEndRef} />
            </div>

            <div className="bg-black/10 border-t border-white/5">
                <ActivityTicker />
            </div>

            <form
                onSubmit={handleSubmit}
                className="p-4 border-t border-white/5 bg-black/20 shrink-0"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="relative">
                    <textarea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e);
                            }
                        }}
                        placeholder="Send a message..."
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 pr-10 text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10 resize-none h-[50px] scrollbar-none"
                        style={{ minHeight: '50px' }}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => {
                                if (!('webkitSpeechRecognition' in window)) return;
                                if (isListening) return;
                                const recognition = new window.webkitSpeechRecognition();
                                recognition.lang = 'en-US';
                                recognition.onstart = () => setIsListening(true);
                                recognition.onend   = () => setIsListening(false);
                                recognition.onresult = (e) => {
                                    const transcript = e.results[0][0].transcript;
                                    setInputValue(prev => (prev ? prev + ' ' : '') + transcript);
                                };
                                recognition.start();
                            }}
                            className={`p-2 rounded-full transition-colors ${isListening ? 'text-red-400 animate-pulse bg-red-500/10' : 'text-white/40 hover:text-white'}`}
                        >
                            <Mic className="w-4 h-4" />
                        </button>
                        <button
                            type="submit"
                            disabled={!inputValue.trim()}
                            className="p-2 text-white/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );

    // -----------------------------------------------------------------------
    // Module renderer
    // -----------------------------------------------------------------------
    const renderModule = () => {
        if (activeModule === 'comms:chat') return <ChatPanel />;
        const entry = MODULE_MAP[activeModule];
        if (!entry) return null;
        const [Component, tab] = entry;
        return (
            <React.Suspense fallback={<ModuleLoader />}>
                <Component activeTab={tab} />
            </React.Suspense>
        );
    };

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------
    return (
        <motion.div
            drag
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            dragConstraints={{ left: -3000, right: 3000, top: -2000, bottom: 2000 }}
            dragElastic={0.1}
            initial={{ opacity: 0, scale: 0.9, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 50 }}
            className="pointer-events-auto w-[800px] h-[600px] bg-black/10 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/5 resize-y min-h-[400px] max-h-[80vh]"
        >
            {/* Header */}
            <div
                className="h-12 shrink-0 bg-white/5 border-b border-white/5 flex items-center justify-between px-5 cursor-move select-none active:bg-white/10 transition-colors"
                onPointerDown={(e) => dragControls.start(e)}
            >
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-white/60 text-[10px] font-bold tracking-[0.2em] uppercase">
                        <Terminal className="w-3.5 h-3.5 text-blue-400" />
                        <span>Commlink // Stable</span>
                    </div>
                    <div className="h-3 w-[1px] bg-white/10 mx-1" />
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[8px] font-mono tracking-wider">
                        <div className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
                        ENCRYPTED_LINK
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <GripHorizontal className="w-4 h-4 text-white/20" />
                    <button onClick={onClose} className="hover:text-red-400 text-white/20 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex flex-1 overflow-hidden">

                {/* SIDEBAR */}
                <div className="w-48 bg-black/20 border-r border-white/5 flex flex-col overflow-hidden">

                    {/* Zone A — Nav groups */}
                    <div className="flex-1 overflow-y-auto pt-3 space-y-3">
                        {NAV_STRUCTURE.map(group => (
                            <div key={group.category} className="px-2">
                                <div className="px-2 pb-1 text-[9px] uppercase tracking-widest text-white/25 font-semibold">
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
                                                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                                                    isActive
                                                        ? 'bg-blue-500/20 text-blue-200 border border-blue-500/30'
                                                        : 'text-white/50 hover:text-white hover:bg-white/5 border border-transparent'
                                                }`}
                                            >
                                                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-400' : 'text-white/40'}`} />
                                                <span className="truncate">{item.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Zone B — Project list (always visible) */}
                    <div className="border-t border-white/5 pt-2 flex flex-col" style={{ maxHeight: '180px' }}>
                        <div className="px-3 pb-1 flex items-center justify-between">
                            <span className="text-[9px] uppercase tracking-widest text-white/25 font-semibold">Contexts</span>
                            <button
                                onClick={() => createProject(`Chat ${projects.length + 1}`)}
                                className="text-white/30 hover:text-white/70 transition-colors"
                                title="New chat"
                            >
                                <SquarePen className="w-3 h-3" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-0.5 px-2 pb-1">
                            {projects.map(proj => (
                                <button
                                    key={proj.id}
                                    onClick={() => switchProject(proj.id)}
                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] truncate transition-all ${
                                        activeProjectId === proj.id
                                            ? 'bg-blue-500/20 text-blue-200 border border-blue-500/30'
                                            : 'text-white/50 hover:bg-white/5 hover:text-white border border-transparent'
                                    }`}
                                >
                                    {proj.name}
                                </button>
                            ))}
                        </div>
                        <div className="px-3 py-2 text-[9px] text-white/20 text-center border-t border-white/5">
                            {projects.length} Active Thread{projects.length !== 1 ? 's' : ''}
                        </div>
                    </div>
                </div>

                {/* MODULE CONTENT AREA */}
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeModule}
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -8 }}
                            transition={{ duration: 0.15 }}
                            className="flex-1 flex flex-col min-w-0 overflow-hidden"
                        >
                            {renderModule()}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
};

export default DetachedChat;
