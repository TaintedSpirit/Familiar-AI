const { Client, GatewayIntentBits, Partials } = require('discord.js');

function randomCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}

class DiscordBot {
    constructor() {
        this.client = null;
        this.companionChannels = new Set();
        this.onMessageCallback = null;
        this.isReady = false;
        this.typingIntervals = new Map(); // channelId -> intervalId

        // OpenClaw-style DM pairing
        this.dmPolicy = 'pairing'; // 'pairing' | 'open'
        this.allowedUsers = new Set();
        this.pendingCodes = new Map(); // userId -> { code, channelId }

        // OpenClaw-style activation mode
        this.activationMode = 'mention'; // 'mention' | 'always'
    }

    _startTyping(channel) {
        if (!channel || this.typingIntervals.has(channel.id)) return;
        channel.sendTyping().catch(() => {});
        const id = setInterval(() => {
            channel.sendTyping().catch(() => {});
        }, 8000);
        this.typingIntervals.set(channel.id, id);
    }

    _stopTyping(channelId) {
        const id = this.typingIntervals.get(channelId);
        if (id) {
            clearInterval(id);
            this.typingIntervals.delete(channelId);
        }
    }

    // callback(data) will be called for every message that should be processed
    start(token, companionChannels = [], callback) {
        if (this.client) this.stop();

        this.companionChannels = new Set(companionChannels);
        this.onMessageCallback = callback;

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
            ],
            partials: [Partials.Channel, Partials.Message],
        });

        this.client.once('ready', () => {
            this.isReady = true;
            console.log(`[DiscordBot] Logged in as ${this.client.user.tag}`);
        });

        this.client.on('messageCreate', async (msg) => {
            if (msg.author.bot) return;

            const isDM = !msg.guild;
            const isMentioned = this.client.user && msg.mentions.has(this.client.user.id);
            const isCompanionChannel = this.companionChannels.has(msg.channelId);

            // Activation mode: 'always' responds to all companion channel messages
            const activatedInChannel = isCompanionChannel && (this.activationMode === 'always' || isMentioned);
            if (!isDM && !activatedInChannel) return;

            // Strip the @mention from the content if present
            let content = msg.content;
            if (this.client.user) {
                content = content.replace(new RegExp(`<@!?${this.client.user.id}>`, 'g'), '').trim();
            }

            if (!content) return;

            // DM pairing: handle /approve command for pending codes
            if (isDM && content.startsWith('/approve ')) {
                const submitted = content.slice(9).trim().toUpperCase();
                const pending = this.pendingCodes.get(msg.author.id);
                if (pending && pending.code === submitted) {
                    this.allowedUsers.add(msg.author.id);
                    this.pendingCodes.delete(msg.author.id);
                    await msg.channel.send('Approved — say hello!');
                } else {
                    await msg.channel.send('Invalid code. Try messaging me again to get a new one.');
                }
                return;
            }

            // DM pairing: gate unknown DM senders
            if (isDM && this.dmPolicy === 'pairing' && !this.allowedUsers.has(msg.author.id)) {
                const code = randomCode();
                this.pendingCodes.set(msg.author.id, { code, channelId: msg.channelId });
                await msg.channel.send(
                    `Hi! To start chatting, send this to verify:\n\`/approve ${code}\``
                );
                return;
            }

            // Show "typing..." immediately and keep it alive until reply lands
            this._startTyping(msg.channel);

            if (this.onMessageCallback) {
                this.onMessageCallback({
                    msgId: msg.id,
                    channelId: msg.channelId,
                    userId: msg.author.id,
                    username: msg.author.username,
                    content,
                    isDM,
                    guildId: msg.guild?.id ?? null,
                });
            }
        });

        this.client.login(token).catch((err) => {
            console.error('[DiscordBot] Login failed:', err.message);
            this.isReady = false;
        });
    }

    async sendReply(channelId, content) {
        // Always stop typing, even if reply fails
        this._stopTyping(channelId);

        if (!this.client || !this.isReady) return;

        // Never send empty content to Discord — it throws
        const safe = (content || '').trim() || '(no response generated)';

        try {
            const channel = await this.client.channels.fetch(channelId);
            if (channel && channel.isTextBased()) {
                if (safe.length <= 2000) {
                    await channel.send(safe);
                } else {
                    const chunks = safe.match(/[\s\S]{1,2000}/g) || [];
                    for (const chunk of chunks) {
                        await channel.send(chunk);
                    }
                }
            }
        } catch (err) {
            console.error('[DiscordBot] sendReply failed:', err.message);
            // Last-resort short fallback so the user still gets a visible message
            try {
                const channel = await this.client.channels.fetch(channelId);
                if (channel && channel.isTextBased()) {
                    await channel.send(`(failed to send full reply: ${err.message.slice(0, 200)})`);
                }
            } catch {}
        }
    }

    updateCompanionChannels(channels) {
        this.companionChannels = new Set(channels);
    }

    setDmPolicy(policy) {
        if (policy === 'pairing' || policy === 'open') {
            this.dmPolicy = policy;
        }
    }

    approveUser(userId) {
        this.allowedUsers.add(userId);
        this.pendingCodes.delete(userId);
    }

    setActivationMode(mode) {
        if (mode === 'mention' || mode === 'always') {
            this.activationMode = mode;
        }
    }

    stop() {
        for (const id of this.typingIntervals.values()) clearInterval(id);
        this.typingIntervals.clear();

        if (this.client) {
            this.isReady = false;
            this.client.destroy();
            this.client = null;
        }
    }
}

module.exports = new DiscordBot();
