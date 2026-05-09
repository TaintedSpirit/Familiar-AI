import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, Check } from 'lucide-react';
import { useSettingsStore } from '../../services/settings/SettingsStore';
import {
    MODEL_CATALOG, MODEL_GROUPS, BADGE_COLORS,
    findCurrentEntry, shortLabel,
} from '../../services/llm/ModelCatalog';

// ─── Badge pill ───────────────────────────────────────────────────────────────
const Badge = ({ label }) => {
    if (!label) return null;
    const c = BADGE_COLORS[label] ?? { bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.15)', text: 'rgba(255,255,255,0.5)' };
    return (
        <span className="text-[8px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
            style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
            {label}
        </span>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────
// theme: 'dark' (commandbar) | 'grimoire' (chat panel)
const ModelPicker = ({ theme = 'dark', align = 'left' }) => {
    const { aiProvider, model, setAiProvider, setModel } = useSettingsStore();
    const [open, setOpen] = useState(false);
    const [customDraft, setCustomDraft] = useState('');
    const containerRef = useRef(null);

    const current = findCurrentEntry(aiProvider, model);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (!containerRef.current?.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open]);

    const selectEntry = (entry) => {
        if (entry.custom) {
            const name = customDraft.trim();
            if (!name) return;
            setAiProvider(entry.provider);
            setModel(name);
        } else {
            setAiProvider(entry.provider);
            setModel(entry.modelId);
        }
        setOpen(false);
    };

    // ── Theme tokens ─────────────────────────────────────────────────────────
    const isDark = theme === 'dark';
    const panelBg      = isDark ? 'rgba(10,10,14,0.97)' : '#0e0905';
    const panelBorder  = isDark ? 'rgba(255,255,255,0.1)' : '#3a2712';
    const itemHoverBg  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(201,168,76,0.08)';
    const itemActiveBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(201,168,76,0.18)';
    const labelColor   = isDark ? 'rgba(255,255,255,0.85)' : '#c4b49a';
    const groupColor   = isDark ? 'rgba(255,255,255,0.25)' : '#4a3f30';
    const triggerColor = isDark ? 'rgba(255,255,255,0.55)' : '#8a7a65';
    const triggerActive = isDark ? 'rgba(255,255,255,0.9)' : '#c9a84c';
    const checkColor   = isDark ? '#60a5fa' : '#c9a84c';

    const isCurrentEntry = (entry) => {
        if (entry.custom) return entry.provider === aiProvider && !MODEL_CATALOG.find(m => !m.custom && m.provider === aiProvider && m.modelId === model);
        return entry.provider === aiProvider && entry.modelId === model;
    };

    return (
        <div ref={containerRef} className="relative inline-flex items-center">
            {/* Trigger button */}
            <button
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-1.5 rounded px-2 py-1 transition-all select-none"
                style={{
                    color: open ? triggerActive : triggerColor,
                    background: open ? itemHoverBg : 'transparent',
                }}
                onMouseEnter={e => { if (!open) e.currentTarget.style.color = labelColor; }}
                onMouseLeave={e => { if (!open) e.currentTarget.style.color = triggerColor; }}
            >
                <span className="text-[10px] font-medium tracking-wide max-w-[120px] truncate">
                    {shortLabel(current) || 'Select model'}
                </span>
                <motion.div animate={{ rotate: open ? 0 : 180 }} transition={{ duration: 0.15 }}>
                    <ChevronUp className="w-3 h-3 shrink-0" />
                </motion.div>
            </button>

            {/* Dropdown panel */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.97 }}
                        transition={{ duration: 0.13, ease: [0.16, 1, 0.3, 1] }}
                        className="absolute bottom-full mb-2 z-[200] rounded-xl overflow-hidden"
                        style={{
                            [align === 'right' ? 'right' : 'left']: 0,
                            width: 240,
                            background: panelBg,
                            border: `1px solid ${panelBorder}`,
                            boxShadow: '0 16px 48px rgba(0,0,0,0.8)',
                            backdropFilter: 'blur(16px)',
                        }}
                    >
                        {/* Header */}
                        <div className="px-3 py-2 border-b" style={{ borderColor: panelBorder }}>
                            <span className="text-[9px] uppercase tracking-[0.2em] font-semibold" style={{ color: groupColor }}>
                                Model
                            </span>
                        </div>

                        {/* Model list grouped */}
                        <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
                            {MODEL_GROUPS.map((group) => {
                                const entries = MODEL_CATALOG.filter(m => m.group === group);
                                return (
                                    <div key={group}>
                                        {/* Group label — only if more than one group */}
                                        {MODEL_GROUPS.length > 1 && (
                                            <div className="px-3 pt-2 pb-0.5 text-[8px] uppercase tracking-[0.2em]"
                                                style={{ color: groupColor }}>
                                                {group}
                                            </div>
                                        )}
                                        {entries.map(entry => {
                                            const active = isCurrentEntry(entry);
                                            return (
                                                <div key={entry.id}>
                                                    <button
                                                        onClick={() => !entry.custom && selectEntry(entry)}
                                                        className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors"
                                                        style={{
                                                            background: active ? itemActiveBg : 'transparent',
                                                            color: active ? (isDark ? '#fff' : '#c9a84c') : labelColor,
                                                        }}
                                                        onMouseEnter={e => { if (!active) e.currentTarget.style.background = itemHoverBg; }}
                                                        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                                                    >
                                                        {/* Check mark */}
                                                        <span className="w-3 shrink-0 flex items-center justify-center">
                                                            {active && <Check className="w-3 h-3" style={{ color: checkColor }} />}
                                                        </span>

                                                        {/* Label */}
                                                        <span className="flex-1 text-[11px] font-medium truncate">
                                                            {entry.label}
                                                        </span>

                                                        {/* Badge */}
                                                        <Badge label={entry.badge} />
                                                    </button>

                                                    {/* Custom model input (Ollama / LM Studio) */}
                                                    {entry.custom && (
                                                        <div className="flex items-center gap-2 px-3 pb-2">
                                                            <span className="w-3 shrink-0" />
                                                            <input
                                                                value={entry.provider === aiProvider && entry.custom
                                                                    ? (MODEL_CATALOG.find(m => !m.custom && m.provider === aiProvider && m.modelId === model) ? '' : model)
                                                                    : customDraft}
                                                                onChange={e => setCustomDraft(e.target.value)}
                                                                onKeyDown={e => e.key === 'Enter' && selectEntry(entry)}
                                                                placeholder="model name…"
                                                                className="flex-1 text-[10px] px-2 py-1 rounded outline-none font-mono"
                                                                style={{
                                                                    background: 'rgba(255,255,255,0.06)',
                                                                    border: `1px solid ${panelBorder}`,
                                                                    color: labelColor,
                                                                }}
                                                            />
                                                            <button
                                                                onClick={() => selectEntry(entry)}
                                                                className="text-[9px] px-2 py-1 rounded"
                                                                style={{ background: itemHoverBg, color: labelColor }}
                                                            >
                                                                Use
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ModelPicker;
