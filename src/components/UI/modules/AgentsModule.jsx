import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Users, ListChecks, UserPlus, Play, StopCircle, 
    Trash2, ExternalLink, ShieldCheck, FileCode, Search, 
    Zap, Clock, CheckCircle2, XCircle, Info
} from 'lucide-react';
import { useAgentTaskStore } from '../../../services/agent/AgentTaskStore';
import { AGENT_REGISTRY } from '../../../services/agent/AgentRegistry';
import { agentSpawner } from '../../../services/agent/AgentSpawner';

const AgentsModule = ({ activeTab = 'registry' }) => {
    const [currentTab, setCurrentTab] = useState(activeTab);
    const { tasks, clearCompleted, removeTask } = useAgentTaskStore();
    const [selectedAgent, setSelectedAgent] = useState(null);
    const [selectedTask, setSelectedTask] = useState(null);

    const activeTasks = tasks.filter(t => t.status === 'running');
    const completedTasks = tasks.filter(t => t.status !== 'running');

    const getAgentIcon = (id) => {
        switch (id) {
            case 'researcher': return Search;
            case 'builder': return FileCode;
            case 'auditor': return ShieldCheck;
            default: return Users;
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0a0a0b]/80 backdrop-blur-xl border-l border-white/5">
            {/* Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-blue-500/5 to-purple-500/5">
                <div>
                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                        The Pack
                    </h2>
                    <p className="text-xs text-white/40 mt-1">Specialized Sub-Agent Orchestration</p>
                </div>
                <div className="flex gap-1 p-1 bg-white/5 rounded-lg border border-white/5">
                    <button 
                        onClick={() => setCurrentTab('registry')}
                        className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${currentTab === 'registry' ? 'bg-white/10 text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                    >
                        Registry
                    </button>
                    <button 
                        onClick={() => setCurrentTab('tasks')}
                        className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all relative ${currentTab === 'tasks' ? 'bg-white/10 text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                    >
                        Tasks
                        {activeTasks.length > 0 && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                        )}
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <AnimatePresence mode="wait">
                    {currentTab === 'registry' ? (
                        <motion.div 
                            key="registry"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-4"
                        >
                            {Object.values(AGENT_REGISTRY).map((agent) => {
                                const Icon = getAgentIcon(agent.id);
                                return (
                                    <div 
                                        key={agent.id}
                                        className="group relative p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 hover:bg-white/[0.07] transition-all cursor-pointer"
                                        onClick={() => setSelectedAgent(agent)}
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform">
                                                <Icon className="w-5 h-5 text-blue-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <h3 className="text-sm font-bold text-white/90">{agent.name}</h3>
                                                    <span className="text-[10px] font-mono text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full border border-blue-400/20 uppercase tracking-tighter">
                                                        {agent.archetype}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-white/40 mt-1 leading-relaxed">
                                                    {agent.description}
                                                </p>
                                                <div className="flex flex-wrap gap-2 mt-3">
                                                    {agent.allowedTools.map(tool => (
                                                        <span key={tool} className="text-[9px] font-mono text-white/30 bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                                                            {tool}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Info Box */}
                            <div className="mt-8 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
                                <div className="flex gap-3">
                                    <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-blue-200/60 leading-relaxed">
                                        The Familiar can summon these specialists using the <code className="text-blue-400">spawn_agent</code> tool. You can also manually trigger them by dragging a thread onto their profile.
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div 
                            key="tasks"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-6"
                        >
                            {/* Running Section */}
                            <div>
                                <div className="flex items-center justify-between mb-3 px-2">
                                    <h3 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Active Operations</h3>
                                    <span className="text-[10px] text-blue-400/60 font-mono">{activeTasks.length} running</span>
                                </div>
                                <div className="space-y-3">
                                    {activeTasks.length === 0 ? (
                                        <div className="p-8 text-center rounded-2xl border border-dashed border-white/5">
                                            <Zap className="w-5 h-5 text-white/10 mx-auto mb-2" />
                                            <p className="text-xs text-white/20">No active sub-agents at the moment.</p>
                                        </div>
                                    ) : (
                                        activeTasks.map(task => (
                                            <TaskCard key={task.id} task={task} onKill={() => agentSpawner.kill(task.id)} />
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Completed Section */}
                            {completedTasks.length > 0 && (
                                <div>
                                    <div className="flex items-center justify-between mb-3 px-2 border-t border-white/5 pt-6">
                                        <h3 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Recent History</h3>
                                        <button 
                                            onClick={clearCompleted}
                                            className="text-[9px] text-white/20 hover:text-red-400 transition-colors flex items-center gap-1"
                                        >
                                            <Trash2 className="w-3 h-3" /> Clear
                                        </button>
                                    </div>
                                    <div className="space-y-2 opacity-60 hover:opacity-100 transition-opacity">
                                        {completedTasks.map(task => (
                                            <HistoryRow 
                                                key={task.id} 
                                                task={task} 
                                                onRemove={() => removeTask(task.id)} 
                                                onClick={() => setSelectedTask(task)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Task Detail Modal */}
            <AnimatePresence>
                {selectedTask && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-50 bg-[#0a0a0b] flex flex-col"
                    >
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-blue-500/10 to-transparent">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/20">
                                    <ListChecks className="w-5 h-5 text-blue-400" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white/90">Task Findings</h3>
                                    <p className="text-[10px] text-white/40 mt-0.5">#{selectedTask.id.slice(-6)} • {selectedTask.agentId || 'general'}</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setSelectedTask(null)}
                                className="p-2 rounded-full hover:bg-white/5 text-white/40 hover:text-white transition-all"
                            >
                                <StopCircle className="w-5 h-5 rotate-45" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <div className="mb-6">
                                <h4 className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-2">Original Task</h4>
                                <p className="text-xs text-white/60 leading-relaxed bg-white/5 p-4 rounded-xl border border-white/5 italic">
                                    "{selectedTask.label || selectedTask.task}"
                                </p>
                            </div>

                            <div>
                                <h4 className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-2">Results & Data</h4>
                                <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-sm text-white/80 leading-relaxed whitespace-pre-wrap font-sans selection:bg-blue-500/30">
                                    {selectedTask.result?.content || selectedTask.result || "No findings recorded."}
                                </div>
                            </div>

                            <div className="mt-8 flex gap-3">
                                <button 
                                    onClick={() => {
                                        navigator.clipboard.writeText(selectedTask.result?.content || selectedTask.result || "");
                                    }}
                                    className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-[11px] font-bold text-white/60 hover:text-white transition-all flex items-center justify-center gap-2"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" /> Copy Findings
                                </button>
                                <button 
                                    onClick={() => setSelectedTask(null)}
                                    className="flex-1 py-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-[11px] font-bold text-blue-400 transition-all"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const TaskCard = ({ task, onKill }) => {
    const profile = task.agentId ? AGENT_REGISTRY[task.agentId] : null;
    const [elapsed, setElapsed] = useState(0);

    React.useEffect(() => {
        const timer = setInterval(() => {
            setElapsed(Math.round((Date.now() - task.startedAt) / 1000));
        }, 1000);
        return () => clearInterval(timer);
    }, [task.startedAt]);

    return (
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 relative overflow-hidden group">
            {/* Progress Bar Shimmer */}
            <div className="absolute bottom-0 left-0 h-0.5 bg-blue-500/30 w-full overflow-hidden">
                <motion.div 
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="w-1/2 h-full bg-gradient-to-r from-transparent via-blue-400 to-transparent"
                />
            </div>

            <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                            {profile ? profile.name : 'Sub-Agent'}
                        </span>
                        <span className="text-[10px] text-white/20 font-mono">#{task.id.slice(-4)}</span>
                    </div>
                    <h4 className="text-xs font-bold text-white/80 line-clamp-1">{task.label || task.task}</h4>
                    <p className="text-[10px] text-white/40 mt-1 font-mono italic">
                        Running for {elapsed}s...
                    </p>
                </div>
                <button 
                    onClick={onKill}
                    className="p-2 rounded-lg bg-red-500/10 text-red-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/20"
                >
                    <StopCircle className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

const HistoryRow = ({ task, onRemove, onClick }) => {
    const isSuccess = task.status === 'completed';
    const isKilled = task.status === 'killed';
    
    return (
        <div 
            className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5 group hover:bg-white/10 transition-all cursor-pointer"
            onClick={onClick}
        >
            <div className={`w-1 h-8 rounded-full ${isSuccess ? 'bg-green-500/40' : isKilled ? 'bg-yellow-500/40' : 'bg-red-500/40'}`} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    {isSuccess ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
                    <span className="text-xs font-bold text-white/60 line-clamp-1">{task.label || task.task}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-white/20 font-mono">
                        {task.agentId || 'general'}
                    </span>
                    <span className="text-[9px] text-white/20">•</span>
                    <span className="text-[9px] text-white/20 font-mono">
                        {task.elapsed}s
                    </span>
                </div>
            </div>
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
                className="p-1.5 rounded-md text-white/10 opacity-0 group-hover:opacity-100 hover:text-white/40 transition-all"
            >
                <Trash2 className="w-3.5 h-3.5" />
            </button>
        </div>
    );
};

export default AgentsModule;
