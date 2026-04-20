import React from 'react';
import { motion } from 'framer-motion';
import { Shield, AlertCircle, Zap } from 'lucide-react';

const NeuralAuditHUD = ({ audit, onClose }) => {
    if (!audit) return null;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
        >
            <div className="glass-glow glass rounded-3xl p-8 max-w-md w-full pointer-events-auto">
                <div className="flex justify-between items-start mb-6">
                    <h2 className="text-2xl font-light text-white flex items-center gap-2">
                        <Zap className="w-6 h-6 text-yellow-500" />
                        Neural Audit
                    </h2>
                    <div className="text-4xl font-bold text-white/90">{audit.score}%</div>
                </div>

                <div className="space-y-6">
                    <div>
                        <div className="text-xs uppercase tracking-widest text-white/40 mb-2">Integrity Score</div>
                        <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${audit.score}%` }}
                                className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                            />
                        </div>
                    </div>

                    <div>
                        <div className="text-xs uppercase tracking-widest text-white/40 mb-2">Anomalies</div>
                        <ul className="space-y-2">
                            {audit.anomalies.map((a, i) => (
                                <li key={i} className="flex items-center gap-2 text-white/70 text-sm">
                                    <AlertCircle className="w-4 h-4 text-purple-400" />
                                    {a}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="pt-4 border-t border-white/10 italic text-white/60 font-serif text-lg leading-relaxed">
                        "{audit.insight}"
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="mt-8 w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 transition-all"
                >
                    Dismiss HUD
                </button>
            </div>
        </motion.div>
    );
};

export default NeuralAuditHUD;
