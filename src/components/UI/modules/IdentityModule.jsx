import React, { useState, useEffect } from 'react';
import { Fingerprint, Palette, Star, Edit3, Save, Check } from 'lucide-react';
import { useSettingsStore } from '../../../services/settings/SettingsStore';
import { useFormStore } from '../../../services/forms/FormStore';
import { FORMS } from '../../../services/forms/FormRegistry';

// Archetype energy colors — fallback palette when soulProfile doesn't supply one
const ARCHETYPE_COLORS = {
    void:        '#6366f1',
    ember:       '#f97316',
    tide:        '#06b6d4',
    gale:        '#22c55e',
    stone:       '#a8a29e',
    aurora:      '#e879f9',
};

const FORM_ORDER = ['seed_blob', 'orb_node', 'glyph_symbol', 'avatar_construct'];

const IdentityModule = ({ activeTab }) => {
    const { familiarName, setFamiliarName, soulProfile } = useSettingsStore();
    const { currentFormId, unlockedForms, setCurrentForm, metrics } = useFormStore();

    const [nameDraft, setNameDraft] = useState(familiarName ?? '');
    const [saved, setSaved]         = useState(false);

    useEffect(() => { setNameDraft(familiarName ?? ''); }, [familiarName]);

    const handleSaveName = () => {
        setFamiliarName(nameDraft.trim());
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    // Resolve energy color
    const energyColor = soulProfile?.energyColor
        ?? ARCHETYPE_COLORS[soulProfile?.archetype?.toLowerCase()]
        ?? '#6366f1';

    const displayName = familiarName || soulProfile?.name || 'Unnamed Familiar';

    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* Identity header card */}
            <div
                className="bg-white/5 border border-white/5 rounded-2xl p-4 relative overflow-hidden"
                style={{ boxShadow: `0 0 40px ${energyColor}18` }}
            >
                {/* Energy glow accent */}
                <div
                    className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 blur-2xl"
                    style={{ background: energyColor, transform: 'translate(30%, -30%)' }}
                />

                <div className="flex items-center gap-3 relative">
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: `${energyColor}20`, border: `1px solid ${energyColor}40` }}
                    >
                        <Fingerprint className="w-5 h-5" style={{ color: energyColor }} />
                    </div>
                    <div>
                        <div className="text-sm text-white/80 font-medium">{displayName}</div>
                        {soulProfile?.archetype && (
                            <div className="text-[10px] text-white/30 capitalize mt-0.5">{soulProfile.archetype} Archetype</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Custom name */}
            <div className="space-y-2">
                <div className="text-[9px] uppercase tracking-widest text-white/30">Familiar Name</div>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Edit3 className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-white/20" />
                        <input
                            value={nameDraft}
                            onChange={e => setNameDraft(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                            placeholder="Give your Familiar a name…"
                            maxLength={32}
                            className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-white/80 text-xs focus:outline-none focus:border-white/20"
                        />
                    </div>
                    <button
                        onClick={handleSaveName}
                        disabled={!nameDraft.trim() || nameDraft.trim() === familiarName}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                            saved
                                ? 'bg-green-500/20 text-green-300 border-green-500/30'
                                : 'bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-30 disabled:cursor-not-allowed'
                        }`}
                    >
                        {saved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                        {saved ? 'Saved' : 'Save'}
                    </button>
                </div>
            </div>

            {/* Soul profile summary */}
            {soulProfile && (
                <div className="space-y-2">
                    <div className="text-[9px] uppercase tracking-widest text-white/30">Soul Binding</div>
                    <div className="bg-white/5 border border-white/5 rounded-xl p-3 space-y-1.5">
                        {Object.entries(soulProfile)
                            .filter(([k, v]) => v && typeof v === 'string' && k !== 'energyColor')
                            .map(([k, v]) => (
                                <div key={k} className="flex gap-2 text-xs items-start">
                                    <span className="text-white/25 capitalize shrink-0 w-20">{k}</span>
                                    <span className="text-white/60 leading-relaxed">{v}</span>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {/* Energy color swatch */}
            <div className="space-y-2">
                <div className="text-[9px] uppercase tracking-widest text-white/30">Energy Signature</div>
                <div className="flex items-center gap-3">
                    <div
                        className="w-8 h-8 rounded-lg border border-white/10"
                        style={{ background: energyColor }}
                    />
                    <div>
                        <div className="text-xs text-white/60 font-mono">{energyColor}</div>
                        <div className="text-[10px] text-white/25">
                            {soulProfile?.archetype ? `${soulProfile.archetype} resonance` : 'Default'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Form evolution */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="text-[9px] uppercase tracking-widest text-white/30">Avatar Form</div>
                    <div className="text-[10px] text-white/25">{unlockedForms.length}/{FORM_ORDER.length} unlocked</div>
                </div>
                <div className="space-y-1.5">
                    {FORM_ORDER.map((formId, i) => {
                        const form = FORMS[formId];
                        if (!form) return null;
                        const isUnlocked = unlockedForms.includes(formId);
                        const isCurrent  = currentFormId === formId;
                        return (
                            <button
                                key={formId}
                                onClick={() => isUnlocked && setCurrentForm(formId)}
                                disabled={!isUnlocked}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left ${
                                    isCurrent
                                        ? 'border-blue-500/40 bg-blue-500/15'
                                        : isUnlocked
                                            ? 'border-white/5 bg-white/5 hover:bg-white/10'
                                            : 'border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed'
                                }`}
                            >
                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center text-[8px] font-bold shrink-0 ${
                                    isCurrent  ? 'border-blue-400 bg-blue-500/30 text-blue-300'
                                    : isUnlocked ? 'border-white/20 bg-white/5 text-white/40'
                                    : 'border-white/10 text-white/20'
                                }`}>
                                    {i + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className={`text-xs font-medium ${isCurrent ? 'text-blue-200' : 'text-white/60'}`}>
                                        {form.name}
                                        {isCurrent && <span className="ml-2 text-[9px] text-blue-400/60 font-normal">Active</span>}
                                    </div>
                                    <div className="text-[10px] text-white/25 truncate mt-0.5">{form.description}</div>
                                </div>
                                {!isUnlocked && (
                                    <div className="shrink-0 flex items-center gap-1 text-[9px] text-white/20">
                                        <Star className="w-2.5 h-2.5" />
                                        Locked
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Progress metrics */}
                <div className="bg-white/5 border border-white/5 rounded-xl px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1.5 mt-1">
                    <div className="text-[9px] uppercase tracking-widest text-white/20 col-span-2 mb-0.5">Progress</div>
                    {[
                        ['Sessions',          metrics.sessions],
                        ['Plans Completed',   metrics.plansCompleted],
                        ['Proposals OK',      metrics.proposalsApproved],
                        ['Trust Level',       metrics.trustLevel],
                    ].map(([label, val]) => (
                        <div key={label} className="flex justify-between text-[10px]">
                            <span className="text-white/30">{label}</span>
                            <span className="text-white/60 font-mono">{val ?? 0}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default IdentityModule;
