import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useActivityStore } from '../../services/agent/ActivityStore';

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

const Pill = ({ id, name, status }) => {
    const emoji = TOOL_ICONS[name] || '🔧';

    const pillStyles = {
        working: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
        success: 'border-green-500/30 bg-green-500/10 text-green-300',
        error: 'border-red-500/30 bg-red-500/10 text-red-300',
    };

    const statusMark = {
        working: null,
        success: '✓',
        error: '✗',
    };

    return (
        <motion.div
            layout
            key={id}
            initial={{ opacity: 0, scale: 0.8, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -4 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono whitespace-nowrap ${pillStyles[status] || pillStyles.working}`}
        >
            <span>{emoji}</span>
            <span className="font-medium">{name}</span>
            {status === 'working' ? (
                <span className="inline-block w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
            ) : (
                <span>{statusMark[status]}</span>
            )}
        </motion.div>
    );
};

const CompactingPill = () => (
    <motion.div
        layout
        initial={{ opacity: 0, scale: 0.8, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: -4 }}
        transition={{ duration: 0.2 }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-[10px] font-mono whitespace-nowrap"
    >
        <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
            className="inline-block"
        >
            ↻
        </motion.span>
        <span>Memory Compressing...</span>
    </motion.div>
);

const ActivityTicker = () => {
    const activities = useActivityStore(s => s.activities);
    const isCompacting = useActivityStore(s => s.isCompacting);

    // Auto-clear completed activities after 4s
    const timerRef = useRef({});
    useEffect(() => {
        activities.forEach(a => {
            if ((a.status === 'success' || a.status === 'error') && !timerRef.current[a.id]) {
                timerRef.current[a.id] = setTimeout(() => {
                    useActivityStore.getState().resolveToolCall(a.id, a.result, a.status === 'error');
                    delete timerRef.current[a.id];
                }, 4000);
            }
        });
    }, [activities]);

    const visible = activities.filter(a => a.status !== undefined);
    const hasContent = visible.length > 0 || isCompacting;

    if (!hasContent) return null;

    return (
        <div className="flex items-center gap-2 overflow-x-auto max-w-full py-1.5 px-4 no-scrollbar"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
                <AnimatePresence mode="popLayout">
                    {visible.map(a => (
                        <Pill key={a.id} id={a.id} name={a.name} status={a.status} />
                    ))}
                    {isCompacting && <CompactingPill key="compacting" />}
                </AnimatePresence>
            </div>
    );
};

export default ActivityTicker;
