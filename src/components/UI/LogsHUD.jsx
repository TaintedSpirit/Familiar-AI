import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Calendar, Code, Clock, Search, X } from 'lucide-react';
import { useMemoryStore } from '../../services/memory/MemoryStore';

const LogsHUD = ({ onClose, onOpenArtifact }) => {
    const activeProject = useMemoryStore(state => state.projects.find(p => p.id === state.activeProjectId));
    const [activeTab, setActiveTab] = useState('artifacts'); // 'artifacts' | 'memories' | 'decisions'
    const [search, setSearch] = useState('');

    const artifacts = activeProject?.artifacts || [];
    const memories = activeProject?.memory || [];
    const decisions = activeProject?.keyDecisions || [];

    const filteredArtifacts = artifacts.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-8"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="w-full max-w-4xl bg-[#0a0a0a]/95 border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[700px] max-h-[85vh]"
            >
                {/* Header */}
                <div className="p-6 border-b border-white/5 bg-white/5 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-light text-white tracking-wide">Project Logs</h2>
                        <p className="text-white/40 text-sm mt-1">{activeProject?.name || 'Unknown Context'}</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search logs..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="bg-black/20 border border-white/10 rounded-full pl-9 pr-4 py-1.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors w-64"
                            />
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/5 px-6 gap-6">
                    {['artifacts', 'memories', 'decisions'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`py-4 text-sm font-medium tracking-wide uppercase transition-colors relative ${activeTab === tab ? 'text-blue-300' : 'text-white/40 hover:text-white/60'}`}
                        >
                            {tab}
                            {activeTab === tab && (
                                <motion.div layoutId="activeLogTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.5)]" />
                            )}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-black/20 custom-scrollbar">

                    {activeTab === 'artifacts' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {filteredArtifacts.length === 0 && (
                                <div className="col-span-full text-center text-white/20 italic py-12">No artifacts found. Ask the agent to draft some code.</div>
                            )}
                            {filteredArtifacts.map(item => (
                                <motion.div
                                    key={item.id}
                                    onClick={() => {
                                        onOpenArtifact(item);
                                        onClose();
                                    }}
                                    className="p-4 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded-xl cursor-pointer transition-all group"
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="p-2 bg-blue-500/20 text-blue-300 rounded-lg">
                                            <Code size={16} />
                                        </div>
                                        <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-white/30 font-mono">
                                            {item.type || 'code'}
                                        </span>
                                    </div>
                                    <h4 className="text-white font-medium mb-1 group-hover:text-blue-200 transition-colors">{item.name}</h4>
                                    <div className="flex items-center gap-2 text-white/30 text-xs">
                                        <span>{new Date(item.id).toLocaleDateString()}</span>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'memories' && (
                        <div className="space-y-4">
                            {memories.length === 0 && <div className="text-center text-white/20 italic py-12">No raw memories ingested.</div>}
                            {memories.map(item => (
                                <div key={item.id} className="p-4 bg-white/5 border border-white/5 rounded-xl flex gap-4">
                                    <div className="mt-1">
                                        <FileText size={16} className="text-emerald-400/60" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-white/80 text-sm leading-relaxed">{item.text}</p>
                                        <span className="text-white/20 text-xs mt-2 block">{new Date(item.timestamp).toLocaleString()}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'decisions' && (
                        <div className="space-y-2">
                            {decisions.length === 0 && <div className="text-center text-white/20 italic py-12">No key decisions logged yet.</div>}
                            {decisions.map(item => (
                                <div key={item.id} className="p-3 bg-purple-500/5 border border-purple-500/10 rounded-lg flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
                                    <span className="text-white/90 text-sm">{item.text}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

export default LogsHUD;
