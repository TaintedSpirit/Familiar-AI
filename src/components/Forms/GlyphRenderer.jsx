import React from 'react';
import { motion } from 'framer-motion';

const GlyphRenderer = ({ effectiveState }) => {
    // Glyph: Abstract symbol, highly responsive.

    // Simple Diamond Shape constructed from path
    const path = "M100 20 L180 100 L100 180 L20 100 Z";

    return (
        <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">
            {/* Background Glitch Effect */}
            <motion.path
                d={path}
                fill="none"
                stroke="white"
                strokeWidth="1"
                className="opacity-10"
                animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.2, 0.1] }}
                transition={{ duration: 0.1, repeat: Infinity }}
            />

            {/* Main Glyph */}
            <motion.path
                d={path}
                fill="none"
                stroke="white"
                strokeWidth="3"
                className="opacity-80"
                animate={effectiveState}
                variants={{
                    idle: { scale: 1, rotate: 0 },
                    thinking: { rotate: 360, transition: { duration: 1, repeat: Infinity, ease: "linear" } },
                    speaking: {
                        strokeWidth: [3, 6, 3],
                        scale: [1, 1.05, 1]
                    }
                }}
                style={{ originX: '100px', originY: '100px' }}
            />

            {/* Center Eye / Core */}
            <motion.rect
                x="90" y="90" width="20" height="20"
                fill="white"
                animate={{
                    rotate: effectiveState === 'thinking' ? -45 : 45,
                    scale: effectiveState === 'speaking' ? [1, 1.5, 1] : 1
                }}
                style={{ originX: '10px', originY: '10px' }} // Relative to rect
            />
        </svg>
    );
};

export default GlyphRenderer;
