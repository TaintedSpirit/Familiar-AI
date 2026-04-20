
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Blob from '../Blob/Blob';
import CompanionMenu from './CompanionMenu';

const CompanionWrapper = ({
    blobProps,
    publicState,
    settings,
    isOpen,
    visionEnabled,
    onAction,
    shouldPause // New Prop
}) => {
    const [isHovered, setIsHovered] = useState(false);
    const [menuVisible, setMenuVisible] = useState(false);

    // Timers
    const enterTimer = useRef(null);
    const exitTimer = useRef(null);

    const showMenu = () => {
        if (exitTimer.current) clearTimeout(exitTimer.current);
        enterTimer.current = setTimeout(() => setMenuVisible(true), settings?.hoverMenu?.delay ?? 300);
    };

    const hideMenu = () => {
        if (enterTimer.current) clearTimeout(enterTimer.current);
        exitTimer.current = setTimeout(() => setMenuVisible(false), 250);
    };

    const handleMouseEnter = () => { setIsHovered(true); showMenu(); };
    const handleMouseLeave = () => { setIsHovered(false); hideMenu(); };

    const handleDoubleClick = (e) => {
        e.stopPropagation();
        if (onAction) onAction('CHAT');
    };

    return (
        <div
            className="relative w-full h-full flex items-center justify-center pointer-events-auto"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* The Companion */}
            <motion.div
                className="relative w-64 h-64 flex items-center justify-center cursor-grab active:cursor-grabbing outline-none"
                onDoubleClick={handleDoubleClick}
                onClick={(e) => {
                    e.stopPropagation();
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
            >
                {/* 
                   Hit-Area Backplate: 
                   MUST have slight opacity (0.01) for Electron/Windows to register it as a click target 
                   when window is transparent. Fully transparent (alpha 0) falls through.
                 */}
                <div
                    className="absolute inset-0 rounded-full transition-colors duration-300 pointer-events-auto"
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.01)' }}
                />

                <Blob {...blobProps} innerWorldState={publicState} shouldPause={shouldPause} />
            </motion.div>

            {/* The Affordance Menu */}
            <AnimatePresence>
                {menuVisible && (
                    <CompanionMenu
                        publicState={publicState}
                        isOpen={isOpen}
                        visionEnabled={visionEnabled}
                        onAction={onAction}
                        onMouseEnter={showMenu}
                        onMouseLeave={hideMenu}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default CompanionWrapper;
