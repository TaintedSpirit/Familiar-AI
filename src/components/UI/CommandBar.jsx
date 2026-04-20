import React, { useState } from 'react';
import { Settings, Eye, EyeOff, Minimize2, Brain, HelpCircle, Sparkles, Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useContextStore } from '../../services/context/ContextStore';
import { useSettingsStore } from '../../services/settings/SettingsStore';
import { useVisionStore } from '../../services/vision/VisionStore';
import { useSpeechStore } from '../../services/voice/SpeechStore';
import { audioGraph } from '../../services/voice/AudioGraph';
import { ActionMonitor } from '../../services/debug/ActionMonitor';
import { useInnerWorldStore } from '../../services/innerworld/InnerWorldStore';

const CommandBar = ({ onCommand, onMenuAction, currentIntent = 'explain', onInteractionStart, onInteractionEnd }) => {
    const [value, setValue] = useState('');
    const [isHovered, setIsHovered] = useState(false);
    const [isComputing, setIsComputing] = useState(false);
    const hoverTimeoutRef = React.useRef(null);

    const isBlocked = useInnerWorldStore(s => s.publicState?.blocked ?? false);
    const riskLevel = useInnerWorldStore(s => s.publicState?.risk ?? 'low');
    const fallbackActive = useSettingsStore(s => s.fallbackActive);
    const fallbackReason = useSettingsStore(s => s.fallbackReason);

    // Vision
    const isAwarenessEnabled = useVisionStore(s => s.isAwarenessEnabled);
    const toggleAwareness = useVisionStore(s => s.toggleAwareness);
    const visionStatus = useVisionStore(s => s.visionStatus);
    const lastCaptureAt = useVisionStore(s => s.lastCaptureAt);

    const freshnessLabel = React.useMemo(() => {
        if (!isAwarenessEnabled || lastCaptureAt === 0) return null;
        const mins = Math.floor((Date.now() - lastCaptureAt) / 60000);
        if (mins < 1) return 'now';
        if (mins < 60) return `${mins}m`;
        return `${Math.floor(mins / 60)}h`;
    }, [isAwarenessEnabled, lastCaptureAt, visionStatus]);

    const freshnessColor =
        visionStatus === 'live' ? 'bg-green-500' :
        visionStatus === 'stale' ? 'bg-yellow-500' :
        visionStatus === 'visualizing' ? 'bg-blue-400 animate-pulse' :
        'bg-white/20';

    // Speech
    const isListening = useSpeechStore(s => s.isListening);
    const toggleMic = () => {
        if (isListening) audioGraph.stopInput();
        else audioGraph.startInput(); // Uses default or stored device
    };

    // Safety Watchdog: Force clear isComputing if stuck
    React.useEffect(() => {
        if (isComputing) {
            const timer = setTimeout(() => {
                console.warn("[CommandBar] Watchdog: Forcing isComputing reset.");
                setIsComputing(false);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [isComputing]);

    const handleShareContext = async () => {
        const store = useContextStore.getState();
        if (store.sharedContext) {
            store.clearContext();
            return;
        }

        setIsComputing(true);
        try {
            await store.captureContext();
        } catch (e) {
            console.error("Context capture failed", e);
        } finally {
            setIsComputing(false);
        }
    };

    const handleMouseEnter = () => {
        console.log("[CommandBar] Hover Enter");
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setIsHovered(true);
        onInteractionStart && onInteractionStart();
    };

    const handleMouseLeave = () => {
        hoverTimeoutRef.current = setTimeout(() => {
            setIsHovered(false);
            onInteractionEnd && onInteractionEnd();
        }, 300);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (value.trim()) {
            onCommand(value);
            setValue('');
        }
    };

    const menuItems = [
        { label: 'PROJECTS', icon: null },
        { label: 'WORKFLOW', icon: null },
        { label: 'RITUALS', icon: null },
        { label: 'LOGS', icon: null },
        { label: 'CHAT', icon: null },
        { label: 'MIND', icon: null },
        { label: 'MINIMIZE', icon: Minimize2 },
        { label: 'SETTINGS', icon: Settings },
    ];

    let placeholder = "Ask anything";
    if (isComputing) placeholder = "Computing...";
    if (isBlocked) placeholder = `Blocked — ${riskLevel} risk detected`;

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative w-full max-w-xl pointer-events-auto cursor-grab active:cursor-grabbing z-50 group"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {/* Hover Menu */}
                <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{
                        opacity: isHovered ? 1 : 0,
                        y: isHovered ? 0 : 10,
                        scale: isHovered ? 1 : 0.95,
                        pointerEvents: isHovered ? 'auto' : 'none'
                    }}
                    transition={{ duration: 0.2 }}
                    className="absolute bottom-full left-0 right-0 flex justify-center gap-3 pb-6"
                >
                    {menuItems.map((item) => (
                        <button
                            key={item.label}
                            onClick={() => {
                                onMenuAction && onMenuAction(item.label);
                            }}
                            className={`px-4 py-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-full text-[10px] font-medium tracking-wider text-white/70 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2 ${item.label === 'SETTINGS' ? 'aspect-square px-2' : ''}`}
                            title={item.label}
                        >
                            {item.icon ? <item.icon className="w-4 h-4" /> : item.label}
                        </button>
                    ))}
                </motion.div>

                {/* Main Command Bar */}
                <form
                    onSubmit={handleSubmit}
                    className={`glass rounded-full px-6 py-3 flex items-center gap-4 transition-all duration-300 focus-within:ring-2 shadow-2xl bg-black/40 backdrop-blur-xl ${isBlocked ? 'ring-2 ring-red-500/50 border-red-500/30' : 'ring-white/20'}`}
                >
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => !isBlocked && setValue(e.target.value)}
                        placeholder={placeholder}
                        disabled={isBlocked}
                        className={`bg-transparent border-none outline-none flex-1 text-sm font-medium tracking-wide mr-2 ${isBlocked ? 'text-red-400/60 placeholder-red-400/40 cursor-not-allowed' : 'text-white placeholder-white/30'}`}
                        onKeyDown={(e) => e.stopPropagation()}
                    />

                    {/* Divider */}
                    <div className="w-px h-6 bg-white/10 mx-1" />

                    {/* 1. Vision Toggle */}
                    <button
                        type="button"
                        onClick={toggleAwareness}
                        className={`relative rounded-full p-2.5 transition-all duration-300 ${isAwarenessEnabled ? 'bg-green-500/20 text-green-400 shadow-green-500/20' : 'bg-white/5 text-white/20 hover:bg-white/10 hover:text-white/40'}`}
                        title={isAwarenessEnabled ? `Vision: ON — ${visionStatus}${lastCaptureAt ? ` (${freshnessLabel} ago)` : ''}` : 'Vision: OFF'}
                    >
                        {isAwarenessEnabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        {isAwarenessEnabled && (
                            <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-black/60 ${freshnessColor}`} />
                        )}
                        {isAwarenessEnabled && freshnessLabel && (
                            <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-white/40 font-mono whitespace-nowrap">
                                {freshnessLabel}
                            </span>
                        )}
                    </button>

                    {/* 2. Mic Toggle */}
                    <button
                        type="button"
                        onClick={toggleMic}
                        className={`rounded-full p-2.5 transition-all duration-300 ${isListening ? 'bg-red-500/20 text-red-400 shadow-red-500/20 animate-pulse' : 'bg-white/5 text-white/20 hover:bg-white/10 hover:text-white/40'}`}
                        title={isListening ? "Mic: ON" : "Mic: OFF"}
                    >
                        {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                    </button>
                </form>

                {/* Fallback provider indicator */}
                <AnimatePresence>
                    {fallbackActive && (
                        <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded-full text-[9px] text-amber-400 font-mono whitespace-nowrap"
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            {fallbackReason || 'using backup model'}
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </>
    );
};

export default CommandBar;
