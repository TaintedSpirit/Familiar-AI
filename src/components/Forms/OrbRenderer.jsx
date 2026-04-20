import React from 'react';
import { motion } from 'framer-motion';

const OrbRenderer = ({ effectiveState }) => {
    // Orb: A more structured, stable energy sphere.
    // Less gooey, more geometric rotation.

    const coreVariants = {
        idle: { scale: 1, rotate: 0 },
        thinking: { scale: 0.9, rotate: 180 },
        responding: { scale: 1.1, rotate: 0 },
        speaking: { scale: [1, 1.05, 1], transition: { duration: 0.2, repeat: Infinity } }
    };

    const ringVariants = {
        idle: { rotate: 360, transition: { duration: 20, repeat: Infinity, ease: "linear" } },
        thinking: { rotate: -360, scale: 1.2, transition: { duration: 2, repeat: Infinity, ease: "linear" } },
        responding: { rotate: 360, scale: 0.9, transition: { duration: 5, repeat: Infinity, ease: "linear" } },
        speaking: { opacity: [0.5, 1, 0.5], transition: { duration: 0.5, repeat: Infinity } }
    };

    return (
        <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-2xl">
            {/* Outer Ring */}
            <motion.circle
                cx="100"
                cy="100"
                r="70"
                fill="none"
                stroke="white"
                strokeWidth="1"
                className="opacity-20"
                animate={effectiveState}
                variants={ringVariants}
                style={{ originX: '100px', originY: '100px' }}
            />

            {/* Inner Ring (Dashed) */}
            <motion.circle
                cx="100"
                cy="100"
                r="55"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeDasharray="10 20"
                className="opacity-40"
                animate={{ rotate: -360 }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                style={{ originX: '100px', originY: '100px' }}
            />

            {/* Core */}
            <motion.circle
                cx="100"
                cy="100"
                r="40"
                fill="white"
                className="opacity-10 backdrop-blur-xl"
                animate={effectiveState}
                variants={coreVariants}
            />

            {/* Core Higehog / Detail */}
            <motion.circle
                cx="100"
                cy="100"
                r="25"
                fill="url(#grad1)"
                className="opacity-80"
                animate={{
                    scale: effectiveState === 'speaking' ? [1, 1.2, 1] : 1
                }}
            />

            <defs>
                <radialGradient id="grad1" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                    <stop offset="0%" style={{ stopColor: 'white', stopOpacity: 0.9 }} />
                    <stop offset="100%" style={{ stopColor: 'white', stopOpacity: 0 }} />
                </radialGradient>
            </defs>
        </svg>
    );
};

export default OrbRenderer;
