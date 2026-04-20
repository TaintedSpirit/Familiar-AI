import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useSettingsStore = create(
    persist(
        (set) => ({
            aiProvider: 'gemini',
            model: 'gemini-1.5-flash',

            // Secondary Provider (Fallback or Specialized)
            secondaryAiProvider: 'openai',
            secondaryModel: 'gpt-3.5-turbo',

            temperature: 0.7,
            topP: 0.95,
            companionScale: 1.0,
            toolbarScale: 1.0,
            commandBarOpacity: 1.0,
            chatOpacity: 1.0,

            // Drag & Window Settings
            dragMode: 'manual', // 'native' (Framer) vs 'manual' (Custom Pointer)
            disableAotOnDrag: true,
            useOpaqueDrag: false,
            useIpcDrag: true, // DEFAULT ON for test phase

            // Actions
            setDragMode: (mode) => set({ dragMode: mode }),
            setDisableAotOnDrag: (val) => set({ disableAotOnDrag: val }),
            setUseOpaqueDrag: (val) => set({ useOpaqueDrag: val }),
            setUseIpcDrag: (val) => set({ useIpcDrag: val }),

            setAiProvider: (provider) => set({ aiProvider: provider }),
            setModel: (model) => set({ model }),
            setSecondaryAiProvider: (provider) => set({ secondaryAiProvider: provider }),
            setSecondaryModel: (model) => set({ secondaryModel: model }),
            setTemperature: (temperature) => set({ temperature }),
            setTopP: (topP) => set({ topP }),
            setTopK: (topK) => set({ topK }),
            setAutonomyLevel: (autonomyLevel) => set({ autonomyLevel }),
            setGeminiApiKey: (key) => set({ geminiApiKey: key }),
            setOpenaiApiKey: (key) => set({ openaiApiKey: key }),
            customPersonaPrompt: '',
            setCustomPersonaPrompt: (text) => set({ customPersonaPrompt: text }),

            // Discord Bot
            discordBotToken: '',
            discordEnabled: false,
            discordCompanionChannels: [],
            setDiscordBotToken: (token) => set({ discordBotToken: token }),
            setDiscordEnabled: (enabled) => set({ discordEnabled: enabled }),
            setDiscordCompanionChannels: (channels) => set({ discordCompanionChannels: channels }),

            // MCP Servers Configuration
            mcpServers: {}, // Example: { sqlite: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', 'test.db'] } }
            setMcpServers: (servers) => set({ mcpServers: servers }),

            // Transient fallback state (not meaningful to persist, but that's fine)
            fallbackActive: false,
            fallbackReason: null,
            setFallbackState: (active, reason = null) => set({ fallbackActive: active, fallbackReason: reason }),

            setVoiceEnabled: (enabled) => set({ voiceEnabled: enabled }),
            setActivePersona: (persona) => set({ activePersona: persona }),
            setCompanionScale: (scale) => set({ companionScale: scale }),
            setToolbarScale: (scale) => set({ toolbarScale: scale }),
            setCommandBarOpacity: (opacity) => set({ commandBarOpacity: opacity }),
            setChatOpacity: (opacity) => set({ chatOpacity: opacity }),

            // Hotkeys
            hotkeys: {
                micHold: { keycode: 58, label: 'CapsLock', type: 'keyboard', modifiers: { ctrl: false, alt: false, shift: false, meta: false } },
                micToggle: { keycode: null, label: 'Unbound', type: 'keyboard', modifiers: { ctrl: false, alt: false, shift: false, meta: false } },
                toggleChat: { keycode: null, label: 'Unbound', type: 'keyboard', modifiers: { ctrl: false, alt: false, shift: false, meta: false } },
                toggleSettings: { keycode: null, label: 'Unbound', type: 'keyboard', modifiers: { ctrl: false, alt: false, shift: false, meta: false } },
                stopSpeaking: { keycode: null, label: 'Unbound', type: 'keyboard', modifiers: { ctrl: false, alt: false, shift: false, meta: false } }
            },
            setHotkey: (id, config) => set((state) => ({
                hotkeys: { ...state.hotkeys, [id]: config }
            })),
        }),
        {
            name: 'ai-familiar-settings',
        }
    )
);
