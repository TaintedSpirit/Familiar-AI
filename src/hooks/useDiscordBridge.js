import { useEffect, useRef, useState } from 'react';
import { agentLoop } from '../services/agent/AgentLoop';
import { useSettingsStore } from '../services/settings/SettingsStore';

const HISTORY_MAX = 30;
const STORAGE_PREFIX = 'discord_history_';

function loadHistory(key) {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_PREFIX + key) || '[]');
    } catch {
        return [];
    }
}

function saveHistory(key, history) {
    const trimmed = history.slice(-HISTORY_MAX);
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(trimmed));
}

function clearHistory(key) {
    localStorage.removeItem(STORAGE_PREFIX + key);
}

export function useDiscordBridge() {
    const [isConnected, setIsConnected] = useState(false);
    const [sessionCount, setSessionCount] = useState(0);
    const processingRef = useRef(new Set());
    // Per-session think levels: sessionKey -> 'low' | 'medium' | 'high'
    const thinkLevels = useRef(new Map());

    const { discordEnabled, discordBotToken, discordCompanionChannels, aiProvider, model } = useSettingsStore();

    const api = window.electronAPI;
    const hasDiscordAPI = !!(api?.discordStart && api?.discordStop && api?.discordReply && api?.onDiscordMessage);

    // Start / stop the bot when settings change
    useEffect(() => {
        if (!hasDiscordAPI) return;

        if (discordEnabled && discordBotToken) {
            api.discordStart(discordBotToken, discordCompanionChannels)
                .then(() => setIsConnected(true))
                .catch((err) => {
                    console.error('[DiscordBridge] Start failed:', err);
                    setIsConnected(false);
                });
        } else {
            api.discordStop()
                .then(() => setIsConnected(false))
                .catch(() => {});
        }
    }, [discordEnabled, discordBotToken, discordCompanionChannels, hasDiscordAPI]);

    // Update companion channels live without restarting
    useEffect(() => {
        if (!hasDiscordAPI || !isConnected) return;
        api.discordUpdateChannels(discordCompanionChannels);
    }, [discordCompanionChannels, isConnected, hasDiscordAPI]);

    // Listen for incoming Discord messages and reply
    useEffect(() => {
        if (!hasDiscordAPI) return;

        const cleanup = api.onDiscordMessage(async (data) => {
            const { msgId, channelId, userId, username, content, isDM } = data;

            // Deduplicate rapid re-fires
            if (processingRef.current.has(msgId)) return;
            processingRef.current.add(msgId);

            // Per-user session isolation: DMs keyed by user, channels by user+channel
            const sessionKey = isDM ? `dm_${userId}` : `${channelId}_${userId}`;

            try {
                // ── Command handling ────────────────────────────────────────────
                if (content.startsWith('/')) {
                    const [cmd, ...args] = content.slice(1).split(/\s+/);

                    switch (cmd.toLowerCase()) {
                        case 'new':
                        case 'reset': {
                            clearHistory(sessionKey);
                            thinkLevels.current.delete(sessionKey);
                            api.discordReply(channelId, 'Session cleared. Fresh start.');
                            return;
                        }
                        case 'status': {
                            const history = loadHistory(sessionKey);
                            const thinkLevel = thinkLevels.current.get(sessionKey) || 'default';
                            const reply = [
                                `**Status** ✓`,
                                `Provider: ${aiProvider || 'gemini'} / ${model || 'default'}`,
                                `Session messages: ${history.length}`,
                                `Think level: ${thinkLevel}`,
                                `Sessions handled: ${sessionCount}`,
                            ].join('\n');
                            api.discordReply(channelId, reply);
                            return;
                        }
                        case 'think': {
                            const level = (args[0] || '').toLowerCase();
                            if (['low', 'medium', 'high'].includes(level)) {
                                thinkLevels.current.set(sessionKey, level);
                                api.discordReply(channelId, `Think level set to **${level}**.`);
                            } else {
                                api.discordReply(channelId, 'Usage: `/think low|medium|high`');
                            }
                            return;
                        }
                        case 'activation': {
                            const mode = (args[0] || '').toLowerCase();
                            if (['mention', 'always'].includes(mode) && api.discordSetActivation) {
                                await api.discordSetActivation(mode);
                                api.discordReply(channelId, `Activation mode set to **${mode}**.`);
                            } else {
                                api.discordReply(channelId, 'Usage: `/activation mention|always`');
                            }
                            return;
                        }
                        case 'compact': {
                            // Keep only last 6 messages
                            const history = loadHistory(sessionKey);
                            saveHistory(sessionKey, history.slice(-6));
                            api.discordReply(channelId, 'History compacted to last 6 messages.');
                            return;
                        }
                        default:
                            // Unknown command — fall through to agent
                            break;
                    }
                }

                // ── Normal message handling ────────────────────────────────────
                const history = loadHistory(sessionKey);
                const thinkLevel = thinkLevels.current.get(sessionKey);

                // Race agent run against a 60s timeout so a stuck tool call can't hang silently
                const response = await Promise.race([
                    agentLoop.run(content, history, thinkLevel ? { thinkLevel } : undefined),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('__TIMEOUT__')), 60_000)
                    ),
                ]);

                const rawReply = response?.reply || response?.content || '';
                const reply = rawReply.trim() || "I'm here — got your message but had nothing to say. Try rephrasing?";

                // Persist conversation (use 'assistant' role to match MemoryStore format)
                saveHistory(sessionKey, [
                    ...history,
                    { role: 'user', content },
                    { role: 'assistant', content: reply },
                ]);

                api.discordReply(channelId, reply);
                setSessionCount(n => n + 1);
            } catch (err) {
                console.error('[DiscordBridge] Error processing message:', err);
                const fallback = err.message === '__TIMEOUT__'
                    ? "That took longer than 60 seconds — I gave up. Try something simpler?"
                    : `Hit a problem: ${err.message || 'unknown error'}`;
                api.discordReply(channelId, fallback);
            } finally {
                processingRef.current.delete(msgId);
            }
        });

        return cleanup;
    }, []);

    return { isConnected, sessionCount };
}
