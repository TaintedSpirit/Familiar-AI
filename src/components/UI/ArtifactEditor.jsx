import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Save, FileCode, Check } from 'lucide-react';

const ArtifactEditor = ({ artifact, onClose, onSave }) => {
    const [viewMode, setViewMode] = useState('edit'); // 'edit' | 'diff'
    const [diffResult, setDiffResult] = useState([]);

    // Fix: Add missing state
    const [content, setContent] = useState(artifact?.content || '');
    const [isSaving, setIsSaving] = useState(false);

    // Dynamically import diff to avoid SSR/build issues if any, though standard import works generally
    const [diffLib, setDiffLib] = useState(null);

    useEffect(() => {
        import('diff').then(lib => setDiffLib(lib));
    }, []);

    useEffect(() => {
        setContent(artifact.content || '');
    }, [artifact]);

    useEffect(() => {
        if (viewMode === 'diff' && diffLib) {
            const original = artifact.content || '';
            const current = content;
            const diff = diffLib.diffLines(original, current);
            setDiffResult(diff);
        }
    }, [viewMode, content, artifact.content]);

    const handleSave = () => {
        setIsSaving(true);
        // Simulate net delay or just immediate save
        setTimeout(() => {
            onSave(artifact.id, content);
            setIsSaving(false);
            onClose();
        }, 500);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-5xl h-[85vh] bg-[#0c0c0c] border border-white/10 rounded-2xl flex flex-col shadow-2xl overflow-hidden"
            >
                {/* Header */}
                <div className="h-16 border-b border-white/5 bg-[#111] flex items-center justify-between px-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                            <FileCode className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-white font-medium text-lg">{artifact.name || 'Untitled Artifact'}</h2>
                            <p className="text-white/40 text-xs font-mono">{artifact.type || 'text/plain'} • {new Date(artifact.id).toLocaleDateString()}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* View Toggle */}
                        <div className="flex bg-white/5 rounded-lg p-1 mr-2 border border-white/5">
                            <button
                                onClick={() => setViewMode('edit')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'edit' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
                            >
                                Edit
                            </button>
                            <button
                                onClick={() => setViewMode('diff')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'diff' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
                            >
                                Diff
                            </button>
                        </div>

                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            {isSaving ? <Check className="w-4 h-4 animate-pulse" /> : <Save className="w-4 h-4" />}
                            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Editor Area */}
                <div className="flex-1 relative overflow-auto custom-scrollbar bg-[#0c0c0c]">
                    {viewMode === 'edit' ? (
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            spellCheck={false}
                            className="w-full h-full bg-[#0c0c0c] text-blue-100 font-mono text-sm p-6 resize-none focus:outline-none leading-relaxed"
                        />
                    ) : (
                        <div className="p-6 font-mono text-sm leading-relaxed min-h-full">
                            {diffResult.map((part, index) => {
                                const color = part.added ? 'bg-green-500/20 text-green-200 block w-full px-2 -mx-2' :
                                    part.removed ? 'bg-red-500/20 text-red-300 block w-full px-2 -mx-2 opacity-50' :
                                        'text-blue-100/50';
                                return (
                                    <span key={index} className={color}>
                                        {part.value}
                                    </span>
                                );
                            })}
                            {diffResult.length === 0 && <span className="text-white/30 italic">No changes detected from original.</span>}
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

export default ArtifactEditor;
