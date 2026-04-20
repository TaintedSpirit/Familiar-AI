import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Cpu, Check, X, AlertTriangle, FileCode, Activity } from 'lucide-react';

const ProposalHUD = ({ proposal, onApprove, onDismiss }) => {
    const [isEditing, setIsEditing] = React.useState(false);
    const [editedContent, setEditedContent] = React.useState(proposal.content || "");

    // Safety fallback for arrays
    const scopeList = Array.isArray(proposal.scope) ? proposal.scope : [proposal.scope || "General"];

    const getRiskColor = (risk) => {
        if (!risk) return "bg-gray-500/20 text-gray-400";
        switch (risk.toLowerCase()) {
            case 'high': return "bg-red-500/20 text-red-500 border-red-500/30";
            case 'medium': return "bg-yellow-500/20 text-yellow-500 border-yellow-500/30";
            case 'low': return "bg-green-500/20 text-green-500 border-green-500/30";
            default: return "bg-blue-500/20 text-blue-400 border-blue-500/30";
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="feature-modal relative z-50 flex flex-col items-center justify-center p-4 pointer-events-auto"
        >
            {/* Main Card */}
            <div className="w-[600px] bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">

                {/* Header */}
                <div className="flex-none p-5 border-b border-white/5 bg-white/5 flex items-start justify-between">
                    <div className="flex items-start gap-4">
                        <div className={`p-2 rounded-lg border ${getRiskColor(proposal.risk)}`}>
                            {proposal.risk === 'high' ? <AlertTriangle className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
                        </div>
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h3 className="text-white font-semibold text-base tracking-wide uppercase">{proposal.title}</h3>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getRiskColor(proposal.risk)}`}>
                                    {proposal.risk?.toUpperCase() || 'INFO'} RISK
                                </span>
                            </div>
                            <p className="text-white/60 text-sm leading-snug max-w-sm">{proposal.outcome}</p>
                        </div>
                    </div>
                </div>

                {/* Scope & Context */}
                <div className="flex-none px-5 py-3 border-b border-white/5 bg-[#080808] flex items-center gap-3 overflow-x-auto custom-scrollbar">
                    <span className="text-[10px] text-white/30 font-medium uppercase tracking-wider">Scope:</span>
                    {scopeList.map((s, i) => (
                        <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded text-[11px] text-blue-300 font-mono border border-white/5">
                            <FileCode className="w-3 h-3 opacity-50" />
                            {s}
                        </div>
                    ))}
                </div>

                {/* Content - Diff View OR Plan Steps */}
                <div className="flex-1 overflow-y-auto min-h-[300px] bg-[#050505] custom-scrollbar relative group p-4">
                    {proposal.type === 'strategic_plan' ? (
                        <div className="flex flex-col gap-3">
                            {(() => {
                                try {
                                    const steps = JSON.parse(editedContent);
                                    return steps.map((step, i) => (
                                        <div key={i} className="flex gap-4 p-3 bg-white/5 rounded-lg border border-white/5">
                                            <div className="flex-none flex flex-col items-center gap-1 pt-1">
                                                <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold border border-blue-500/30">
                                                    {step.id}
                                                </div>
                                                {i < steps.length - 1 && <div className="w-px h-full bg-white/5 my-1" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-white/80 text-xs font-medium tracking-wide">Step {step.id}</span>
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${getRiskColor(step.risk)} opacity-70`}>
                                                        {step.risk?.toUpperCase()}
                                                    </span>
                                                </div>
                                                <p className="text-white/60 text-xs leading-relaxed">{step.description}</p>
                                            </div>
                                        </div>
                                    ));
                                } catch (e) { return <div className="text-red-500 text-xs">Error parsing plan data.</div> }
                            })()}
                        </div>
                    ) : (
                        // Standard Diff View
                        <>
                            <div className="absolute top-2 right-2 flex gap-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => setIsEditing(!isEditing)}
                                    className="px-2 py-1 text-[10px] font-medium text-white/40 hover:text-white bg-black/50 hover:bg-white/10 rounded backdrop-blur-md transition-colors"
                                >
                                    {isEditing ? 'VIEW DIFF' : 'EDIT SOURCE'}
                                </button>
                            </div>
                            {isEditing ? (
                                <textarea
                                    value={editedContent}
                                    onChange={(e) => setEditedContent(e.target.value)}
                                    className="w-full h-full min-h-[300px] bg-transparent text-blue-300/90 font-mono text-xs p-0 focus:outline-none resize-none leading-relaxed"
                                    spellCheck={false}
                                />
                            ) : (
                                <pre className="w-full min-h-[300px] text-white/70 font-mono text-xs whitespace-pre-wrap leading-relaxed">
                                    {editedContent}
                                </pre>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex-none p-4 border-t border-white/5 bg-white/5 grid grid-cols-2 gap-4">
                    <button
                        onClick={onDismiss}
                        className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white font-medium text-xs transition-colors"
                    >
                        <X className="w-4 h-4" />
                        {proposal.type === 'strategic_plan' ? 'CLOSE PLAN' : 'CANCEL'}
                    </button>
                    {proposal.type !== 'strategic_plan' && (
                        <button
                            onClick={() => onApprove({ ...proposal, content: editedContent })}
                            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-blue-900/20 transition-all transform active:scale-[0.98]"
                        >
                            <Check className="w-4 h-4" />
                            {proposal.action ? proposal.action.toUpperCase() : "APPLY CHANGES"}
                        </button>
                    )}
                </div>

            </div>
        </motion.div>
    );
};

export default ProposalHUD;
