import React, { useState, useEffect } from 'react';

const BootOverlay = ({ mounts }) => {
    const [stats, setStats] = useState({
        boot: 'started',
        window: 'visible',
        zIndex: 'auto',
        opacity: 1
    });

    useEffect(() => {
        const updateStats = () => {
            const computed = window.getComputedStyle(document.body);
            setStats(s => ({
                ...s,
                zIndex: computed.zIndex,
                opacity: computed.opacity,
                window: document.hidden ? 'hidden' : 'visible'
            }));
        };
        const interval = setInterval(updateStats, 500);
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            padding: '10px',
            background: 'rgba(0,0,0,0.8)',
            color: '#00ff00',
            fontFamily: 'monospace',
            fontSize: '12px',
            zIndex: 999999,
            pointerEvents: 'none',
            border: '2px solid #00ff00'
        }}>
            <div>BOOT: {stats.boot}</div>
            <div>MOUNT: Shell = {mounts.Shell ? 'TRUE' : 'FALSE'}</div>
            <div>MOUNT: Companion = {mounts.Companion ? 'TRUE' : 'FALSE'}</div>
            <div>MOUNT: CommandBar = {mounts.CommandBar ? 'TRUE' : 'FALSE'}</div>
            <div>WINDOW: {stats.window}</div>
            <div>ZINDEX: {stats.zIndex}</div>
            <div>OPACITY: {stats.opacity}</div>
            <div>CLICKTHROUGH: {mounts.ClickThrough ? 'Active' : 'Disabled'}</div>
        </div>
    );
};

export default BootOverlay;
