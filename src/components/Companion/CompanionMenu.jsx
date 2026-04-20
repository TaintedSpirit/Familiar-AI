import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Box, HelpCircle, ShieldAlert, Zap, Settings, Activity, X, Eye, EyeOff } from 'lucide-react';

const CompanionMenu = ({ publicState, isOpen, visionEnabled, onAction, onMouseEnter, onMouseLeave }) => {
    if (!publicState) return null;

    const items = [
        {
            id: 'open_iw',
            icon: isOpen ? X : Box, // Toggle Icon
            label: isOpen ? 'Close Inner World' : 'Open Inner World', // Toggle Label
            active: true
        },
        {
            id: 'toggle_awareness',
            icon: visionEnabled ? Eye : EyeOff,
            label: visionEnabled ? 'Disable Awareness' : 'Enable Awareness',
            active: true
        },
        {
            id: 'explain',
            icon: HelpCircle,
            label: 'Explain',
            active: true
        },
        {
            id: 'show_risk',
            icon: ShieldAlert,
            label: 'Show Risk',
            active: publicState.risk !== 'low', // Only if relevant
            color: 'text-orange-400'
        },
        {
            id: 'execute',
            icon: Zap,
            label: 'Execute',
            active: publicState.mode === 'execute' && publicState.simulation === 'complete', // Strict condition
            color: 'text-green-400'
        },
        {
            id: 'settings',
            icon: Settings,
            label: 'Settings',
            active: true
        }
    ].filter(i => i.active);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="absolute bottom-[-60px] flex flex-row gap-2 items-center bg-black/60 backdrop-blur-md p-2 rounded-full border border-white/10 shadow-xl z-50 pointer-events-auto"
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            {items.map(item => (
                <button
                    key={item.id}
                    onClick={(e) => { e.stopPropagation(); onAction(item.id); }}
                    className={`p-2 rounded-full hover:bg-white/10 transition-colors relative group ${item.color || 'text-white/80'}`}
                    title={item.label}
                >
                    <item.icon size={18} strokeWidth={2} />

                    {/* Tooltip */}
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        {item.label}
                    </span>
                </button>
            ))}
        </motion.div>
    );
};

export default CompanionMenu;
