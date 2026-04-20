import React from 'react';
import { motion, useSpring } from 'framer-motion';

const BlobRenderer = ({ effectiveState, mouseX, mouseY, blobVariants, overrideAnimate, color, shouldPause = false }) => {
    // Shared springs passed from container or created here?
    // Let's create local springs for eyes if we pass raw mouse values, 
    // OR just accept the useMotionValues.
    // To allow switching, receiving values is better.

    const sx = useSpring(mouseX, { damping: 20, stiffness: 150 });
    const sy = useSpring(mouseY, { damping: 20, stiffness: 150 });

    return (
        <svg
            viewBox="0 0 200 200"
            className="w-full h-full drop-shadow-2xl"
            style={{ pointerEvents: 'none' }} // FormHandles events in parent for consisteny? Or pass handlers?
        >
            <defs>
                <filter id="goo">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
                    <feColorMatrix
                        in="blur"
                        mode="matrix"
                        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10"
                        result="goo"
                    />
                </filter>
            </defs>

            {/* PERF: Removed url(#goo) filter to prevent full-screen video pixelation on Windows */}
            <motion.g filter="url(#goo)">
                {/* Main Body */}
                <motion.circle
                    cx="100"
                    cy="100"
                    r="60"
                    fill={color || "white"}
                    className="opacity-20"
                    // VISUALS: Keep animation
                    animate={overrideAnimate || effectiveState}
                    variants={blobVariants}
                />
                {/* Drifting blobs */}
                {[...Array(3)].map((_, i) => (
                    <motion.circle
                        key={i}
                        cx="100"
                        cy="100"
                        r="30"
                        fill="white"
                        className="opacity-40"
                        animate={{
                            x: [0, Math.sin(i) * 20, 0],
                            y: [0, Math.cos(i) * 20, 0],
                            scale: effectiveState === 'thinking' ? [1, 0.8, 1] : [1, 1.2, 1]
                        }}
                        transition={{
                            duration: effectiveState === 'responding' ? 1 : (3 + i),
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                    />
                ))}
            </motion.g>

            {/* Eyes */}
            <motion.g style={{ x: sx, y: sy }}>
                <circle cx="85" cy="95" r="4" fill="white" className="opacity-80" />
                <circle cx="115" cy="95" r="4" fill="white" className="opacity-80" />
                <motion.circle
                    cx="85"
                    cy="95"
                    animate={{ r: (effectiveState === 'attention' || effectiveState === 'petting') ? 2 : 1.5 }}
                    fill="black"
                    style={{ x: useSpring(mouseX, { damping: 40, stiffness: 200 }) }}
                />
                <motion.circle
                    cx="115"
                    cy="95"
                    animate={{ r: (effectiveState === 'attention' || effectiveState === 'petting') ? 2 : 1.5 }}
                    fill="black"
                    style={{ x: useSpring(mouseX, { damping: 40, stiffness: 200 }) }}
                />
            </motion.g>
        </svg>
    );
};

export default BlobRenderer;
