import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useSettingsStore = create(
    persist(
        (set) => ({
            // Providers & Models
            aiProvider: 'gemini',
            model: 'gemini-1.5-flash',
            geminiApiKey: '',
            openaiApiKey: '',
            anthropicApiKey: '', // ADDED: Match HUD usage

            // Secondary Provider (Fallback or Specialized)
            secondaryAiProvider: 'openai',
            secondaryModel: 'gpt-3.5-turbo',
            secondaryAnthropicApiKey: '',

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
            
            // API Keys
            setGeminiApiKey: (key) => set({ geminiApiKey: key }),
            setOpenaiApiKey: (key) => set({ openaiApiKey: key }),
            setAnthropicApiKey: (key) => set({ anthropicApiKey: key }), // ADDED: Match HUD
            
            customPersonaPrompt: '',
            setCustomPersonaPrompt: (text) => set({ customPersonaPrompt: text }),

            // Advanced LLM Tuning (OpenClaw Parity)
            maxTokens: 4096,
            presencePenalty: 0,
            frequencyPenalty: 0,
            setMaxTokens: (val) => set({ maxTokens: val }),
            setPresencePenalty: (val) => set({ presencePenalty: val }),
            setFrequencyPenalty: (val) => set({ frequencyPenalty: val }),

            // Auth Cooldowns (OpenClaw Parity)
            authCooldowns: {
                billingBackoffHours: 1,
                billingBackoffCapHours: 24,
                cooldownWindowHours: 24,
                activeBackoffs: {}, // serverId -> timestamp
            },
            setAuthCooldowns: (config) => set(state => ({
                authCooldowns: { ...state.authCooldowns, ...config }
            })),

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

            // Docker Sandbox (Track 1)
            dockerEnabled: false,
            setDockerEnabled: (val) => set({ dockerEnabled: val }),

            // Tool Policy — per-tool: 'allow' | 'ask' | 'deny'
            toolPolicies: {
                write_file: 'ask',
                run_command: 'ask',
                execute_sandboxed: 'ask',
            },
            setToolPolicy: (tool, policy) => set(state => ({
                toolPolicies: { ...state.toolPolicies, [tool]: policy }
            })),

            // Allowed write paths — if non-empty, write_file is auto-approved for these prefixes
            allowedWritePaths: [],
            setAllowedWritePaths: (paths) => set({ allowedWritePaths: paths }),

            // Cron & Webhooks (Track 2)
            webhookEnabled: false,
            webhookPort: 3001,
            setWebhookEnabled: (val) => set({ webhookEnabled: val }),
            setWebhookPort: (port) => set({ webhookPort: port }),

            // Omni-Channel (Track 3)
            telegramEnabled: false,
            telegramBotToken: '',
            telegramUserId: '',
            setTelegramEnabled: (val) => set({ telegramEnabled: val }),
            setTelegramBotToken: (token) => set({ telegramBotToken: token }),
            setTelegramUserId: (id) => set({ telegramUserId: id }),

            // Media Generation (Track 4)
            imageGenProvider: 'openai',
            liveCanvasEnabled: true,
            setImageGenProvider: (p) => set({ imageGenProvider: p }),
            setLiveCanvasEnabled: (val) => set({ liveCanvasEnabled: val }),
            stabilityApiKey: '',
            setStabilityApiKey: (key) => set({ stabilityApiKey: key }),

            // Onboarding
            hasOnboarded: false,
            setHasOnboarded: (val) => set({ hasOnboarded: val }),

            // Familiar Identity
            familiarName: '',
            setFamiliarName: (name) => set({ familiarName: name }),

            // Context Management
            maxMessageHistory: 0, // 0 = unlimited; agent will summarize when exceeded
            setMaxMessageHistory: (n) => set({ maxMessageHistory: n }),

            // Soul Profile — generated by the Grimoire questionnaire
            soulProfile: null,
            setSoulProfile: (profile) => set({ soulProfile: profile }),

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

            // Global Environment & System Config (OpenClaw Parity)
            globalEnv: {}, // Record<string, string>
            setGlobalEnv: (env) => set({ globalEnv: env }),
            
            logLevel: 'info', // 'debug' | 'info' | 'warn' | 'error'
            setLogLevel: (level) => set({ logLevel: level }),

            browserConfig: {
                headless: false,
                profile: 'default',
                remoteDebuggingPort: 9222
            },
            setBrowserConfig: (config) => set(state => ({
                browserConfig: { ...state.browserConfig, ...config }
            })),
        }),
        {
            name: 'ai-familiar-settings',
        }
    )
);
