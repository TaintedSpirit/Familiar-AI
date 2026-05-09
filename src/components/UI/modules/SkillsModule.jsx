import React, { useState, useEffect } from 'react';
import {
    Eye, Mic, Globe, Clipboard, FileText, FilePen, FolderOpen,
    Terminal, Database, Box, Image, Clock, Cpu, List, Search,
    CalendarOff, Zap, CheckCircle2, XCircle, HelpCircle,
    BookOpen, Sparkles, X
} from 'lucide-react';
import { useVisionStore } from '../../../services/vision/VisionStore';
import { useSpeechStore } from '../../../services/voice/SpeechStore';
import { useActivityStore } from '../../../services/agent/ActivityStore';
import { useSettingsStore } from '../../../services/settings/SettingsStore';
import SkillsAuthoring from './SkillsAuthoring';

// Static capability registry — mirrors ToolRegistry.js without importing it (avoids MCPLoader side-effects)
const BUILT_IN_TOOLS = [
    { name: 'web_search',          icon: Search,      category: 'Web',       desc: 'Search the web for current information' },
    { name: 'scrape_url',          icon: Globe,       category: 'Web',       desc: 'Fetch and read a web page' },
    { name: 'get_screen_context',  icon: Eye,         category: 'System',    desc: 'Capture a screenshot and active window' },
    { name: 'get_clipboard',       icon: Clipboard,   category: 'System',    desc: 'Read the clipboard' },
    { name: 'read_file',           icon: FileText,    category: 'Files',     desc: 'Read a file from disk' },
    { name: 'write_file',          icon: FilePen,     category: 'Files',     desc: 'Write content to a file' },
    { name: 'list_dir',            icon: FolderOpen,  category: 'Files',     desc: 'List files in a directory' },
    { name: 'run_command',         icon: Terminal,    category: 'Execution', desc: 'Run a shell command' },
    { name: 'update_memory',       icon: Database,    category: 'Memory',    desc: 'Persist a fact for future sessions' },
    { name: 'execute_sandboxed',   icon: Box,         category: 'Execution', desc: 'Run code in a Docker sandbox' },
    { name: 'generate_image',      icon: Image,       category: 'Creative',  desc: 'Generate an image via DALL-E / Stability' },
    { name: 'schedule_task',       icon: Clock,       category: 'Schedule',  desc: 'Create a recurring cron job' },
    { name: 'remove_scheduled_task',icon: CalendarOff, category: 'Schedule', desc: 'Cancel a scheduled task' },
    { name: 'spawn_agent',         icon: Cpu,         category: 'Agents',    desc: 'Spawn a background sub-agent' },
    { name: 'list_spawns',         icon: List,        category: 'Agents',    desc: 'List running background agents' },
];

const CATEGORIES = ['Web', 'System', 'Files', 'Execution', 'Memory', 'Creative', 'Schedule', 'Agents'];

const CATEGORY_COLORS = {
    Web:       'text-blue-400',
    System:    'text-purple-400',
    Files:     'text-green-400',
    Execution: 'text-orange-400',
    Memory:    'text-yellow-400',
    Creative:  'text-pink-400',
    Schedule:  'text-cyan-400',
    Agents:    'text-red-400',
};

const CATEGORY_DOT_COLORS = {
    Web:       'bg-blue-400',
    System:    'bg-purple-400',
    Files:     'bg-green-400',
    Execution: 'bg-orange-400',
    Memory:    'bg-yellow-400',
    Creative:  'bg-pink-400',
    Schedule:  'bg-cyan-400',
    Agents:    'bg-red-400',
};

const CATEGORY_LEFT_BORDERS = {
    Web:       'border-l-blue-400/50',
    System:    'border-l-purple-400/50',
    Files:     'border-l-green-400/50',
    Execution: 'border-l-orange-400/50',
    Memory:    'border-l-yellow-400/50',
    Creative:  'border-l-pink-400/50',
    Schedule:  'border-l-cyan-400/50',
    Agents:    'border-l-red-400/50',
};

const SkillsModule = ({ activeTab }) => {
    const { isAwarenessEnabled, visionStatus } = useVisionStore();
    const { voiceMode, isSpeaking, isListening } = useSpeechStore();
    const { activities } = useActivityStore();
    const { mcpServers, toolPolicies } = useSettingsStore();

    const [activeCategory, setActiveCategory] = useState('All');
    const [view, setView] = useState('capabilities'); // 'capabilities' | 'skills'
    const [curatorSuggestions, setCuratorSuggestions] = useState([]);
    const [curatorLastRun, setCuratorLastRun] = useState(null);

    useEffect(() => {
        import('../../../services/soul/SkillCurator').then(({ skillCurator }) => {
            skillCurator.getSuggestions().then(setCuratorSuggestions).catch(() => {});
            skillCurator.getLastRunAt().then(setCuratorLastRun).catch(() => {});
        }).catch(() => {});
    }, []);

    const dismissCuratorSuggestion = async (index) => {
        const { skillCurator } = await import('../../../services/soul/SkillCurator');
        await skillCurator.dismissSuggestion(index);
        setCuratorSuggestions(prev => prev.filter((_, i) => i !== index));
    };

    const recentToolNames = [...new Set(activities.map(a => a.name))].slice(0, 5);
    const mcpCount = Object.keys(mcpServers).length;

    const filteredTools = activeCategory === 'All'
        ? BUILT_IN_TOOLS
        : BUILT_IN_TOOLS.filter(t => t.category === activeCategory);

    const getPolicy = (name) => toolPolicies[name] ?? 'allow';

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Capability summary strip */}
            <div className="shrink-0 border-b px-3 py-2 grid grid-cols-3 gap-2"
                 style={{ borderColor: 'rgba(201,168,76,0.12)', background: 'rgba(0,0,0,0.25)' }}>

                {/* Vision */}
                <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-xl px-2 py-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isAwarenessEnabled ? 'bg-purple-500/20' : 'bg-white/5'
                    }`}>
                        <Eye className={`w-4 h-4 ${isAwarenessEnabled ? 'text-purple-400' : 'text-white/20'}`} />
                    </div>
                    <div className="min-w-0">
                        <div className="text-[10px] text-white/50 leading-none mb-0.5">Vision</div>
                        <div className={`text-[9px] capitalize font-mono leading-none ${
                            visionStatus === 'live' ? 'text-green-400' : 'text-white/25'
                        }`}>{visionStatus}</div>
                    </div>
                </div>

                {/* Voice */}
                <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-xl px-2 py-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isListening || isSpeaking ? 'bg-blue-500/20' : 'bg-white/5'
                    }`}>
                        <Mic className={`w-4 h-4 ${isListening ? 'text-red-400' : isSpeaking ? 'text-blue-400' : 'text-white/20'}`} />
                    </div>
                    <div className="min-w-0">
                        <div className="text-[10px] text-white/50 leading-none mb-0.5">Voice</div>
                        <div className="text-[9px] text-white/25 font-mono leading-none capitalize">
                            {voiceMode === 'push-to-talk' ? 'PTT' : 'Always on'}
                        </div>
                    </div>
                </div>

                {/* MCP */}
                <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-xl px-2 py-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        mcpCount > 0 ? 'bg-green-500/20' : 'bg-white/5'
                    }`}>
                        <Zap className={`w-4 h-4 ${mcpCount > 0 ? 'text-green-400' : 'text-white/20'}`} />
                    </div>
                    <div className="min-w-0">
                        <div className="text-[10px] text-white/50 leading-none mb-0.5">MCP</div>
                        <div className="text-[9px] text-white/25 font-mono leading-none">
                            {mcpCount} server{mcpCount !== 1 ? 's' : ''}
                        </div>
                    </div>
                </div>
            </div>

            {/* Top view selector — Capabilities (built-in tools) vs Skills (file-based playbooks) */}
            <div className="shrink-0 flex border-b border-white/5 bg-black/10">
                {[
                    { id: 'capabilities', label: 'Capabilities', icon: Zap },
                    { id: 'skills',       label: 'Skills',       icon: BookOpen },
                ].map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => setView(id)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] uppercase tracking-wider transition-colors border-b-2 ${
                            view === id
                                ? 'border-b-2 text-[#c9a84c]'
                                : 'border-transparent text-white/30 hover:text-white/60'
                        }`}
                        style={view === id ? { borderBottomColor: '#c9a84c' } : {}}
                    >
                        <Icon className="w-3 h-3" />
                        {label}
                    </button>
                ))}
            </div>

            {view === 'skills' && (
                <div className="flex-1 overflow-y-auto p-4">
                    <SkillsAuthoring />
                </div>
            )}

            {view === 'capabilities' && (
            <>
            {/* Category filter pills */}
            <div className="shrink-0 flex gap-1.5 px-4 py-2 border-b border-white/5 overflow-x-auto">
                {/* All pill */}
                <button
                    onClick={() => setActiveCategory('All')}
                    className={`shrink-0 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider border transition-colors ${
                        activeCategory === 'All'
                            ? 'text-[#c9a84c] border-[#c9a84c]/40'
                            : 'bg-white/5 text-white/30 border-white/5 hover:text-white/60'
                    }`}
                    style={activeCategory === 'All' ? { background: 'rgba(201,168,76,0.1)' } : {}}
                >
                    All
                </button>
                {CATEGORIES.map(cat => {
                    const isActive = activeCategory === cat;
                    const dotClass = CATEGORY_DOT_COLORS[cat] ?? 'bg-white/30';
                    return (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider border transition-colors ${
                                isActive
                                    ? `${CATEGORY_COLORS[cat]} border-current bg-white/[0.07]`
                                    : 'bg-white/5 text-white/30 border-white/5 hover:text-white/50'
                            }`}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass} ${isActive ? 'opacity-100' : 'opacity-40'}`} />
                            {cat}
                        </button>
                    );
                })}
            </div>

            {/* Tool cards */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {/* Recent tools highlight */}
                {activeCategory === 'All' && recentToolNames.length > 0 && (
                    <div className="mb-3">
                        <div className="text-[9px] uppercase tracking-widest mb-1.5"
                             style={{ color: 'rgba(201,168,76,0.5)' }}>Recently Used</div>
                        <div className="flex flex-wrap gap-1.5">
                            {recentToolNames.map(name => (
                                <span
                                    key={name}
                                    className="px-2 py-0.5 rounded-lg text-[10px] font-mono"
                                    style={{
                                        background: 'rgba(201,168,76,0.08)',
                                        border: '1px solid rgba(201,168,76,0.2)',
                                        color: '#c9a84c',
                                    }}
                                >
                                    {name}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {filteredTools.map(tool => {
                    const Icon = tool.icon;
                    const policy = getPolicy(tool.name);
                    const colorClass = CATEGORY_COLORS[tool.category] ?? 'text-white/40';
                    const borderClass = CATEGORY_LEFT_BORDERS[tool.category] ?? 'border-l-white/10';
                    return (
                        <div
                            key={tool.name}
                            className={`flex items-center gap-3 bg-white/[0.04] border border-white/[0.06] border-l-2 ${borderClass} rounded-r-xl rounded-l-sm px-3 py-2.5 transition-colors hover:bg-white/[0.07]`}
                        >
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-white/5">
                                <Icon className={`w-3.5 h-3.5 ${colorClass}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs text-white/70 font-mono truncate">{tool.name}</div>
                                <div className="text-[10px] text-white/30 truncate">{tool.desc}</div>
                            </div>
                            <div className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-mono border ${
                                policy === 'allow'
                                    ? 'bg-green-500/10 text-green-400/80 border-green-500/20'
                                    : policy === 'deny'
                                    ? 'bg-red-500/10 text-red-400/80 border-red-500/20'
                                    : 'bg-yellow-500/10 text-yellow-400/80 border-yellow-500/20'
                            }`}>
                                {policy === 'allow'
                                    ? <CheckCircle2 className="w-3 h-3" />
                                    : policy === 'deny'
                                    ? <XCircle className="w-3 h-3" />
                                    : <HelpCircle className="w-3 h-3" />
                                }
                                {policy}
                            </div>
                        </div>
                    );
                })}
            </div>
            </>
            )}

            {/* Curator Suggestions */}
            {curatorSuggestions.length > 0 && (
                <div className="shrink-0 border-t border-white/5 bg-black/10 px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Sparkles className="w-3 h-3 text-yellow-400" />
                        <span className="text-[9px] uppercase tracking-widest text-white/30">Curator Suggestions</span>
                        {curatorLastRun && (
                            <span className="ml-auto text-[8px] text-white/20">
                                Last reviewed {Math.round((Date.now() - curatorLastRun) / (24 * 60 * 60 * 1000))}d ago
                            </span>
                        )}
                    </div>
                    {curatorSuggestions.slice(0, 3).map((s, i) => (
                        <div key={i} className="flex items-start gap-2 bg-yellow-500/5 border border-yellow-500/10 rounded-lg px-2 py-1.5">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className={`text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-mono ${
                                        s.type === 'duplicate' ? 'bg-red-500/20 text-red-400' :
                                        s.type === 'merge'     ? 'bg-blue-500/20 text-blue-400' :
                                        'bg-orange-500/20 text-orange-400'
                                    }`}>{s.type}</span>
                                    <span className="text-[9px] text-white/50 font-mono truncate">{(s.skills ?? []).join(', ')}</span>
                                </div>
                                <p className="text-[9px] text-white/40 leading-relaxed">{s.reason}</p>
                            </div>
                            <button onClick={() => dismissCuratorSuggestion(i)} className="shrink-0 text-white/20 hover:text-white/60 transition-colors mt-0.5">
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SkillsModule;
