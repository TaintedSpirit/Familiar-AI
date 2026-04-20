import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Settings, Cpu, Mic, Eye, History, Zap, Keyboard, User, Image as ImageIcon, Bot, Plug, Hash } from 'lucide-react';
import { useSettingsStore } from '../../services/settings/SettingsStore';
import { useSpeechStore } from '../../services/voice/SpeechStore';
import { audioGraph } from '../../services/voice/AudioGraph';
import { getKeyLabel } from '../../utils/keymap';

const SettingsHUD = ({ onClose, discordConnected = false }) => {
    const {
        aiProvider, setAiProvider,
        model, setModel,
        temperature, setTemperature,
        topP, setTopP,
        topK, setTopK,
        autonomyLevel, setAutonomyLevel,
        geminiApiKey, setGeminiApiKey,
        openaiApiKey, setOpenaiApiKey,
        anthropicApiKey, setAnthropicApiKey,
        activePersona, setActivePersona,
        customPersonaPrompt, setCustomPersonaPrompt,
        companionScale, setCompanionScale,
        toolbarScale, setToolbarScale,
        commandBarOpacity, setCommandBarOpacity,
        chatOpacity, setChatOpacity,
        disableAotOnDrag, setDisableAotOnDrag,
        useOpaqueDrag, setUseOpaqueDrag,
        useIpcDrag, setUseIpcDrag,
        hotkeys, setHotkey,

        // Secondary
        secondaryAiProvider, setSecondaryAiProvider,
        secondaryModel, setSecondaryModel,

        // Discord
        discordBotToken, setDiscordBotToken,
        discordEnabled, setDiscordEnabled,
        discordCompanionChannels, setDiscordCompanionChannels,

        // MCP
        mcpServers, setMcpServers,
    } = useSettingsStore();

    const [activeTab, setActiveTab] = useState('AI');
    const [micTestState, setMicTestState] = useState('idle'); // 'idle', 'recording', 'computing', 'success', 'error'
    const [micTestResult, setMicTestResult] = useState(null);

    // Speech Store
    const {
        voiceMode, setVoiceMode,
        inputDeviceId, setInputDeviceId,
        speechProvider, setSpeechProvider,
        isListening,
        audioLevel
    } = useSpeechStore();

    const [devices, setDevices] = useState([]);

    useEffect(() => {
        // Load Devices
        navigator.mediaDevices.enumerateDevices().then(devs => {
            setDevices(devs.filter(d => d.kind === 'audioinput'));
        });
    }, []);

    const tabs = [
        { id: 'General', label: 'General', icon: Settings },
        { id: 'AI', label: 'AI', icon: Cpu },
        { id: 'Persona', label: 'Persona', icon: User },
        { id: 'Voice', label: 'Voice', icon: Mic },
        { id: 'Vision', label: 'Vision', icon: Eye },
        { id: 'History', label: 'History', icon: History },
        { id: 'Streaming', label: 'Streaming', icon: Zap },
        { id: 'Hotkeys', label: 'Hotkeys', icon: Keyboard },
        { id: 'Discord', label: 'Discord', icon: Bot },
        { id: 'MCP', label: 'MCP', icon: Plug },
    ];

    const renderAIContent = () => (
        <div className="space-y-6">
            <div className="space-y-2">
                <label className="text-xs font-semibold text-white/60 tracking-wider uppercase">AI Provider</label>
                <div className="relative">
                    <select
                        value={aiProvider}
                        onChange={(e) => {
                            setAiProvider(e.target.value);
                            // Reset model default when provider changes
                            if (e.target.value === 'openai') setModel('gpt-4o');
                            else if (e.target.value === 'gemini') setModel('gemini-pro');
                            else if (e.target.value === 'anthropic') setModel('claude-3-sonnet-20240229');
                            else setModel('mistral-7b');
                        }}
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-3 text-white appearance-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                    >
                        <option value="gemini">Google Gemini (Cloud)</option>
                        <option value="openai">OpenAI (Cloud)</option>
                        <option value="anthropic">Anthropic (Claude)</option>
                        <option value="ollama">Ollama (Local)</option>
                        <option value="lm-studio">LM Studio (Local)</option>
                    </select>
                </div>
                <p className="text-xs text-white/30">Choose the AI engine to use for response generation.</p>
            </div>

            {aiProvider === 'gemini' && (
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/60 tracking-wider uppercase">Gemini API Key</label>
                    <input
                        type="password"
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value)}
                        placeholder="AIza..."
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors placeholder-white/10 font-mono text-sm"
                    />
                    <p className="text-xs text-white/30">Stored locally in your browser.</p>
                </div>
            )}

            {aiProvider === 'openai' && (
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/60 tracking-wider uppercase">OpenAI API Key</label>
                    <input
                        type="password"
                        value={openaiApiKey}
                        onChange={(e) => setOpenaiApiKey(e.target.value)}
                        placeholder="sk-..."
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors placeholder-white/10 font-mono text-sm"
                    />
                    <p className="text-xs text-white/30">Stored locally in your browser.</p>
                </div>
            )}

            {aiProvider === 'anthropic' && (
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/60 tracking-wider uppercase">Anthropic API Key</label>
                    <input
                        type="password"
                        value={anthropicApiKey}
                        onChange={(e) => setAnthropicApiKey(e.target.value)}
                        placeholder="sk-ant-..."
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors placeholder-white/10 font-mono text-sm"
                    />
                    <p className="text-xs text-white/30">Stored locally in your browser.</p>
                </div>
            )}

            <div className="space-y-2">
                <label className="text-xs font-semibold text-white/60 tracking-wider uppercase">Model</label>
                <div className="relative">
                    <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-3 text-white appearance-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                    >
                        {aiProvider === 'gemini' && (
                            <>
                                <option value="gemini-pro">gemini-pro (Standard)</option>
                                <option value="gemini-1.5-flash">gemini-1.5-flash (Fast)</option>
                            </>
                        )}
                        {aiProvider === 'openai' && (
                            <>
                                <option value="gpt-4o">gpt-4o (Latest)</option>
                                <option value="gpt-4-turbo">gpt-4-turbo</option>
                                <option value="gpt-3.5-turbo">gpt-3.5-turbo (Fast)</option>
                                <option value="gpt-5.2">gpt-5.2 (Preview)</option>
                            </>
                        )}
                        {aiProvider === 'anthropic' && (
                            <>
                                <option value="claude-3-opus-20240229">Claude 3 Opus (Most Powerful)</option>
                                <option value="claude-3-sonnet-20240229">Claude 3 Sonnet (Balanced)</option>
                                <option value="claude-3-haiku-20240307">Claude 3 Haiku (Fast)</option>
                            </>
                        )}
                        {(aiProvider === 'ollama' || aiProvider === 'lm-studio') && (
                            <>
                                <option value="mistral-7b">mistral-7b (General)</option>
                                <option value="llama-3.1-8b">llama-3.1-8b (Censored/Uncensored)</option>
                                <option value="deepseek-coder">deepseek-coder (Coding)</option>
                            </>
                        )}
                    </select>
                </div>
                <p className="text-xs text-white/30">Select an available model for the active provider.</p>
            </div>

            {/* --- Secondary Provider --- */}
            <div className="pt-6 border-t border-white/5 space-y-6">
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-blue-400/80 tracking-wider uppercase">Secondary Provider (Fallback)</label>
                    <div className="relative">
                        <select
                            value={secondaryAiProvider}
                            onChange={(e) => {
                                setSecondaryAiProvider(e.target.value);
                                // Reset model default when provider changes
                                if (e.target.value === 'openai') setSecondaryModel('gpt-3.5-turbo');
                                else if (e.target.value === 'gemini') setSecondaryModel('gemini-1.5-flash');
                                else if (e.target.value === 'anthropic') setSecondaryModel('claude-3-haiku-20240307');
                                else setSecondaryModel('mistral-7b');
                            }}
                            className="w-full bg-[#1a1a1a] border border-blue-500/20 rounded-lg px-4 py-3 text-white appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                        >
                            <option value="none">None</option>
                            <option value="gemini">Google Gemini (Cloud)</option>
                            <option value="openai">OpenAI (Cloud)</option>
                            <option value="anthropic">Anthropic (Claude)</option>
                            <option value="ollama">Ollama (Local)</option>
                            <option value="lm-studio">LM Studio (Local)</option>
                        </select>
                    </div>
                </div>

                {secondaryAiProvider !== 'none' && (
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-white/60 tracking-wider uppercase">Secondary Model</label>
                        <div className="relative">
                            <select
                                value={secondaryModel}
                                onChange={(e) => setSecondaryModel(e.target.value)}
                                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-3 text-white appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            >
                                {secondaryAiProvider === 'gemini' && (
                                    <>
                                        <option value="gemini-pro">gemini-pro (Standard)</option>
                                        <option value="gemini-1.5-flash">gemini-1.5-flash (Fast)</option>
                                    </>
                                )}
                                {secondaryAiProvider === 'openai' && (
                                    <>
                                        <option value="gpt-4o">gpt-4o (Latest)</option>
                                        <option value="gpt-4-turbo">gpt-4-turbo</option>
                                        <option value="gpt-3.5-turbo">gpt-3.5-turbo (Fast)</option>
                                    </>
                                )}
                                {secondaryAiProvider === 'anthropic' && (
                                    <>
                                        <option value="claude-3-opus-20240229">Claude 3 Opus (Most Powerful)</option>
                                        <option value="claude-3-sonnet-20240229">Claude 3 Sonnet (Balanced)</option>
                                        <option value="claude-3-haiku-20240307">Claude 3 Haiku (Fast)</option>
                                    </>
                                )}
                                {(secondaryAiProvider === 'ollama' || secondaryAiProvider === 'lm-studio') && (
                                    <>
                                        <option value="mistral-7b">mistral-7b (General)</option>
                                        <option value="llama-3.1-8b">llama-3.1-8b (Censored/Uncensored)</option>
                                    </>
                                )}
                            </select>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex gap-4 pt-2">
                <button className="px-4 py-2 bg-purple-500/10 border border-purple-500/20 text-purple-200 rounded-lg text-sm hover:bg-purple-500/20 transition-colors">
                    Hide advanced options
                </button>
                <button className="px-4 py-2 bg-white/5 border border-white/10 text-white/60 rounded-lg text-sm hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    Image settings
                </button>
            </div>

            {/* Sliders */}
            <div className="space-y-8 pt-4">
                <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-white/80 font-medium">Temperature: {temperature}</span>
                    </div>
                    <input
                        type="range"
                        min="0" max="2" step="0.1"
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500"
                    />
                    <div className="flex justify-between text-[10px] text-white/30 font-medium uppercase tracking-wider">
                        <span>Predictable</span>
                        <span>Creative</span>
                    </div>
                    <p className="text-xs text-white/40">Controls the creativity of responses. Lower values yield more consistent responses.</p>
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-white/80 font-medium">Top-P (diversity): {topP}</span>
                    </div>
                    <input
                        type="range"
                        min="0" max="1" step="0.01"
                        value={topP}
                        onChange={(e) => setTopP(parseFloat(e.target.value))}
                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500"
                    />
                    <div className="flex justify-between text-[10px] text-white/30 font-medium uppercase tracking-wider">
                        <span>Focused</span>
                        <span>Diverse</span>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-white/80 font-medium">Top-K (token limit): {topK}</span>
                    </div>
                    <input
                        type="range"
                        min="1" max="100" step="1"
                        value={topK}
                        onChange={(e) => setTopK(parseInt(e.target.value))}
                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500"
                    />
                </div>

                <div className="space-y-3 pt-6 border-t border-white/5">
                    <div className="flex justify-between text-sm items-center">
                        <span className="text-white/80 font-medium">Neural Autonomy (Trust Dial)</span>
                        <span className="text-xs text-blue-400 font-mono tracking-wider">{autonomyLevel}%</span>
                    </div>
                    <div className="relative">
                        <input
                            type="range"
                            min="0" max="100" step="1"
                            value={autonomyLevel}
                            onChange={(e) => setAutonomyLevel(parseInt(e.target.value))}
                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
                        />
                        <div className="absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent pointer-events-none" />
                    </div>
                    <div className="flex justify-between text-[10px] text-white/30 font-medium uppercase tracking-wider">
                        <span>Validation Mode</span>
                        <span>Auto-Execute</span>
                    </div>
                    <p className="text-xs text-white/40">
                        {autonomyLevel < 40 && "Agent will ask for confirmation before drafting or deciding."}
                        {autonomyLevel >= 40 && autonomyLevel < 80 && "Agent will proactively draft code and suggest plans."}
                        {autonomyLevel >= 80 && "Agent has high agency to execute standard tasks immediately."}
                    </p>
                </div>
            </div>
        </div >
    );

    const renderVoiceContent = () => (
        <div className="space-y-8">
            <div className="p-4 bg-purple-500/10 rounded-xl border border-purple-500/20 flex gap-4 items-center">
                <div className={`p-3 rounded-full ${isListening ? 'bg-green-500 text-white animate-pulse' : 'bg-white/10 text-white/40'}`}>
                    <Mic size={20} />
                </div>
                <div>
                    <h4 className="text-sm font-bold text-white">Voice System v2</h4>
                    <p className="text-xs text-white/40">New architecture. Low latency, energy-based VAD.</p>
                </div>
                <div className="ml-auto flex gap-2">
                    <button
                        onClick={() => isListening ? audioGraph.stopInput() : audioGraph.startInput(inputDeviceId)}
                        className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs font-bold transition-colors"
                    >
                        {isListening ? 'Stop Mic' : 'Start Mic'}
                    </button>
                </div>
            </div>

            {/* Level Meter */}
            <div className="space-y-2">
                <div className="flex justify-between text-xs text-white/40">
                    <span>Input Level</span>
                    <span>{Math.round(audioLevel * 100)}%</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                        animate={{ width: `${audioLevel * 100}%` }}
                        transition={{ type: 'tween', ease: 'linear', duration: 0.1 }}
                        className={`h-full ${audioLevel > 0.5 ? 'bg-red-500' : 'bg-green-500'}`}
                    />
                </div>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/60 uppercase">Input Device</label>
                    <select
                        value={inputDeviceId}
                        onChange={(e) => setInputDeviceId(e.target.value)}
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-3 text-white appearance-none"
                    >
                        <option value="default">Default System Device</option>
                        {devices.map(d => (
                            <option key={d.deviceId} value={d.deviceId}>{d.label || `Device ${d.deviceId.slice(0, 5)}...`}</option>
                        ))}
                    </select>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/60 uppercase">Voice Mode</label>
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => setVoiceMode('push-to-talk')}
                            className={`p-4 rounded-xl border text-left transition-all ${voiceMode === 'push-to-talk' ? 'bg-blue-500/20 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-white/40'}`}
                        >
                            <div className="font-bold text-sm">Push to Talk</div>
                            <div className="text-[10px] opacity-60">Hold mic button to speak</div>
                        </button>
                        <button
                            onClick={() => setVoiceMode('always-listening')}
                            className={`p-4 rounded-xl border text-left transition-all ${voiceMode === 'always-listening' ? 'bg-blue-500/20 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-white/40'}`}
                        >
                            <div className="font-bold text-sm">Always Listening</div>
                            <div className="text-[10px] opacity-60">Auto-detect speech (VAD)</div>
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/60 uppercase">Speech Provider</label>
                    <select
                        value={speechProvider}
                        onChange={(e) => setSpeechProvider(e.target.value)}
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-3 text-white appearance-none"
                    >
                        <option value="gemini">Google Gemini (Multimodal)</option>
                        <option value="openai">OpenAI Whisper/TTS</option>
                    </select>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/60 uppercase">Companion Voice</label>
                    <div className="relative">
                        <select
                            value={useSpeechStore.getState().voiceId}
                            onChange={(e) => useSpeechStore.getState().setVoiceId(e.target.value)}
                            className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-3 text-white appearance-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                        >
                            <option value="alloy">Alloy (Neutral)</option>
                            <option value="echo">Echo (Male)</option>
                            <option value="fable">Fable (British)</option>
                            <option value="onyx">Onyx (Deep Male)</option>
                            <option value="nova">Nova (Female)</option>
                            <option value="shimmer">Shimmer (Female)</option>
                        </select>
                    </div>
                    <p className="text-xs text-white/30">Select the vocal personality.</p>
                </div>
            </div>
        </div>
    );

    const renderVisionContent = () => (
        <div className="space-y-6">
            <div className="p-4 bg-blue-500/10 rounded-xl border border-blue-500/20 flex gap-3">
                <div className="text-blue-400 mt-0.5"><Eye size={18} /></div>
                <div className="space-y-1">
                    <h4 className="text-sm font-bold text-blue-200">Vision System Active</h4>
                    <p className="text-xs text-blue-200/60 leading-relaxed">
                        The agent can see your screen when requested.
                        Toggle "Awareness" in the Companion Menu (hover over the blob) to enable/disable visual inputs.
                    </p>
                </div>
            </div>

            <div className="space-y-2 opacity-50 pointer-events-none">
                <label className="text-xs font-semibold text-white/60 tracking-wider uppercase">Auto-Capture Interval</label>
                <select className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-3 text-white appearance-none">
                    <option>Manual Only (Default)</option>
                    <option>Every 30s</option>
                    <option>Every 5m</option>
                </select>
            </div>
        </div>
    );

    const renderHotkeysContent = () => {
        const HotkeyRecorder = ({ actionId, label }) => {
            const config = hotkeys[actionId] || { key: 'Unbound', type: 'keyboard' };
            const [isRecording, setIsRecording] = useState(false);

            useEffect(() => {
                if (!isRecording || !window.electronAPI) return;

                const handleKeydown = (e, data) => {
                    const isModifier = [29, 42, 54, 56, 3675, 3676].includes(data.keycode);
                    if (isModifier) return;

                    const labelParts = [];
                    if (data.ctrlKey) labelParts.push('Ctrl');
                    if (data.altKey) labelParts.push('Alt');
                    if (data.shiftKey) labelParts.push('Shift');
                    if (data.metaKey) labelParts.push('Meta');
                    labelParts.push(getKeyLabel(data.keycode));

                    setHotkey(actionId, {
                        keycode: data.keycode,
                        modifiers: { ctrl: !!data.ctrlKey, alt: !!data.altKey, shift: !!data.shiftKey, meta: !!data.metaKey },
                        type: 'keyboard',
                        label: labelParts.join(' + ')
                    });
                    setIsRecording(false);
                };

                const handleMousedown = (e, data) => {
                    const btnMap = ['Left Click', 'Middle Click', 'Right Click', 'Mouse 4', 'Mouse 5'];
                    setHotkey(actionId, {
                        button: data.button,
                        type: 'mouse',
                        label: btnMap[data.button] || `Mouse ${data.button}`
                    });
                    setIsRecording(false);
                };

                const removeKey = window.electronAPI.on('global-hotkey-down', handleKeydown);
                const removeMouse = window.electronAPI.on('global-mouse-down', handleMousedown);

                return () => {
                    removeKey?.();
                    removeMouse?.();
                };
            }, [isRecording, actionId]);

            return (
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 group hover:border-white/20 transition-colors">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isRecording ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-white/5 text-white/40'}`}>
                            {config.type === 'mouse' ? <Mic size={16} /> : <Keyboard size={16} />}
                        </div>
                        <div>
                            {/* Actions Label (What it does) */}
                            <div className="text-sm font-medium text-white">{label}</div>
                            {/* Key Label (What is bound) */}
                            <div className="text-[10px] text-white/40">
                                {isRecording
                                    ? 'Press combination...'
                                    : (config.label || config.key || 'Unbound')
                                }
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsRecording(true)}
                            className={`relative min-w-[100px] px-4 py-2 rounded-lg text-xs font-bold font-mono border transition-all
                                ${isRecording
                                    ? 'bg-red-500/10 border-red-500 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                                    : 'bg-black/40 border-white/10 text-white/60 hover:text-white hover:border-white/30'
                                }`}
                        >
                            {isRecording ? 'LISTENING' : (config.label || config.key || 'Bind')}

                            {/* Conflict Indicator — skip unbound entries (null keycode) */}
                            {!isRecording && config.keycode != null && Object.entries(hotkeys).find(([id, c]) => id !== actionId && c.keycode === config.keycode && JSON.stringify(c.modifiers) === JSON.stringify(config.modifiers)) && (
                                <div className="absolute -top-2 -right-2 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center text-[10px] text-black font-bold" title="Conflict!">!</div>
                            )}
                        </button>

                        {config.keycode != null && !isRecording && (
                            <button
                                onClick={() => setHotkey(actionId, { keycode: null, label: 'Unbound', type: 'keyboard', modifiers: { ctrl: false, alt: false, shift: false, meta: false } })}
                                className="px-2 py-2 rounded-lg text-[10px] text-white/30 hover:text-red-400 border border-white/5 hover:border-red-500/30 transition-all"
                                title="Unbind"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {isRecording && (
                        <div className="fixed inset-0 z-[100] cursor-crosshair bg-black/20"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsRecording(false); // Cancel on click away
                            }}
                        />
                    )}
                </div>
            );
        };

        return (
            <div className="space-y-6">
                <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-white">Global Hotkeys</h3>
                    <p className="text-xs text-white/40">These shortcuts work even when the app is in the background.</p>
                </div>

                <div className="grid gap-4">
                    <HotkeyRecorder actionId="micHold" label="Push-to-Talk (Hold)" />
                    <HotkeyRecorder actionId="micToggle" label="Voice Toggle (Click)" />
                    <HotkeyRecorder actionId="toggleChat" label="Toggle Chat Window" />
                    <HotkeyRecorder actionId="toggleSettings" label="Toggle Settings" />
                    <HotkeyRecorder actionId="stopSpeaking" label="Stop Speaking / Interrupt" />
                </div>

                <div className="p-4 bg-orange-500/10 rounded-xl border border-orange-500/20 flex gap-3">
                    <div className="text-orange-400 mt-0.5"><Settings size={14} /></div>
                    <div className="space-y-1">
                        <h4 className="text-xs font-bold text-orange-200">System Permissions</h4>
                        <p className="text-[10px] text-orange-200/60 leading-relaxed">
                            Global shortcuts (like CapsLock) may require elevated permissions or Accessibility access on some OS configurations if they stop working.
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    const renderPersonaContent = () => {
        const personas = [
            { id: 'auto', label: 'Auto (Dynamic)', desc: 'Automatically adapts role based on conversation context (Default).' },
            { id: 'architect', label: 'Architect (Thinker)', desc: 'Owns system intent and correctness. Defines Inner World semantics and rules. Purely declarative.' },
            { id: 'auditor', label: 'Auditor agent', desc: 'Safety barrier. Verifies determinism, reversibility, and read-only guarantees. Blocks unsafe changes.' },
            { id: 'builder', label: 'Builder', desc: 'Pragmatic implementation focus. Writes clean, efficient code.' },
            { id: 'consultant', label: 'Consultant', desc: 'Creative partner with strong opinions. Offers specific advice and critiques.' },
            { id: 'companion', label: 'Companion', desc: 'Warm, intellectual partner interested in your process. Maintains creative flow.' },
            { id: 'researcher', label: 'Researcher', desc: 'Thorough syntax and fact synthesis. Precise and dense outputs.' },
            { id: 'strategist', label: 'Strategist', desc: 'Focuses on second-order effects and high-leverage paths.' },
            { id: 'editor', label: 'Editor', desc: 'Refines text for clarity, tone, and impact.' },
            { id: 'custom', label: 'Custom', desc: 'Write your own system persona below.' },
        ];

        return (
            <div className="space-y-6">
                <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-white">Active System Persona</h3>
                    <p className="text-xs text-white/40">Force a specific personality/role or let the system adapt dynamically.</p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                    {personas.map(p => (
                        <button
                            key={p.id}
                            onClick={() => setActivePersona(p.id)}
                            className={`flex flex-col items-start p-4 rounded-xl border transition-all text-left group
                                ${activePersona === p.id
                                    ? 'bg-purple-500/10 border-purple-500 shadow-lg shadow-purple-500/10'
                                    : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20'}`}
                        >
                            <div className="flex w-full justify-between items-center mb-1">
                                <span className={`text-sm font-bold ${activePersona === p.id ? 'text-purple-200' : 'text-white/80'}`}>
                                    {p.label}
                                </span>
                                {activePersona === p.id && (
                                    <span className="text-[10px] uppercase bg-purple-500 text-white px-2 py-0.5 rounded font-bold tracking-wider">
                                        Active
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-white/40 group-hover:text-white/60 transition-colors leading-relaxed">
                                {p.desc}
                            </p>
                        </button>
                    ))}
                </div>

                {activePersona === 'custom' && (
                    <div className="space-y-2 pt-2">
                        <label className="text-xs font-semibold text-purple-400/80 tracking-wider uppercase">Custom Persona Prompt</label>
                        <textarea
                            value={customPersonaPrompt}
                            onChange={(e) => setCustomPersonaPrompt(e.target.value)}
                            placeholder="ROLE: You are a... Describe the personality, tone, and behavior rules."
                            rows={6}
                            className="w-full bg-[#1a1a1a] border border-purple-500/30 rounded-lg px-4 py-3 text-white text-xs font-mono focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors placeholder-white/10 resize-none leading-relaxed"
                        />
                        <p className="text-[10px] text-white/30">Injected as the ROLE section of the system prompt. Be specific about tone, format, and limits.</p>
                    </div>
                )}
            </div>
        );
    };

    const renderGeneralContent = () => (
        <div className="space-y-6">
            <Settings className="w-12 h-12 text-white/10 mx-auto" />

            <div className="space-y-2 text-center">
                <h3 className="text-lg font-medium text-white">General Settings</h3>
                <p className="text-sm text-white/40">Configure your companion's appearance.</p>
            </div>

            <div className="bg-white/5 p-4 rounded-xl border border-white/10 space-y-4">
                {/* Companion Scale */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-white/60 tracking-wider uppercase">Companion Size</label>
                        <span className="text-xs font-mono text-cyan-400">{companionScale?.toFixed(1) || '1.0'}x</span>
                    </div>
                    <input
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.1"
                        value={companionScale || 1.0}
                        onChange={(e) => setCompanionScale(parseFloat(e.target.value))}
                        className="w-full h-2 bg-black/40 rounded-lg appearance-none cursor-pointer hover:bg-black/60 transition-colors accent-cyan-400"
                    />
                    <div className="flex justify-between text-[10px] text-white/20 font-mono">
                        <span>0.5x</span>
                        <span>1.0x</span>
                        <span>2.0x</span>
                    </div>
                </div>

                {/* Toolbar Scale */}
                <div className="space-y-2 border-t border-white/5 pt-4">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-white/60 tracking-wider uppercase">Toolbar Size</label>
                        <span className="text-xs font-mono text-purple-400">{toolbarScale?.toFixed(1) || '1.0'}x</span>
                    </div>
                    <input
                        type="range"
                        min="0.5"
                        max="1.5"
                        step="0.1"
                        value={toolbarScale || 1.0}
                        onChange={(e) => setToolbarScale(parseFloat(e.target.value))}
                        className="w-full h-2 bg-black/40 rounded-lg appearance-none cursor-pointer hover:bg-black/60 transition-colors accent-purple-400"
                    />
                </div>

                {/* Opacity Controls */}
                <div className="space-y-4 border-t border-white/5 pt-4">
                    {/* Command Bar Opacity */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-semibold text-white/60 tracking-wider uppercase">Command Bar Opacity</label>
                            <span className="text-xs font-mono text-purple-400">{Math.round((commandBarOpacity || 1.0) * 100)}%</span>
                        </div>
                        <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.05"
                            value={commandBarOpacity !== undefined ? commandBarOpacity : 1.0}
                            onChange={(e) => setCommandBarOpacity(parseFloat(e.target.value))}
                            className="w-full h-2 bg-black/40 rounded-lg appearance-none cursor-pointer hover:bg-black/60 transition-colors accent-purple-400"
                        />
                    </div>

                    {/* Chat Window Opacity */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-semibold text-white/60 tracking-wider uppercase">Chat Window Opacity</label>
                            <span className="text-xs font-mono text-blue-400">{Math.round((chatOpacity || 1.0) * 100)}%</span>
                        </div>
                        <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.05"
                            value={chatOpacity !== undefined ? chatOpacity : 1.0}
                            onChange={(e) => setChatOpacity(parseFloat(e.target.value))}
                            className="w-full h-2 bg-black/40 rounded-lg appearance-none cursor-pointer hover:bg-black/60 transition-colors accent-blue-400"
                        />
                    </div>

                    {/* Window & Dragging */}
                    <div className="space-y-4 border-t border-white/5 pt-4">
                        <h4 className="text-xs font-semibold text-white/60 tracking-wider uppercase mb-2">Window Performance</h4>

                        {/* Disable AOT Toggle */}
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-white/80">Disable AOT on Drag</label>
                            <button
                                onClick={() => setDisableAotOnDrag(!disableAotOnDrag)}
                                className={`w-8 h-4 rounded-full transition-colors relative ${disableAotOnDrag ? 'bg-green-500/50' : 'bg-white/10'}`}
                            >
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${disableAotOnDrag ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {/* Opaque Drag Toggle */}
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-white/80">Opaque Background on Drag</label>
                            <button
                                onClick={() => setUseOpaqueDrag(!useOpaqueDrag)}
                                className={`w-8 h-4 rounded-full transition-colors relative ${useOpaqueDrag ? 'bg-green-500/50' : 'bg-white/10'}`}
                            >
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${useOpaqueDrag ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {/* IPC Drag Toggle */}
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-white/80">Use Manual IPC Drag (Fix Freeze)</label>
                            <button
                                onClick={() => setUseIpcDrag(!useIpcDrag)}
                                className={`w-8 h-4 rounded-full transition-colors relative ${useIpcDrag ? 'bg-green-500/50' : 'bg-white/10'}`}
                            >
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${useIpcDrag ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>


            <div className="text-xs text-white/20 font-mono text-center pt-8">v1.0.0-alpha</div>
        </div>
    );

    const renderHistoryContent = () => (
        <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
            <History className="w-12 h-12 text-white/10" />
            <div>
                <h3 className="text-lg font-medium text-white">Conversation History</h3>
                <p className="text-sm text-white/40">View and manage past interactions.</p>
            </div>
            <button className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-white/60 transition-colors">
                Clear Local Cache
            </button>
        </div>
    );

    const renderStreamingContent = () => (
        <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
            <Zap className="w-12 h-12 text-white/10" />
            <div>
                <h3 className="text-lg font-medium text-white">Streaming & Overlay</h3>
                <p className="text-sm text-white/40"> OBS integration and transparency settings.</p>
            </div>
        </div>
    );

    const renderDiscordContent = () => {
        const channelText = (discordCompanionChannels || []).join(', ');

        const handleChannelChange = (val) => {
            const ids = val.split(',').map(s => s.trim()).filter(Boolean);
            setDiscordCompanionChannels(ids);
        };

        return (
            <div className="space-y-6">
                {/* Status Banner */}
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                    discordConnected
                        ? 'bg-green-500/10 border-green-500/20'
                        : 'bg-white/5 border-white/10'
                }`}>
                    <Plug className={`w-4 h-4 shrink-0 ${discordConnected ? 'text-green-400' : 'text-white/30'}`} />
                    <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${discordConnected ? 'text-green-300' : 'text-white/50'}`}>
                            {discordConnected ? 'Connected' : 'Disconnected'}
                        </p>
                        <p className="text-[10px] text-white/30">
                            {discordConnected ? 'Your companion is reachable on Discord.' : 'Enable the bot and add a token to connect.'}
                        </p>
                    </div>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${discordConnected ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]' : 'bg-white/20'}`} />
                </div>

                {/* Enable Toggle */}
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-indigo-500/10">
                            <Bot className="w-4 h-4 text-indigo-400" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-white">Enable Discord Bot</p>
                            <p className="text-[10px] text-white/40">Start the bot when the app is open</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setDiscordEnabled(!discordEnabled)}
                        className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${discordEnabled ? 'bg-indigo-500/70' : 'bg-white/10'}`}
                    >
                        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${discordEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>

                {/* Bot Token */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/60 tracking-wider uppercase">Bot Token</label>
                    <input
                        type="password"
                        value={discordBotToken || ''}
                        onChange={(e) => setDiscordBotToken(e.target.value)}
                        placeholder="Bot token from discord.com/developers"
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors placeholder-white/10 font-mono text-sm"
                    />
                    <p className="text-xs text-white/30">Stored locally. Never sent anywhere except Discord's API.</p>
                </div>

                {/* Companion Channels */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/60 tracking-wider uppercase flex items-center gap-1.5">
                        <Hash className="w-3 h-3" />
                        Companion Channels
                    </label>
                    <textarea
                        value={channelText}
                        onChange={(e) => handleChannelChange(e.target.value)}
                        placeholder="123456789012345678, 987654321098765432"
                        rows={3}
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors placeholder-white/10 font-mono text-sm resize-none"
                    />
                    <p className="text-xs text-white/30 leading-relaxed">
                        Comma-separated channel IDs where the bot replies to <span className="text-white/50">every</span> message — not just @mentions. Right-click a channel in Discord and choose <span className="text-white/50">Copy Channel ID</span> (enable Developer Mode in Discord settings first).
                    </p>
                </div>

                {/* Info box */}
                <div className="p-4 bg-indigo-500/10 rounded-xl border border-indigo-500/20 flex gap-3">
                    <Bot className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                        <h4 className="text-xs font-bold text-indigo-200">How triggers work</h4>
                        <p className="text-[10px] text-indigo-200/60 leading-relaxed">
                            The bot always responds to DMs and @mentions in any server. Add channel IDs above to also respond to all messages in those channels. Memory is isolated per channel — DMs and each guild channel have their own history. Soul identity is shared everywhere.
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-8"
            onClick={(e) => e.target === e.currentTarget && onClose()}
            onPointerDown={(e) => e.stopPropagation()} // Prevent dragging/interacting with underlying window
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-2xl bg-[#0f0f12] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[800px] max-h-[85vh]"
            >
                {/* Header */}
                <div className="px-6 py-4 flex justify-between items-center border-b border-white/5 bg-[#0f0f12]">
                    <h2 className="text-xl font-bold text-white tracking-wide">Configuration</h2>
                    <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation */}
                <div className="flex overflow-x-auto px-6 py-2 border-b border-white/5 gap-6 scrollbar-none">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 py-3 text-sm font-medium transition-colors relative whitespace-nowrap
                                ${activeTab === tab.id ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
                        >
                            {/* <tab.icon className="w-4 h-4" /> */}
                            {tab.label}
                            {activeTab === tab.id && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                                />
                            )}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    {activeTab === 'General' && renderGeneralContent()}
                    {activeTab === 'AI' && renderAIContent()}
                    {activeTab === 'Persona' && renderPersonaContent()}
                    {activeTab === 'Voice' && renderVoiceContent()}
                    {activeTab === 'Vision' && renderVisionContent && renderVisionContent()}
                    {activeTab === 'History' && renderHistoryContent()}
                    {activeTab === 'Streaming' && renderStreamingContent()}
                    {activeTab === 'Hotkeys' && renderHotkeysContent()}
                    {activeTab === 'Discord' && renderDiscordContent()}
                </div>

            </motion.div>
        </motion.div>
    );
};

export default SettingsHUD;
