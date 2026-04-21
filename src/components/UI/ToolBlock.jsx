import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, CheckCircle, XCircle, Loader2 } from 'lucide-react';

const TOOL_ICONS = {
    web_search: '🔍',
    scrape_url: '🌐',
    read_file: '📄',
    write_file: '✏️',
    list_dir: '📁',
    run_command: '⚡',
    execute_sandboxed: '🐳',
    get_screen_context: '👁',
    get_clipboard: '📋',
    generate_image: '🖼',
    schedule_task: '⏰',
    update_memory: '🧠',
    spawn_agent: '🤖',
};

const statusConfig = {
    working: {
        dot: 'bg-blue-400 animate-pulse',
        label: 'Running',
        icon: <Loader2 className="w-3 h-3 animate-spin text-blue-400" />,
        border: 'border-blue-500/20',
        bg: 'bg-blue-500/5',
    },
    success: {
        dot: 'bg-green-400',
        label: 'Done',
        icon: <CheckCircle className="w-3 h-3 text-green-400" />,
        border: 'border-green-500/20',
        bg: 'bg-green-500/5',
    },
    error: {
        dot: 'bg-red-400',
        label: 'Failed',
        icon: <XCircle className="w-3 h-3 text-red-400" />,
        border: 'border-red-500/20',
        bg: 'bg-red-500/5',
    },
};

const ToolBlock = ({ name, args, result, status = 'working' }) => {
    const [expanded, setExpanded] = useState(false);
    const cfg = statusConfig[status] || statusConfig.working;
    const emoji = TOOL_ICONS[name] || '🔧';

    const hasDetail = args && Object.keys(args).length > 0;
    const hasResult = result != null;
    const canExpand = hasDetail || hasResult;

    const formatJson = (val) => {
        if (val == null) return '';
        if (typeof val === 'string') return val;
        try { return JSON.stringify(val, null, 2); } catch { return String(val); }
    };

    return (
        <div className={`rounded-xl border ${cfg.border} ${cfg.bg} text-xs font-mono overflow-hidden max-w-[85%]`}>
            <div className="flex items-center gap-2 px-3 py-2">
                <span className="text-sm">{emoji}</span>
                <span className="text-white/70 font-medium">{name}</span>
                <div className="flex items-center gap-1 ml-1">
                    {cfg.icon}
                    <span className={`text-[10px] ${status === 'success' ? 'text-green-400' : status === 'error' ? 'text-red-400' : 'text-blue-400'}`}>
                        {cfg.label}
                    </span>
                </div>
                {canExpand && (
                    <button
                        onClick={() => setExpanded(p => !p)}
                        className="ml-auto flex items-center gap-1 text-white/30 hover:text-white/70 transition-colors text-[10px] uppercase tracking-wide"
                    >
                        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        {expanded ? 'Hide' : 'View Output'}
                    </button>
                )}
            </div>

            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        key="detail"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="border-t border-white/5 px-3 py-2 space-y-2">
                            {hasDetail && (
                                <div>
                                    <div className="text-[9px] uppercase tracking-widest text-white/20 mb-1">Args</div>
                                    <pre className="text-white/50 text-[10px] leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
                                        {formatJson(args)}
                                    </pre>
                                </div>
                            )}
                            {hasResult && (
                                <div>
                                    <div className="text-[9px] uppercase tracking-widest text-white/20 mb-1">Result</div>
                                    <pre className="text-white/50 text-[10px] leading-relaxed overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                                        {formatJson(result)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ToolBlock;
