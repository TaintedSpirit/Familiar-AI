// CommandPalette — Cmd+K floating overlay + inline `/` autocomplete dropdown.
// Visual style mirrors the Grimoire palette (gold-on-leather), built on
// Framer Motion to match CommandBar.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { searchCommands, groupByCategory } from '../../services/commands/CommandRegistry';

const PALETTE = {
    leather:    '#0e0905',
    page:       '#110c07',
    border:     '#3a2712',
    borderFaint:'#261a0d',
    gold:       '#c9a84c',
    goldDim:    '#7a6028',
    goldGlow:   'rgba(201,168,76,0.18)',
    ink:        '#c4b49a',
    inkMid:     '#8a7a65',
    inkFaint:   '#4a3f30',
};

// Render a single command row.
const CommandRow = ({ def, selected, onClick, onMouseEnter }) => {
    const Icon = def.icon || ChevronRight;
    return (
        <button
            type="button"
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
            style={{
                background: selected ? PALETTE.goldGlow : 'transparent',
                borderLeft: selected ? `2px solid ${PALETTE.gold}` : '2px solid transparent',
            }}
        >
            <Icon className="w-4 h-4 shrink-0" style={{ color: selected ? PALETTE.gold : PALETTE.goldDim }} />
            <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                    <span className="text-xs font-mono" style={{ color: selected ? PALETTE.gold : PALETTE.ink }}>
                        /{def.name}
                    </span>
                    {def.argsHint && (
                        <span className="text-[10px] font-mono" style={{ color: PALETTE.inkFaint }}>
                            {def.argsHint}
                        </span>
                    )}
                </div>
                <div className="text-[10px] truncate" style={{ color: PALETTE.inkMid }}>
                    {def.description}
                </div>
            </div>
        </button>
    );
};

/**
 * CommandPalette
 *
 * Two presentation modes:
 *   - mode="overlay"  → centered floating overlay (Cmd+K trigger)
 *   - mode="dropdown" → anchored above the chat input (typed `/`)
 *
 * Props:
 *   open       — boolean
 *   query      — current filter string (palette controls input only in overlay mode)
 *   onQueryChange(q)
 *   onExecute(def)
 *   onClose()
 *   mode       — 'overlay' | 'dropdown'
 */
const CommandPalette = ({
    open,
    query = '',
    onQueryChange,
    onExecute,
    onClose,
    mode = 'overlay',
}) => {
    const [selectedIdx, setSelectedIdx] = useState(0);
    const inputRef = useRef(null);
    const listRef  = useRef(null);

    const filtered = useMemo(() => searchCommands(query), [query]);
    const grouped  = useMemo(() => groupByCategory(filtered), [filtered]);
    const flatList = useMemo(() => grouped.flatMap(g => g.items), [grouped]);

    // Reset selection whenever the visible list changes.
    useEffect(() => { setSelectedIdx(0); }, [query, open]);

    // Auto-focus search input in overlay mode.
    useEffect(() => {
        if (open && mode === 'overlay') inputRef.current?.focus();
    }, [open, mode]);

    // Keyboard nav. Bound to window so it works whether the palette has focus
    // (overlay mode) or the chat input does (dropdown mode).
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose?.();
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIdx(i => Math.min(flatList.length - 1, i + 1));
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIdx(i => Math.max(0, i - 1));
                return;
            }
            if (e.key === 'Enter' && mode === 'overlay') {
                e.preventDefault();
                const def = flatList[selectedIdx];
                if (def) onExecute?.(def);
                return;
            }
            if (e.key === 'Tab' && mode === 'dropdown') {
                e.preventDefault();
                const def = flatList[selectedIdx];
                if (def) onQueryChange?.(`/${def.name} `);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, flatList, selectedIdx, mode, onClose, onExecute, onQueryChange]);

    // Scroll selection into view.
    useEffect(() => {
        if (!listRef.current) return;
        const el = listRef.current.querySelector(`[data-idx="${selectedIdx}"]`);
        el?.scrollIntoView({ block: 'nearest' });
    }, [selectedIdx]);

    if (!open) return null;

    let cursor = -1;
    const renderList = (
        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: mode === 'overlay' ? 420 : 280 }}>
            {grouped.length === 0 && (
                <div className="px-3 py-4 text-xs italic" style={{ color: PALETTE.inkFaint }}>
                    No matching commands.
                </div>
            )}
            {grouped.map(group => (
                <div key={group.category} className="py-1">
                    <div
                        className="px-3 py-1 text-[9px] font-bold uppercase tracking-widest"
                        style={{ color: PALETTE.goldDim, borderBottom: `1px solid ${PALETTE.borderFaint}` }}
                    >
                        {group.category}
                    </div>
                    {group.items.map(def => {
                        cursor += 1;
                        const idx = cursor;
                        return (
                            <div data-idx={idx} key={def.name}>
                                <CommandRow
                                    def={def}
                                    selected={idx === selectedIdx}
                                    onClick={() => onExecute?.(def)}
                                    onMouseEnter={() => setSelectedIdx(idx)}
                                />
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );

    if (mode === 'dropdown') {
        return (
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.12 }}
                    className="absolute left-0 right-0 bottom-full mb-2 rounded-lg overflow-hidden shadow-2xl z-50"
                    style={{
                        background: PALETTE.page,
                        border: `1px solid ${PALETTE.border}`,
                    }}
                >
                    <div
                        className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest"
                        style={{ color: PALETTE.goldDim, borderBottom: `1px solid ${PALETTE.borderFaint}` }}
                    >
                        Commands  ·  ↑↓ select  ·  Tab autocomplete  ·  Enter run
                    </div>
                    {renderList}
                </motion.div>
            </AnimatePresence>
        );
    }

    // Overlay mode — centered floating card with its own search input.
    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="fixed inset-0 z-[1000] flex items-start justify-center pt-[18vh]"
                style={{ background: 'rgba(0,0,0,0.55)' }}
                onClick={onClose}
            >
                <motion.div
                    initial={{ y: -8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -8, opacity: 0 }}
                    transition={{ duration: 0.14 }}
                    onClick={e => e.stopPropagation()}
                    className="w-[560px] max-w-[90vw] rounded-xl overflow-hidden shadow-2xl"
                    style={{
                        background: PALETTE.page,
                        border: `1px solid ${PALETTE.border}`,
                    }}
                >
                    <div className="px-3 py-2.5" style={{ borderBottom: `1px solid ${PALETTE.borderFaint}` }}>
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={e => onQueryChange?.(e.target.value)}
                            placeholder="Type a command…"
                            className="w-full bg-transparent outline-none text-sm font-mono"
                            style={{ color: PALETTE.ink }}
                        />
                    </div>
                    {renderList}
                    <div
                        className="px-3 py-1.5 text-[9px] font-mono flex items-center justify-between"
                        style={{ color: PALETTE.inkFaint, borderTop: `1px solid ${PALETTE.borderFaint}` }}
                    >
                        <span>↑↓ select  ·  Enter run  ·  Esc close</span>
                        <span>{flatList.length} commands</span>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default CommandPalette;
