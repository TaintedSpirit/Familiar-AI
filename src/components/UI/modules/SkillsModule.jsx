import React, { useState } from 'react';
import {
    Eye, Mic, Globe, Clipboard, FileText, FilePen, FolderOpen,
    Terminal, Database, Box, Image, Clock, Cpu, List, Search,
    CalendarOff, Zap, CheckCircle2, XCircle
} from 'lucide-react';
import { useVisionStore } from '../../../services/vision/VisionStore';
import { useSpeechStore } from '../../../services/voice/SpeechStore';
import { useActivityStore } from '../../../services/agent/ActivityStore';
import { useSettingsStore } from '../../../services/settings/SettingsStore';

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

const SkillsModule = ({ activeTab }) => {
    const { isAwarenessEnabled, visionStatus } = useVisionStore();
    const { voiceMode, isSpeaking, isListening } = useSpeechStore();
    const { activities } = useActivityStore();
    const { mcpServers, toolPolicies } = useSettingsStore();

    const [activeCategory, setActiveCategory] = useState('All');

    const recentToolNames = [...new Set(activities.map(a => a.name))].slice(0, 5);
    const mcpCount = Object.keys(mcpServers).length;

    const filteredTools = activeCategory === 'All'
        ? BUILT_IN_TOOLS
        : BUILT_IN_TOOLS.filter(t => t.category === activeCategory);

    const getPolicy = (name) => toolPolicies[name] ?? 'allow';

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Capability summary strip */}
            <div className="shrink-0 border-b border-white/5 bg-black/10 px-4 py-3 grid grid-cols-3 gap-3">
                {/* Vision */}
                <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                        isAwarenessEnabled ? 'bg-purple-500/20' : 'bg-white/5'
                    }`}>
                        <Eye className={`w-3.5 h-3.5 ${isAwarenessEnabled ? 'text-purple-400' : 'text-white/20'}`} />
                    </div>
                    <div>
                        <div className="text-[10px] text-white/50">Vision</div>
                        <div className={`text-[9px] capitalize ${
                            visionStatus === 'live' ? 'text-green-400' : 'text-white/25'
                        }`}>{visionStatus}</div>
                    </div>
                </div>

                {/* Voice */}
                <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                        isListening || isSpeaking ? 'bg-blue-500/20' : 'bg-white/5'
                    }`}>
                        <Mic className={`w-3.5 h-3.5 ${isListening ? 'text-red-400' : isSpeaking ? 'text-blue-400' : 'text-white/20'}`} />
                    </div>
                    <div>
                        <div className="text-[10px] text-white/50">Voice</div>
                        <div className="text-[9px] text-white/25 capitalize">
                            {voiceMode === 'push-to-talk' ? 'PTT' : 'Always on'}
                        </div>
                    </div>
                </div>

                {/* MCP */}
                <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                        mcpCount > 0 ? 'bg-green-500/20' : 'bg-white/5'
                    }`}>
                        <Zap className={`w-3.5 h-3.5 ${mcpCount > 0 ? 'text-green-400' : 'text-white/20'}`} />
                    </div>
                    <div>
                        <div className="text-[10px] text-white/50">MCP</div>
                        <div className="text-[9px] text-white/25">{mcpCount} server{mcpCount !== 1 ? 's' : ''}</div>
                    </div>
                </div>
            </div>

            {/* Category filter pills */}
            <div className="shrink-0 flex gap-1.5 px-4 py-2 border-b border-white/5 overflow-x-auto">
                {['All', ...CATEGORIES].map(cat => (
                    <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider border transition-colors ${
                            activeCategory === cat
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                : 'bg-white/5 text-white/30 border-white/5 hover:text-white/60'
                        }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Tool cards */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {/* Recent tools highlight */}
                {activeCategory === 'All' && recentToolNames.length > 0 && (
                    <div className="mb-3">
                        <div className="text-[9px] uppercase tracking-widest text-white/25 mb-1.5">Recently Used</div>
                        <div className="flex flex-wrap gap-1.5">
                            {recentToolNames.map(name => (
                                <span key={name} className="px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[10px] font-mono">
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
                    return (
                        <div key={tool.name} className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-xl px-3 py-2">
                            <Icon className={`w-4 h-4 shrink-0 ${colorClass}`} />
                            <div className="flex-1 min-w-0">
                                <div className="text-xs text-white/70 font-mono truncate">{tool.name}</div>
                                <div className="text-[10px] text-white/30 truncate">{tool.desc}</div>
                            </div>
                            <div className={`shrink-0 flex items-center gap-1 text-[9px] font-mono ${
                                policy === 'allow' ? 'text-green-400/70' :
                                policy === 'deny'  ? 'text-red-400/70'   :
                                'text-yellow-400/70'
                            }`}>
                                {policy === 'allow' ? <CheckCircle2 className="w-3 h-3" /> :
                                 policy === 'deny'  ? <XCircle className="w-3 h-3" />      :
                                 <span className="w-3 h-3 flex items-center justify-center text-[8px]">?</span>
                                }
                                {policy}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default SkillsModule;
