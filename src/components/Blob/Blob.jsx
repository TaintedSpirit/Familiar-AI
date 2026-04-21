import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
import BlobRenderer from '../Forms/BlobRenderer';
import OrbRenderer from '../Forms/OrbRenderer';
import GlyphRenderer from '../Forms/GlyphRenderer';
import { useFormStore } from '../../services/forms/FormStore';
import { useSpeechStore } from '../../services/voice/SpeechStore';
import { useSettingsStore } from '../../services/settings/SettingsStore';

const Blob = ({ state = 'idle', provider = 'gemini', idleThought = null, innerWorldState = null, shouldPause = false }) => {
    const [isNear, setIsNear] = useState(false);
    const [isPetting, setIsPetting] = useState(false);
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    const isSpeaking = useSpeechStore(s => s.isSpeaking);
    const audioLevel = useSpeechStore(s => s.audioLevel);

    // Smooth springs for tracking
    const springConfig = { damping: 20, stiffness: 150 };

    // Logic for sensors (same as before)
    useEffect(() => {
        // VISUALS: Track mouse even during drag

        const handleMouseMove = (e) => {
            const x = (e.clientX - window.innerWidth / 2) / 20;
            const y = (e.clientY - window.innerHeight / 2) / 20;
            mouseX.set(x);
            mouseY.set(y);

            const dx = e.clientX - window.innerWidth / 2;
            const dy = e.clientY - window.innerHeight / 2;
            const distance = Math.sqrt(dx * dx + dy * dy);
            setIsNear(distance < 250);
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [mouseX, mouseY]);

    // Derive Effective State from Inner World & Interaction
    let effectiveState = isPetting ? 'petting' : (state !== 'idle' ? state : (isNear ? 'attention' : 'idle'));

    // TTS speaking overrides idle/attention
    if (isSpeaking) effectiveState = 'speaking';

    const isAudioActive = audioLevel > 0.05;

    // Inner World Overrides
    if (innerWorldState) {
        if (innerWorldState.blocked || innerWorldState.risk === 'high') effectiveState = 'frozen';
        else if (innerWorldState.simulation === 'running') effectiveState = 'thinking';
        else if (innerWorldState.risk === 'medium') effectiveState = 'hesitant';
        else if (innerWorldState.focus?.active && effectiveState === 'idle') effectiveState = 'attention';
    }

    // Form Selection
    const currentFormId = useFormStore(state => state.currentFormId);

    // Background Glow - Dynamic based on provider & risk
    // Priority: Risk > Provider
    const getGlowColor = () => {
        if (isAudioActive) return 'bg-purple-500/40 shadow-[0_0_80px_rgba(168,85,247,0.4)]'; // Active Listen
        if (innerWorldState?.risk === 'high') return 'bg-red-500/20 shadow-[0_0_50px_rgba(239,68,68,0.3)]';
        if (innerWorldState?.risk === 'medium') return 'bg-orange-500/20';
        if (innerWorldState?.blocked) return 'bg-gray-500/10 grayscale';

        switch (provider) {
            case 'openai': return 'bg-green-400/10';
            case 'ollama': return 'bg-orange-400/10';
            case 'gemini': default: return 'bg-white/10';
        }
    };

    const soulProfile = useSettingsStore(s => s.soulProfile);

    const getBlobColor = () => {
        if (innerWorldState?.risk === 'high') return '#fecaca'; // Red-200
        if (innerWorldState?.risk === 'medium') return '#fed7aa'; // Orange-200
        if (innerWorldState?.simulation === 'running') return '#e0e7ff'; // Indigo-100 (Thinking)
        if (innerWorldState?.blocked) return '#94a3b8'; // Slate-400
        if (soulProfile?.energyColor && effectiveState === 'idle') return soulProfile.energyColor;
        return 'white';
    };

    const glowVariants = {
        idle: { opacity: 0.3, scale: 1 },
        attention: { opacity: 0.5, scale: 1.1 },
        thinking: { opacity: 0.8, scale: [1, 1.3, 1], transition: { duration: 2, repeat: Infinity } },
        responding: { opacity: 0.6, scale: [1, 1.2, 1], transition: { duration: 1, repeat: Infinity } },
        speaking: { opacity: 0.9, scale: 1.15, transition: { duration: 0.3, repeat: Infinity, ease: "easeInOut" } },
        petting: { opacity: 0.7, scale: 1.2, filter: "blur(25px)" },
        frozen: { opacity: 0.8, scale: 1, filter: "brightness(0.5) contrast(1.2)" }, // Static/Red
        hesitant: { opacity: 0.4, scale: [1, 1.02, 1], transition: { duration: 4, repeat: Infinity } } // Slow
    };

    // Blob Specifics needed by renderer
    const blobVariants = {
        idle: { scale: [1, 1.05, 1], transition: { duration: 6, repeat: Infinity, ease: "easeInOut" } },
        attention: { scale: [1.05, 1.1, 1.05], transition: { duration: 2, repeat: Infinity, ease: "easeInOut" } },
        thinking: { scale: [0.95, 1.05, 0.95], filter: ["blur(10px)", "blur(15px)", "blur(10px)"], transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" } },
        responding: { scale: [1, 1.1, 0.95, 1], transition: { duration: 0.8, repeat: Infinity, ease: "easeInOut" } },
        speaking: { scale: [1, 1.05, 0.98, 1.02, 1], filter: ["blur(0px)", "blur(5px)", "blur(0px)"], transition: { duration: 0.3, repeat: Infinity, ease: "easeInOut" } },
        petting: { scale: [1, 1.15, 0.9, 1.1, 1], rotate: [0, -5, 5, -3, 3, 0], transition: { duration: 0.5, repeat: Infinity, ease: "easeInOut" } },
        frozen: { scale: 1, filter: "grayscale(100%)", transition: { duration: 0.5 } }, // Stopped
        hesitant: { scale: [1, 1.02, 1], transition: { duration: 4, repeat: Infinity } }
    };

    // Dynamic Scale Override for Audio
    // We add a scaling factor to the current variant?
    // Hard to mix Framer Motion variants with dynamic override unless we use `animate` prop directly.
    // Let's use `animate` prop in Renderer.
    // If isAudioActive, we override `animate` to { scale: 1 + audioLevel * 0.5 }.

    const activeAnimate = isAudioActive ? {
        scale: 1 + (audioLevel * 0.4),
        filter: `blur(${audioLevel * 5}px)`,
        transition: { type: 'tween', duration: 0.05 } // Fast reaction
    } : undefined; // Fallback to effectivestate variants

    return (
        <div className="relative w-96 h-96 flex items-center justify-center">
            {/* Idle Thoughts */}
            <AnimatePresence>
                {idleThought && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, x: 60 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-10 right-0 max-w-[150px] text-xs font-light text-white/60 italic leading-relaxed pointer-events-none select-none"
                    >
                        "{idleThought}"
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Background Glow */}
            <motion.div
                className={`absolute w-64 h-64 rounded-full blur-3xl transition-colors duration-1000 ${getGlowColor()}`}
                // VISUALS: Keep glow active
                animate={isAudioActive ? { scale: 1 + audioLevel * 0.3, opacity: 0.4 + audioLevel * 0.4 } : effectiveState}
                variants={isAudioActive ? undefined : glowVariants}
                transition={{ duration: isAudioActive ? 0.05 : 1 }}
            />

            {/* Form Renderer */}
            <div
                className="w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing"
                onMouseDown={() => setIsPetting(true)}
                onMouseUp={() => setIsPetting(false)}
                onMouseLeave={() => setIsPetting(false)}
            >
                {currentFormId === 'seed_blob' && (
                    <BlobRenderer
                        effectiveState={effectiveState}
                        mouseX={mouseX}
                        mouseY={mouseY}
                        blobVariants={blobVariants}
                        overrideAnimate={activeAnimate} // Pass this
                        color={getBlobColor()}
                        shouldPause={shouldPause}
                    />
                )}
                {currentFormId === 'orb_node' && (
                    <OrbRenderer effectiveState={effectiveState} />
                )}
                {currentFormId === 'glyph_symbol' && (
                    <GlyphRenderer effectiveState={effectiveState} />
                )}
                {/* Fallback to Blob if unknown */}
                {!['seed_blob', 'orb_node', 'glyph_symbol'].includes(currentFormId) && (
                    <BlobRenderer
                        effectiveState={effectiveState}
                        mouseX={mouseX}
                        mouseY={mouseY}
                        blobVariants={blobVariants}
                        overrideAnimate={activeAnimate}
                        color={getBlobColor()}
                        shouldPause={shouldPause}
                    />
                )}
            </div>
        </div>
    );
};

export default Blob;
