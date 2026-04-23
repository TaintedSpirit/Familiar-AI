import React, { useState, useEffect } from 'react';
import {
    Fingerprint, User, Mic, Eye, Save, Volume2, Camera,
    Edit3, Check, Star
} from 'lucide-react';
import { useSettingsStore } from '../../../services/settings/SettingsStore';
import { useSpeechStore } from '../../../services/voice/SpeechStore';
import { useVisionStore } from '../../../services/vision/VisionStore';
import { useFormStore } from '../../../services/forms/FormStore';
import { FORMS } from '../../../services/forms/FormRegistry';

const VOICE_IDS        = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
const SPEECH_PROVIDERS = ['gemini', 'openai'];
const FORM_ORDER       = ['seed_blob', 'orb_node', 'glyph_symbol', 'avatar_construct'];

const ARCHETYPE_COLORS = {
    void:   '#6366f1', ember:  '#f97316',
    tide:   '#06b6d4', gale:   '#22c55e',
    stone:  '#a8a29e', aurora: '#e879f9',
};

// Maps the activeTab prop (from NAV_STRUCTURE item id suffix) → internal tab id
const TAB_ALIAS = {
    identity: 'identity', persona: 'persona', senses: 'senses',
    // legacy fallbacks from old Soul + Identity routes
    voice: 'senses', vision: 'senses', meta: 'identity', theme: 'identity',
};

const SoulModule = ({ activeTab }) => {
    const {
        familiarName, setFamiliarName,
        soulProfile,
        customPersonaPrompt, setCustomPersonaPrompt,
    } = useSettingsStore();

    const {
        voiceMode, setVoiceMode,
        voiceId, setVoiceId,
        voiceVolume, setVoiceVolume,
        speechProvider, setSpeechProvider,
    } = useSpeechStore();

    const {
        isAwarenessEnabled, toggleAwareness,
        visionStatus, lastCaptureAt, captureNow,
    } = useVisionStore();

    const { currentFormId, unlockedForms, setCurrentForm, metrics } = useFormStore();

    const [localTab, setLocalTab]         = useState(TAB_ALIAS[activeTab] ?? 'identity');
    const [nameDraft, setNameDraft]       = useState(familiarName ?? '');
    const [nameSaved, setNameSaved]       = useState(false);
    const [personaDraft, setPersonaDraft] = useState(customPersonaPrompt ?? '');
    const [personaSaved, setPersonaSaved] = useState(false);
    const [capturing, setCapturing]       = useState(false);

    useEffect(() => { setLocalTab(TAB_ALIAS[activeTab] ?? 'identity'); }, [activeTab]);
    useEffect(() => { setNameDraft(familiarName ?? ''); }, [familiarName]);
    useEffect(() => { setPersonaDraft(customPersonaPrompt ?? ''); }, [customPersonaPrompt]);

    const handleSaveName = () => {
        setFamiliarName(nameDraft.trim());
        setNameSaved(true);
        setTimeout(() => setNameSaved(false), 2000);
    };

    const handleSavePersona = () => {
        setCustomPersonaPrompt(personaDraft);
        setPersonaSaved(true);
        setTimeout(() => setPersonaSaved(false), 2000);
    };

    const handleCaptureNow = async () => {
        setCapturing(true);
        await captureNow();
        setCapturing(false);
    };

    const energyColor = soulProfile?.energyColor
        ?? ARCHETYPE_COLORS[soulProfile?.archetype?.toLowerCase()]
        ?? '#6366f1';

    const displayName = familiarName || soulProfile?.name || 'Unnamed Familiar';

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tab bar */}
            <div className="flex shrink-0 border-b border-white/5 bg-black/10">
                {[
                    { id: 'identity', icon: Fingerprint, label: 'Identity' },
                    { id: 'persona',  icon: User,        label: 'Persona'  },
                    { id: 'senses',   icon: Mic,         label: 'Senses'   },
                ].map(({ id, icon: Icon, label }) => (
                    <button
                        key={id}
                        onClick={() => setLocalTab(id)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] uppercase tracking-wider transition-colors border-b-2 ${
                            localTab === id
                                ? 'border-blue-400 text-blue-300'
                                : 'border-transparent text-white/30 hover:text-white/60'
                        }`}
                    >
                        <Icon className="w-3 h-3" />
                        {label}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">

                {/* ── IDENTITY ──────────────────────────────────────────── */}
                {localTab === 'identity' && (
                    <>
                        {/* Header card with energy glow */}
                        <div
                            className="bg-white/5 border border-white/5 rounded-2xl p-4 relative overflow-hidden"
                            style={{ boxShadow: `0 0 40px ${energyColor}18` }}
                        >
                            <div
                                className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 blur-2xl pointer-events-none"
                                style={{ background: energyColor, transform: 'translate(30%,-30%)' }}
                            />
                            <div className="flex items-center gap-3 relative">
                                <div
                                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                    style={{ background: `${energyColor}20`, border: `1px solid ${energyColor}40` }}
                                >
                                    <Fingerprint className="w-5 h-5" style={{ color: energyColor }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm text-white/80 font-medium truncate">{displayName}</div>
                                    {soulProfile?.archetype && (
                                        <div className="text-[10px] text-white/30 capitalize mt-0.5">
                                            {soulProfile.archetype} Archetype
                                        </div>
                                    )}
                                </div>
                                <div
                                    className="w-5 h-5 rounded-full border border-white/10 shrink-0"
                                    style={{ background: energyColor }}
                                    title={energyColor}
                                />
                            </div>
                        </div>

                        {/* Name input */}
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
                                        nameSaved
                                            ? 'bg-green-500/20 text-green-300 border-green-500/30'
                                            : 'bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-30 disabled:cursor-not-allowed'
                                    }`}
                                >
                                    {nameSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                                    {nameSaved ? 'Saved' : 'Save'}
                                </button>
                            </div>
                        </div>

                        {/* Avatar Form evolution */}
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
                                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors text-left ${
                                                isCurrent    ? 'border-blue-500/40 bg-blue-500/15'
                                                : isUnlocked ? 'border-white/5 bg-white/5 hover:bg-white/10'
                                                : 'border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed'
                                            }`}
                                        >
                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center text-[8px] font-bold shrink-0 ${
                                                isCurrent    ? 'border-blue-400 bg-blue-500/30 text-blue-300'
                                                : isUnlocked ? 'border-white/20 bg-white/5 text-white/40'
                                                : 'border-white/10 text-white/20'
                                            }`}>{i + 1}</div>
                                            <div className="flex-1 min-w-0">
                                                <div className={`text-xs font-medium ${isCurrent ? 'text-blue-200' : 'text-white/60'}`}>
                                                    {form.name}
                                                    {isCurrent && <span className="ml-2 text-[9px] text-blue-400/60 font-normal">Active</span>}
                                                </div>
                                                <div className="text-[10px] text-white/25 truncate">{form.description}</div>
                                            </div>
                                            {!isUnlocked && <Star className="w-2.5 h-2.5 text-white/20 shrink-0" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Trust metrics */}
                        <div className="bg-white/5 border border-white/5 rounded-xl px-3 py-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
                            <div className="text-[9px] uppercase tracking-widest text-white/20 col-span-2 mb-0.5">Progress</div>
                            {[
                                ['Sessions',       metrics.sessions],
                                ['Plans Done',     metrics.plansCompleted],
                                ['Proposals OK',   metrics.proposalsApproved],
                                ['Trust Level',    metrics.trustLevel],
                            ].map(([label, val]) => (
                                <div key={label} className="flex justify-between text-[10px]">
                                    <span className="text-white/30">{label}</span>
                                    <span className="text-white/60 font-mono">{val ?? 0}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* ── PERSONA ───────────────────────────────────────────── */}
                {localTab === 'persona' && (
                    <>
                        {soulProfile && (
                            <div className="bg-white/5 border border-white/5 rounded-xl p-3 space-y-2">
                                <div className="text-[9px] uppercase tracking-widest text-white/30">Soul Binding</div>
                                {Object.entries(soulProfile)
                                    .filter(([k, v]) => v && typeof v === 'string' && k !== 'energyColor')
                                    .map(([k, v]) => (
                                        <div key={k} className="flex gap-2 text-xs items-start">
                                            <span className="text-white/30 capitalize shrink-0 w-20">{k}</span>
                                            <span className="text-white/60 leading-relaxed">{v}</span>
                                        </div>
                                    ))}
                            </div>
                        )}
                        <div className="space-y-2">
                            <div className="text-[9px] uppercase tracking-widest text-white/30">Custom Persona Prompt</div>
                            <textarea
                                value={personaDraft}
                                onChange={e => setPersonaDraft(e.target.value)}
                                rows={9}
                                placeholder="Define how your Familiar speaks and behaves…"
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-white/80 text-xs focus:outline-none focus:border-white/20 resize-none leading-relaxed"
                            />
                            <button
                                onClick={handleSavePersona}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                                    personaSaved
                                        ? 'bg-green-500/20 text-green-300 border-green-500/30'
                                        : 'bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/30'
                                }`}
                            >
                                <Save className="w-3 h-3" />
                                {personaSaved ? 'Saved!' : 'Save Persona'}
                            </button>
                        </div>
                    </>
                )}

                {/* ── SENSES ────────────────────────────────────────────── */}
                {localTab === 'senses' && (
                    <>
                        {/* Voice mode */}
                        <div className="space-y-2">
                            <div className="text-[9px] uppercase tracking-widest text-white/30">Voice Mode</div>
                            <div className="flex gap-2">
                                {['push-to-talk', 'always-listening'].map(mode => (
                                    <button key={mode} onClick={() => setVoiceMode(mode)}
                                        className={`flex-1 px-3 py-2 rounded-xl text-xs border transition-colors ${
                                            voiceMode === mode
                                                ? 'bg-blue-500/20 text-blue-200 border-blue-500/30'
                                                : 'bg-white/5 text-white/40 border-white/5 hover:text-white/70'
                                        }`}
                                    >
                                        {mode === 'push-to-talk' ? 'Push to Talk' : 'Always Listening'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Speech provider */}
                        <div className="space-y-2">
                            <div className="text-[9px] uppercase tracking-widest text-white/30">Speech Provider</div>
                            <div className="flex gap-2">
                                {SPEECH_PROVIDERS.map(p => (
                                    <button key={p} onClick={() => setSpeechProvider(p)}
                                        className={`flex-1 px-3 py-2 rounded-xl text-xs border capitalize transition-colors ${
                                            speechProvider === p
                                                ? 'bg-blue-500/20 text-blue-200 border-blue-500/30'
                                                : 'bg-white/5 text-white/40 border-white/5 hover:text-white/70'
                                        }`}
                                    >{p}</button>
                                ))}
                            </div>
                        </div>

                        {/* Voice ID */}
                        <div className="space-y-2">
                            <div className="text-[9px] uppercase tracking-widest text-white/30">Voice (OpenAI TTS)</div>
                            <div className="grid grid-cols-3 gap-1.5">
                                {VOICE_IDS.map(v => (
                                    <button key={v} onClick={() => setVoiceId(v)}
                                        className={`px-2 py-1.5 rounded-lg text-xs capitalize border transition-colors ${
                                            voiceId === v
                                                ? 'bg-blue-500/20 text-blue-200 border-blue-500/30'
                                                : 'bg-white/5 text-white/40 border-white/5 hover:text-white/70'
                                        }`}
                                    >{v}</button>
                                ))}
                            </div>
                        </div>

                        {/* Volume */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="text-[9px] uppercase tracking-widest text-white/30">Volume</div>
                                <div className="flex items-center gap-1 text-white/40 text-[10px]">
                                    <Volume2 className="w-3 h-3" />
                                    {Math.round(voiceVolume * 100)}%
                                </div>
                            </div>
                            <input type="range" min={0} max={1} step={0.05} value={voiceVolume}
                                onChange={e => setVoiceVolume(parseFloat(e.target.value))}
                                className="w-full accent-blue-400"
                            />
                        </div>

                        {/* Vision */}
                        <div className="border-t border-white/5 pt-4 space-y-3">
                            <div className="text-[9px] uppercase tracking-widest text-white/30">Vision</div>
                            <div className="bg-white/5 border border-white/5 rounded-xl p-3 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-xs text-white/70 font-medium">Screen Awareness</div>
                                        <div className="text-[10px] text-white/30 mt-0.5">Captures active window context</div>
                                    </div>
                                    <button onClick={toggleAwareness}
                                        className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                                            isAwarenessEnabled
                                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/30'
                                                : 'bg-white/5 text-white/40 border-white/5 hover:text-white/60'
                                        }`}
                                    >{isAwarenessEnabled ? 'Enabled' : 'Disabled'}</button>
                                </div>
                                <div className="flex items-center gap-3 pt-1 border-t border-white/5">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                                        visionStatus === 'live'          ? 'bg-green-400'
                                        : visionStatus === 'stale'       ? 'bg-yellow-400'
                                        : visionStatus === 'visualizing' ? 'bg-blue-400 animate-pulse'
                                        : 'bg-white/20'
                                    }`} />
                                    <span className="text-[10px] text-white/40 capitalize">{visionStatus}</span>
                                    {lastCaptureAt > 0 && (
                                        <span className="text-[10px] text-white/25 ml-auto">
                                            Last: {new Date(lastCaptureAt).toLocaleTimeString()}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button onClick={handleCaptureNow} disabled={!isAwarenessEnabled || capturing}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/5 text-white/50 text-xs hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                <Camera className="w-3.5 h-3.5" />
                                {capturing ? 'Capturing…' : 'Capture Now'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default SoulModule;
