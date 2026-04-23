import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '../../services/settings/SettingsStore';
import { SoulEngine } from '../../services/soul/SoulEngine';

// ─── Step Definitions ─────────────────────────────────────────────────────────

const STEPS = [
    {
        id: 'orientation',
        title: 'What draws you to power?',
        subtitle: 'Choose all that resonate.',
        type: 'multi-chip',
        field: 'interests',
        options: ['Control', 'Freedom', 'Protection', 'Truth', 'Creation', 'Order', 'Chaos', 'Connection'],
    },
    {
        id: 'expression',
        title: 'What is your energy?',
        subtitle: 'Choose a color and a nature.',
        type: 'color-radio',
        fields: { color: 'energyColor', nature: 'energyNature' },
        colors: [
            { label: 'Void', hex: '#6366f1' },
            { label: 'Ember', hex: '#f97316' },
            { label: 'Frost', hex: '#38bdf8' },
            { label: 'Forest', hex: '#4ade80' },
            { label: 'Gold', hex: '#fbbf24' },
            { label: 'Rose', hex: '#f43f5e' },
            { label: 'Ash', hex: '#94a3b8' },
            { label: 'Bone', hex: '#f5f5f0' },
        ],
        natures: ['Calm', 'Intense', 'Precise', 'Chaotic'],
    },
    {
        id: 'friction',
        title: 'What gets in your way?',
        subtitle: 'Choose your obstacles.',
        type: 'multi-chip',
        field: 'obstacles',
        options: ['Overthinking', 'Burnout', 'Distraction', 'Perfectionism', 'Procrastination', 'Self-doubt', 'Overwhelm', 'Isolation'],
    },
    {
        id: 'direction',
        title: 'Where are you going?',
        subtitle: 'A goal and a reason.',
        type: 'dual-text',
        fields: [
            { key: 'goal', placeholder: 'Toward what?' },
            { key: 'why', placeholder: 'Because...' },
        ],
    },
    {
        id: 'signals',
        title: 'What are your core signals?',
        subtitle: 'Finish each sentence.',
        type: 'quad-text',
        fields: [
            { key: 'careAbout', placeholder: 'I care deeply about...' },
            { key: 'avoid', placeholder: 'I try to avoid...' },
            { key: 'wantMore', placeholder: 'I want more of...' },
            { key: 'tiredOf', placeholder: 'I am tired of...' },
        ],
    },
    {
        id: 'trigger',
        title: 'What makes you move?',
        subtitle: 'Choose what motivates you and describe a flow state.',
        type: 'radio-text',
        fields: {
            radio: { key: 'motivationSource', options: ['Pressure', 'Inspiration', 'Accountability', 'Momentum'] },
            text: { key: 'flowMemory', placeholder: 'Describe a moment when you felt truly in flow...' },
        },
    },
    {
        id: 'statement',
        title: 'Make your declaration.',
        subtitle: 'This is your identity, committed to language.',
        type: 'final-statement',
        fields: [
            { key: 'becomingX', placeholder: 'I want to become...' },
            { key: 'leavingY', placeholder: 'Because I refuse to stay...' },
        ],
    },
];


// ─── Step Renderers ────────────────────────────────────────────────────────────

const MultiChip = ({ options, value = [], onChange }) => (
    <div className="flex flex-wrap gap-2 justify-center mt-4">
        {options.map(opt => {
            const selected = value.includes(opt);
            return (
                <button
                    key={opt}
                    onClick={() => onChange(selected ? value.filter(v => v !== opt) : [...value, opt])}
                    className={`px-4 py-1.5 rounded-full border text-sm transition-all duration-200 ${selected
                        ? 'bg-white/15 border-white/40 text-white'
                        : 'border-white/10 text-white/40 hover:border-white/25 hover:text-white/70'
                        }`}
                >
                    {opt}
                </button>
            );
        })}
    </div>
);

const ColorRadio = ({ colors, natures, colorValue, natureValue, onColorChange, onNatureChange }) => (
    <div className="mt-4 space-y-6">
        <div className="flex flex-wrap gap-3 justify-center">
            {colors.map(c => (
                <button
                    key={c.hex}
                    onClick={() => onColorChange(c.hex)}
                    title={c.label}
                    className={`w-9 h-9 rounded-full border-2 transition-all duration-200 ${colorValue === c.hex ? 'scale-125 border-white shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'}`}
                    style={{ backgroundColor: c.hex }}
                />
            ))}
        </div>
        <div className="flex gap-3 justify-center">
            {natures.map(n => (
                <button
                    key={n}
                    onClick={() => onNatureChange(n)}
                    className={`px-4 py-1.5 rounded-full border text-sm transition-all duration-200 ${natureValue === n
                        ? 'bg-white/15 border-white/40 text-white'
                        : 'border-white/10 text-white/40 hover:border-white/25 hover:text-white/70'
                        }`}
                >
                    {n}
                </button>
            ))}
        </div>
    </div>
);

const TextFields = ({ fields, values, onChange }) => (
    <div className="mt-4 space-y-3 w-full max-w-sm mx-auto">
        {fields.map(f => (
            <input
                key={f.key}
                type="text"
                placeholder={f.placeholder}
                value={values[f.key] || ''}
                onChange={e => onChange(f.key, e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
            />
        ))}
    </div>
);

const RadioText = ({ radioOptions, radioValue, textValue, textPlaceholder, onRadioChange, onTextChange }) => (
    <div className="mt-4 space-y-4 w-full max-w-sm mx-auto">
        <div className="flex gap-2 flex-wrap justify-center">
            {radioOptions.map(opt => (
                <button
                    key={opt}
                    onClick={() => onRadioChange(opt)}
                    className={`px-4 py-1.5 rounded-full border text-sm transition-all duration-200 ${radioValue === opt
                        ? 'bg-white/15 border-white/40 text-white'
                        : 'border-white/10 text-white/40 hover:border-white/25 hover:text-white/70'
                        }`}
                >
                    {opt}
                </button>
            ))}
        </div>
        <textarea
            placeholder={textPlaceholder}
            value={textValue || ''}
            onChange={e => onTextChange(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors resize-none h-20"
        />
    </div>
);

const FinalStatement = ({ fields, values, onChange, energyColor }) => (
    <div className="mt-4 space-y-3 w-full max-w-sm mx-auto">
        {fields.map(f => (
            <textarea
                key={f.key}
                placeholder={f.placeholder}
                value={values[f.key] || ''}
                onChange={e => onChange(f.key, e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors resize-none h-16"
                style={energyColor ? { borderColor: `${energyColor}40` } : {}}
            />
        ))}
    </div>
);

// ─── Main Component ────────────────────────────────────────────────────────────

const GrimoireOnboarding = ({ onComplete }) => {
    const { setSoulProfile, setCustomPersonaPrompt, setHasOnboarded } = useSettingsStore.getState();

    // Tell Electron to capture mouse events — the window is click-through by default
    useEffect(() => {
        window.electronAPI?.send('set-ignore-mouse-events', false);
    }, []);

    const [step, setStep] = useState(0);
    const [binding, setBinding] = useState(false);
    const [answers, setAnswers] = useState({
        interests: [],
        energyColor: '#6366f1',
        energyNature: '',
        obstacles: [],
        goal: '',
        why: '',
        careAbout: '',
        avoid: '',
        wantMore: '',
        tiredOf: '',
        motivationSource: '',
        flowMemory: '',
        becomingX: '',
        leavingY: '',
    });

    const current = STEPS[step];
    const isLast = step === STEPS.length - 1;

    const setAnswer = (key, val) => setAnswers(prev => ({ ...prev, [key]: val }));

    const canAdvance = () => {
        if (current.type === 'multi-chip') return answers[current.field]?.length > 0;
        if (current.type === 'color-radio') return !!answers.energyNature && !!answers.energyColor;
        if (current.type === 'dual-text') return current.fields.every(f => answers[f.key]?.trim());
        if (current.type === 'quad-text') return current.fields.some(f => answers[f.key]?.trim());
        if (current.type === 'radio-text') return !!answers[current.fields.radio.key];
        if (current.type === 'final-statement') return current.fields.every(f => answers[f.key]?.trim());
        return true;
    };

    const handleBind = async () => {
        setBinding(true);
        await new Promise(r => setTimeout(r, 1800));

        const profile = { ...answers, boundAt: Date.now() };
        setSoulProfile(profile);
        setCustomPersonaPrompt(SoulEngine.buildPersonaPrompt(profile));
        setHasOnboarded(true);
        onComplete?.(profile);
    };

    const renderStepInput = () => {
        switch (current.type) {
            case 'multi-chip':
                return (
                    <MultiChip
                        options={current.options}
                        value={answers[current.field]}
                        onChange={val => setAnswer(current.field, val)}
                    />
                );
            case 'color-radio':
                return (
                    <ColorRadio
                        colors={current.colors}
                        natures={current.natures}
                        colorValue={answers.energyColor}
                        natureValue={answers.energyNature}
                        onColorChange={hex => setAnswer('energyColor', hex)}
                        onNatureChange={n => setAnswer('energyNature', n)}
                    />
                );
            case 'dual-text':
            case 'quad-text':
                return (
                    <TextFields
                        fields={current.fields}
                        values={answers}
                        onChange={setAnswer}
                    />
                );
            case 'radio-text':
                return (
                    <RadioText
                        radioOptions={current.fields.radio.options}
                        radioValue={answers[current.fields.radio.key]}
                        textValue={answers[current.fields.text.key]}
                        textPlaceholder={current.fields.text.placeholder}
                        onRadioChange={v => setAnswer(current.fields.radio.key, v)}
                        onTextChange={v => setAnswer(current.fields.text.key, v)}
                    />
                );
            case 'final-statement':
                return (
                    <FinalStatement
                        fields={current.fields}
                        values={answers}
                        onChange={setAnswer}
                        energyColor={answers.energyColor}
                    />
                );
            default:
                return null;
        }
    };

    if (binding) {
        return (
            <motion.div
                key="binding"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black"
            >
                <motion.div
                    animate={{
                        scale: [1, 1.4, 0.9, 1.2, 1],
                        opacity: [0.4, 1, 0.6, 1, 0.8],
                    }}
                    transition={{ duration: 1.8, ease: 'easeInOut' }}
                    className="w-32 h-32 rounded-full blur-xl"
                    style={{ backgroundColor: answers.energyColor || '#6366f1' }}
                />
                <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="mt-8 text-white/60 text-sm tracking-[0.4em] uppercase font-light"
                >
                    Binding soul...
                </motion.p>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center overflow-hidden"
        >
            {/* Ambient glow from energy color */}
            <div
                className="absolute inset-0 pointer-events-none transition-all duration-1000"
                style={{
                    background: `radial-gradient(ellipse at 50% 60%, ${answers.energyColor}18 0%, transparent 65%)`,
                }}
            />

            {/* Step counter */}
            <div className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-2">
                {STEPS.map((_, i) => (
                    <div
                        key={i}
                        className={`h-0.5 transition-all duration-500 rounded-full ${i === step ? 'w-6 bg-white/60' : i < step ? 'w-3 bg-white/30' : 'w-3 bg-white/10'}`}
                    />
                ))}
            </div>

            {/* Card */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={step}
                    initial={{ opacity: 0, y: 24, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -16, scale: 0.98 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="relative z-10 flex flex-col items-center text-center px-8 max-w-md w-full"
                >
                    <p className="text-[10px] text-white/25 uppercase tracking-[0.35em] mb-3">
                        {current.id}
                    </p>
                    <h2 className="text-2xl font-light text-white/90 tracking-wide leading-snug">
                        {current.title}
                    </h2>
                    <p className="mt-1 text-sm text-white/35 font-light">
                        {current.subtitle}
                    </p>

                    {renderStepInput()}

                    <motion.button
                        onClick={isLast ? handleBind : () => setStep(s => s + 1)}
                        disabled={!canAdvance()}
                        whileTap={{ scale: 0.96 }}
                        className={`mt-8 px-8 py-2.5 rounded-full border text-sm font-light tracking-widest uppercase transition-all duration-300 ${canAdvance()
                            ? 'border-white/30 text-white/80 hover:border-white/60 hover:text-white hover:bg-white/5'
                            : 'border-white/5 text-white/20 cursor-not-allowed'
                            }`}
                        style={canAdvance() && answers.energyColor ? { borderColor: `${answers.energyColor}60` } : {}}
                    >
                        {isLast ? 'Bind' : 'Continue'}
                    </motion.button>
                </motion.div>
            </AnimatePresence>

            {/* Skip — very subtle */}
            {step < STEPS.length - 1 && (
                <button
                    onClick={() => {
                        const profile = { ...answers, boundAt: Date.now() };
                        setSoulProfile(profile);
                        setCustomPersonaPrompt(SoulEngine.buildPersonaPrompt(profile));
                        setHasOnboarded(true);
                        onComplete?.(profile);
                    }}
                    className="absolute bottom-6 text-[10px] text-white/15 hover:text-white/35 transition-colors tracking-widest uppercase"
                >
                    Skip binding
                </button>
            )}
        </motion.div>
    );
};

export default GrimoireOnboarding;
