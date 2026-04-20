import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, Coffee, CheckCircle, ChevronRight, Play } from 'lucide-react';
import { useMemoryStore } from '../../services/memory/MemoryStore';

const RitualsHUD = ({ onClose }) => {
    const [activeRitual, setActiveRitual] = useState(null);
    const [step, setStep] = useState(0);

    const rituals = [
        {
            id: 'morning_sync',
            title: 'Morning Sync',
            description: 'Align neural pathways for the day ahead. Set primary directives.',
            icon: Sun,
            color: 'text-amber-300',
            bg: 'bg-amber-500/10',
            border: 'border-amber-500/20',
            steps: [
                "Systems online. What is the primary objective for this cycle?",
                "Are there any blocking dependencies I should be aware of?",
                "Sync complete. Initiating focus mode."
            ]
        },
        {
            id: 'deep_work',
            title: 'Deep Work Protocol',
            description: 'Suppress non-critical processes. 60 minutes of pure focus.',
            icon: Moon,
            color: 'text-indigo-300',
            bg: 'bg-indigo-500/10',
            border: 'border-indigo-500/20',
            steps: [
                "Acknowledged. Suppressing notification subsystems.",
                "Timer set for 60 minutes. Good luck."
            ]
        },
        {
            id: 'retro',
            title: 'Session Retro',
            description: 'Analyze output efficiency and store architectural decisions.',
            icon: Coffee,
            color: 'text-emerald-300',
            bg: 'bg-emerald-500/10',
            border: 'border-emerald-500/20',
            steps: [
                "Listing created artifacts...",
                "What key decision should be persisted to long-term memory?",
                "Archiving context. Rest well."
            ]
        }
    ];

    const { setWorkMode, addMessage } = useMemoryStore();

    const handleStart = (r) => {
        setActiveRitual(r);
        setStep(0);

        if (r.id === 'deep_work') {
            setWorkMode('deep_work');
            addMessage({
                id: Date.now(),
                role: 'assistant',
                content: 'Deep Work Protocol engaged. Non-essential processes suppressed.',
                timestamp: new Date()
            });
        }
    };

    const [responses, setResponses] = useState({});
    const [currentInput, setCurrentInput] = useState('');

    const handleNext = () => {
        // Save response for current step
        const updatedResponses = { ...responses, [step]: currentInput };
        setResponses(updatedResponses);

        if (activeRitual && step < activeRitual.steps.length - 1) {
            // Move to next step
            setStep(s => s + 1);
            setCurrentInput(''); // Clear input next step
        } else {
            // Finish & Compile Report
            if (activeRitual.id === 'deep_work') {
                // Special handling for Deep Work (already handled in start, but we can add a log)
                // user already confirmed via 'next'
            } else {
                // Compile textual report for standard rituals
                const reportParts = activeRitual.steps.map((question, idx) => {
                    const answer = updatedResponses[idx] || (idx === step ? currentInput : "Skipped");
                    return `**${question}**\n${answer}`;
                });

                const fullReport = `## ${activeRitual.title} Reflected\n\n${reportParts.join('\n\n')}`;

                addMessage({
                    role: 'assistant',
                    content: fullReport,
                    id: Date.now()
                });
            }

            setActiveRitual(null);
            setResponses({});
            setCurrentInput('');
            onClose();
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-8"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="w-full max-w-4xl bg-[#0a0a0a]/95 border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col min-h-[600px] max-h-[80vh]"
            >
                {/* Header */}
                <div className="p-8 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <div>
                        <h2 className="text-3xl font-light text-white tracking-wide">Rituals & Protocols</h2>
                        <p className="text-white/40 text-sm mt-2 font-light">Initiate guided sequences for alignment and review.</p>
                    </div>
                    <button onClick={onClose} className="text-white/20 hover:text-white transition-colors">
                        Close
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden">

                    {/* List */}
                    <div className={`p-6 border-r border-white/5 space-y-4 w-1/3 overflow-y-auto ${activeRitual ? 'hidden md:block' : 'block w-full'}`}>
                        {rituals.map(r => (
                            <button
                                key={r.id}
                                onClick={() => handleStart(r)}
                                className={`w-full text-left p-4 rounded-xl border transition-all group relative overflow-hidden
                                    ${activeRitual?.id === r.id
                                        ? `${r.bg} ${r.border} ring-1 ring-white/10`
                                        : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'}`}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <r.icon className={`w-6 h-6 ${r.color}`} />
                                    <Play className={`w-4 h-4 text-white/20 group-hover:text-white/60 transition-colors ${activeRitual?.id === r.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                                </div>
                                <h3 className="text-white font-medium tracking-wide">{r.title}</h3>
                                <p className="text-white/40 text-xs mt-1 leading-relaxed">{r.description}</p>
                            </button>
                        ))}
                    </div>

                    {/* Active Ritual View */}
                    <div className={`flex-1 bg-black/20 relative flex flex-col items-center justify-center p-12 ${activeRitual ? 'flex' : 'hidden md:flex'}`}>
                        <AnimatePresence mode="wait">
                            {activeRitual ? (
                                <motion.div
                                    key={activeRitual.id + step}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="max-w-md w-full flex flex-col gap-8"
                                >
                                    <div className="flex items-center gap-3 text-white/40 text-xs uppercase tracking-widest font-medium">
                                        <activeRitual.icon className={`w-4 h-4 ${activeRitual.color}`} />
                                        <span>Sequence: {activeRitual.title}</span>
                                        <span className="ml-auto">{step + 1} / {activeRitual.steps.length}</span>
                                    </div>

                                    <div className="text-2xl text-white font-light leading-snug">
                                        "{activeRitual.steps[step]}"
                                    </div>

                                    <div className="mt-8">
                                        <input
                                            type="text"
                                            value={currentInput}
                                            onChange={(e) => setCurrentInput(e.target.value)}
                                            placeholder="Enter response..."
                                            className="w-full bg-transparent border-b border-white/20 py-3 text-white focus:outline-none focus:border-white/60 transition-colors"
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleNext();
                                            }}
                                        />
                                    </div>

                                    <div className="flex justify-end pt-4">
                                        <button
                                            onClick={handleNext}
                                            className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-full hover:scale-105 transition-transform font-medium"
                                        >
                                            <span>{step === activeRitual.steps.length - 1 ? 'Complete' : 'Next'}</span>
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="text-center text-white/20">
                                    <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center mx-auto mb-4">
                                        <Play className="w-6 h-6 ml-1" />
                                    </div>
                                    <p>Select a protocol to begin.</p>
                                </div>
                            )}
                        </AnimatePresence>
                    </div>

                </div>
            </motion.div>
        </motion.div>
    );
};

export default RitualsHUD;
