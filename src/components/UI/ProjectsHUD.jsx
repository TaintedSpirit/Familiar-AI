import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, Plus, ChevronRight, LayoutGrid, Clock, Package, Trash2, Settings, Edit2, Check, X as XIcon } from 'lucide-react';
import { useMemoryStore } from '../../services/memory/MemoryStore';

const ProjectsHUD = ({ onClose }) => {
    const { projects, activeProjectId, createProject, switchProject, deleteProject, updateProject } = useMemoryStore();
    const [isCreating, setIsCreating] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');

    // Edit State
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');

    const handleCreate = (e) => {
        e.preventDefault();
        if (newProjectName.trim()) {
            createProject(newProjectName);
            setNewProjectName('');
            setIsCreating(false);
        }
    };

    const startEditing = (p) => {
        setEditingId(p.id);
        setEditName(p.name);
        setEditDesc(p.description || '');
    };

    const saveEdit = () => {
        if (editingId && editName.trim()) {
            updateProject(editingId, { name: editName, description: editDesc });
            setEditingId(null);
        }
    };

    const handleDelete = (e, id) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this project context? All memories will be lost.')) {
            deleteProject(id);
        }
    };

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
                className="w-full max-w-5xl bg-[#0a0a0a]/95 border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            >
                {/* Header */}
                <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/5">
                    <div>
                        <h2 className="text-3xl font-light text-white tracking-wide">Project Matrix</h2>
                        <p className="text-white/40 text-sm mt-2 font-light">Select or initialize an autonomous context.</p>
                    </div>
                    <button
                        onClick={() => setIsCreating(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 rounded-xl transition-all border border-blue-500/20 shadow-lg shadow-blue-500/10"
                    >
                        <Plus className="w-4 h-4" />
                        <span className="text-sm font-medium">New Context</span>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                    {/* Create New Card (if active) */}
                    <AnimatePresence>
                        {isCreating && (
                            <motion.form
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                onSubmit={handleCreate}
                                className="col-span-1 p-6 rounded-2xl border border-blue-500/50 bg-blue-500/10 flex flex-col gap-4 relative shadow-[0_0_30px_-10px_rgba(59,130,246,0.2)]"
                            >
                                <div className="flex items-center gap-3 text-blue-300 mb-2">
                                    <Folder className="w-5 h-5" />
                                    <span className="text-xs font-bold uppercase tracking-widest">Initialize Sequence</span>
                                </div>
                                <input
                                    type="text"
                                    autoFocus
                                    placeholder="Project Name..."
                                    value={newProjectName}
                                    onChange={(e) => setNewProjectName(e.target.value)}
                                    className="bg-transparent border-b border-blue-500/30 py-2 text-xl text-white outline-none placeholder-blue-500/30 font-light"
                                />
                                <div className="flex justify-end gap-2 mt-auto">
                                    <button
                                        type="button"
                                        onClick={() => setIsCreating(false)}
                                        className="text-xs text-white/40 hover:text-white px-3 py-1"
                                    >Cancel</button>
                                    <button
                                        type="submit"
                                        className="text-xs bg-blue-500 text-white px-3 py-1 rounded-lg font-medium"
                                    >Create</button>
                                </div>
                            </motion.form>
                        )}
                    </AnimatePresence>

                    {/* Project List */}
                    {projects.map(project => {
                        const isActive = project.id === activeProjectId;
                        const isEditing = editingId === project.id;

                        if (isEditing) {
                            return (
                                <motion.div
                                    key={project.id}
                                    layoutId={project.id}
                                    className="relative p-6 rounded-2xl border border-white/20 bg-white/10 flex flex-col gap-4"
                                >
                                    <div className="flex items-center gap-2 text-white/60 mb-1">
                                        <Edit2 className="w-4 h-4" />
                                        <span className="text-xs uppercase tracking-widest">Editing Context</span>
                                    </div>
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-lg text-white outline-none focus:border-white/30"
                                        placeholder="Project Name"
                                    />
                                    <textarea
                                        value={editDesc}
                                        onChange={(e) => setEditDesc(e.target.value)}
                                        className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 outline-none focus:border-white/30 h-24 resize-none"
                                        placeholder="Context Description / Goal..."
                                    />
                                    <div className="flex justify-end gap-2 mt-2">
                                        <button
                                            onClick={() => setEditingId(null)}
                                            className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors"
                                        >
                                            <XIcon className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={saveEdit}
                                            className="p-2 bg-green-500/20 text-green-300 hover:bg-green-500/30 rounded-lg transition-colors border border-green-500/20"
                                        >
                                            <Check className="w-4 h-4" />
                                        </button>
                                    </div>
                                </motion.div>
                            );
                        }

                        return (
                            <motion.div
                                key={project.id}
                                layoutId={project.id}
                                onClick={() => {
                                    switchProject(project.id);
                                    onClose();
                                }}
                                className={`group relative p-6 rounded-2xl border transition-all cursor-pointer flex flex-col gap-4 overflow-hidden
                                    ${isActive
                                        ? 'bg-gradient-to-br from-white/10 to-transparent border-white/20 shadow-[0_0_30px_-10px_rgba(255,255,255,0.15)] ring-1 ring-white/10'
                                        : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10 hover:shadow-lg'
                                    }`}
                            >
                                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); startEditing(project); }}
                                        className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors"
                                        title="Edit Context"
                                    >
                                        <Settings className="w-4 h-4" />
                                    </button>
                                    {projects.length > 1 && (
                                        <button
                                            onClick={(e) => handleDelete(e, project.id)}
                                            className="p-1.5 hover:bg-red-500/20 rounded-lg text-white/40 hover:text-red-400 transition-colors"
                                            title="Delete Context"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                <div className="flex justify-between items-start">
                                    <div className={`p-3 rounded-xl transition-colors ${isActive ? 'bg-white text-black' : 'bg-white/5 text-white/60 group-hover:bg-white/10 group-hover:text-white'}`}>
                                        <LayoutGrid className="w-6 h-6" />
                                    </div>
                                    {isActive && (
                                        <div className="px-2 py-1 bg-green-500/20 text-green-300 text-[10px] font-bold tracking-wider rounded uppercase border border-green-500/20">
                                            Active Link
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <h3 className="text-lg font-medium text-white group-hover:text-blue-200 transition-colors truncate pr-16">{project.name}</h3>
                                    {project.description && (
                                        <p className="text-white/40 text-xs mt-1 line-clamp-2 h-8 leading-relaxed">
                                            {project.description}
                                        </p>
                                    )}
                                    {!project.description && (
                                        <div className="h-8 mt-1" /> // spacer
                                    )}

                                    <div className="flex items-center gap-4 mt-4 text-white/30 text-xs border-t border-white/5 pt-4">
                                        <div className="flex items-center gap-1.5">
                                            <Clock className="w-3 h-3" />
                                            <span>{new Date(project.created).toLocaleDateString()}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Package className="w-3 h-3" />
                                            <span>{project.artifacts.length} Assets</span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </motion.div>
        </motion.div>
    );
};

export default ProjectsHUD;
