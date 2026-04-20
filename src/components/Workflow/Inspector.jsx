import React from 'react';
import { X, Play, Save, Trash2, Copy } from 'lucide-react';

const Inspector = ({ node, onChange, onDelete, onDuplicate, onClose }) => {
    if (!node) return (
        <div className="w-80 h-full border-l border-white/10 bg-[#0f0f12] p-6 flex flex-col items-center justify-center text-white/20">
            <p className="text-sm">Select a node to configure</p>
        </div>
    );

    const handleChange = (field, value) => {
        onChange(node.id, { ...node.data, [field]: value });
    };

    return (
        <div className="w-80 h-full border-l border-white/10 bg-[#0f0f12] flex flex-col">
            {/* Header */}
            <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-white/5">
                <span className="font-mono text-xs uppercase tracking-widest text-blue-400">{node.type} Node</span>
                <button onClick={onClose} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            {/* Properties */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div className="space-y-2">
                    <label className="text-xs text-white/40 uppercase tracking-wider">Label</label>
                    <input
                        type="text"
                        value={node.data.label || ''}
                        onChange={(e) => handleChange('label', e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                    />
                </div>

                {/* Dynamic Fields based on Type */}
                {node.type === 'httpRequest' && (
                    <>
                        <div className="space-y-2">
                            <label className="text-xs text-white/40 uppercase tracking-wider">URL</label>
                            <input
                                type="text"
                                value={node.data.url || 'https://'}
                                onChange={(e) => handleChange('url', e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white font-mono focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs text-white/40 uppercase tracking-wider">Method</label>
                            <select
                                value={node.data.method || 'GET'}
                                onChange={(e) => handleChange('method', e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                            >
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                                <option value="PUT">PUT</option>
                                <option value="DELETE">DELETE</option>
                            </select>
                        </div>
                    </>
                )}

                {node.type === 'javascript' && (
                    <div className="space-y-2">
                        <label className="text-xs text-white/40 uppercase tracking-wider">Code (JS)</label>
                        <textarea
                            value={node.data.code || '// return { result: input.val * 2 };'}
                            onChange={(e) => handleChange('code', e.target.value)}
                            className="w-full h-64 bg-black/40 border border-white/10 rounded px-3 py-2 text-xs text-green-400 font-mono focus:border-blue-500 outline-none resize-none"
                        />
                    </div>
                )}

                {node.type === 'llmCall' && (
                    <div className="space-y-2">
                        <label className="text-xs text-white/40 uppercase tracking-wider">System Prompt (Context)</label>
                        <textarea
                            value={node.data.context || ''}
                            onChange={(e) => handleChange('context', e.target.value)}
                            className="w-full h-32 bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none resize-none"
                        />
                    </div>
                )}

                {(node.type === 'scheduler' || node.type === 'wait') && (
                    <div className="space-y-2">
                        <label className="text-xs text-white/40 uppercase tracking-wider">Wait Duration (Seconds)</label>
                        <input
                            type="number"
                            min="1"
                            value={(node.data.duration || 5000) / 1000}
                            onChange={(e) => handleChange('duration', Math.max(0, parseInt(e.target.value || 0) * 1000))}
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white font-mono focus:border-blue-500 outline-none"
                        />
                        <p className="text-[10px] text-white/30">Node will pause execution for this time.</p>
                    </div>
                )}

            </div>

            {/* Actions */}
            <div className="p-4 border-t border-white/10 flex gap-2">
                <button
                    onClick={() => onDuplicate(node)}
                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded border border-white/5 text-white/60 text-xs flex items-center justify-center gap-2"
                >
                    <Copy className="w-3 h-3" /> Duplicate
                </button>
                <button
                    onClick={() => onDelete(node.id)}
                    className="flex-1 py-2 bg-red-500/10 hover:bg-red-500/20 rounded border border-red-500/20 text-red-400 text-xs flex items-center justify-center gap-2"
                >
                    <Trash2 className="w-3 h-3" /> Delete
                </button>
            </div>
        </div>
    );
};

export default Inspector;
