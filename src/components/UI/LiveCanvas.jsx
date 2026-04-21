import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download } from 'lucide-react';
import { useLiveCanvasStore } from '../../services/canvas/LiveCanvasStore';

export default function LiveCanvas() {
    const { content, visible, clear } = useLiveCanvasStore();

    const handleDownload = () => {
        if (!content?.url) return;
        const a = document.createElement('a');
        a.href = content.url;
        a.download = `familiar-${Date.now()}.png`;
        a.click();
    };

    return (
        <AnimatePresence>
            {visible && content && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 20 }}
                    transition={{ duration: 0.2 }}
                    style={{
                        position: 'fixed',
                        bottom: '120px',
                        right: '24px',
                        width: '340px',
                        maxHeight: '400px',
                        background: 'rgba(10, 10, 18, 0.92)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        backdropFilter: 'blur(12px)',
                        zIndex: 9999,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                    }}
                >
                    {/* Header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                            LIVE CANVAS
                        </span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            {content.type === 'image' && (
                                <button
                                    onClick={handleDownload}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: '2px' }}
                                >
                                    <Download size={13} />
                                </button>
                            )}
                            <button
                                onClick={clear}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: '2px' }}
                            >
                                <X size={13} />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div style={{ padding: content.type === 'code' ? '12px' : '0', overflowY: 'auto', maxHeight: '340px' }}>
                        {content.type === 'image' && (
                            <img
                                src={content.url}
                                alt={content.prompt || 'Generated image'}
                                style={{ width: '100%', display: 'block' }}
                            />
                        )}
                        {content.type === 'code' && (
                            <pre style={{
                                margin: 0, fontSize: '12px', color: '#c9d1d9',
                                fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            }}>
                                {content.body}
                            </pre>
                        )}
                        {content.type === 'text' && (
                            <p style={{ margin: 0, padding: '12px', fontSize: '13px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                                {content.body}
                            </p>
                        )}
                    </div>

                    {/* Prompt caption */}
                    {content.prompt && (
                        <div style={{
                            padding: '6px 12px', borderTop: '1px solid rgba(255,255,255,0.06)',
                            fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic',
                        }}>
                            {content.prompt}
                        </div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
