import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useSpeechStore = create(
    persist(
        (set, get) => ({
            // State
            isListening: false,     // Is the microphone active?
            isProcessing: false,    // Is STT/LLM crunching?
            isSpeaking: false,      // Is TTS playing?
            audioLevel: 0,          // 0.0 - 1.0 (Visualizer)
            microphoneBlocked: false, // true when user denied mic permission

            // Devices
            inputDeviceId: 'default',
            outputDeviceId: 'default',

            // Settings
            voiceMode: 'push-to-talk', // 'push-to-talk' | 'always-listening'
            vadSensitivity: 0.5,       // 0.0 (High Threshold) - 1.0 (Low Threshold)
            speechProvider: 'gemini',  // 'gemini' | 'openai'
            voiceVolume: 1.0,
            voiceId: 'alloy',          // OpenAI Voice: alloy, echo, fable, onyx, nova, shimmer
            pttKey: 58,
            pttMouse: 3,

            // Actions
            setIsListening: (val) => set({ isListening: val }),
            setIsProcessing: (val) => set({ isProcessing: val }),
            setIsSpeaking: (val) => set({ isSpeaking: val }),
            setAudioLevel: (val) => set({ audioLevel: val }),
            setMicrophoneBlocked: (val) => set({ microphoneBlocked: val }),

            setInputDeviceId: (id) => set({ inputDeviceId: id }),
            setOutputDeviceId: (id) => set({ outputDeviceId: id }),

            setVoiceMode: (mode) => set({ voiceMode: mode }),
            setVoiceId: (id) => set({ voiceId: id }),
            setVadSensitivity: (val) => set({ vadSensitivity: val }),
            setSpeechProvider: (provider) => set({ speechProvider: provider }),
            setVoiceVolume: (val) => set({ voiceVolume: val }),
        }),
        {
            name: 'ai-familiar-speech-store',
            partialize: (state) => ({
                // Only persist settings, not runtime state
                inputDeviceId: state.inputDeviceId,
                outputDeviceId: state.outputDeviceId,
                voiceMode: state.voiceMode,
                voiceId: state.voiceId,
                vadSensitivity: state.vadSensitivity,
                speechProvider: state.speechProvider,
                voiceVolume: state.voiceVolume,
                pttKey: state.pttKey,
                pttMouse: state.pttMouse,
            }),
        }
    )
);
