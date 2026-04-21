const POLL_TIMEOUT = 30; // seconds for long-poll

class TelegramChannel {
    constructor() {
        this.polling = false;
        this.offset = 0;
        this._onMessage = null;
        this._token = null;
        this._allowedUserId = null;
    }

    async start(token, allowedUserId, onMessage) {
        if (this.polling) return;
        this._token = token;
        this._allowedUserId = String(allowedUserId || '');
        this._onMessage = onMessage;
        this.polling = true;
        this._poll();
    }

    stop() {
        this.polling = false;
    }

    async send(chatId, text) {
        if (!this._token) return;
        try {
            await fetch(`https://api.telegram.org/bot${this._token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text }),
            });
        } catch (e) {
            console.warn('[TelegramChannel] send failed:', e.message);
        }
    }

    async _poll() {
        while (this.polling) {
            try {
                const url = `https://api.telegram.org/bot${this._token}/getUpdates?offset=${this.offset}&timeout=${POLL_TIMEOUT}`;
                const res = await fetch(url, { signal: AbortSignal.timeout((POLL_TIMEOUT + 5) * 1000) });
                if (!res.ok) {
                    await this._sleep(5000);
                    continue;
                }
                const data = await res.json();
                if (!data.ok) { await this._sleep(5000); continue; }

                for (const update of data.result || []) {
                    this.offset = update.update_id + 1;
                    const msg = update.message;
                    if (!msg?.text) continue;

                    const senderId = String(msg.from?.id || '');
                    if (this._allowedUserId && senderId !== this._allowedUserId) continue;

                    this._onMessage?.({
                        text: msg.text,
                        chatId: msg.chat.id,
                        from: msg.from?.username || senderId,
                        source: 'telegram',
                        timestamp: msg.date * 1000,
                    });
                }
            } catch (e) {
                if (this.polling) await this._sleep(5000);
            }
        }
    }

    _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

export const telegramChannel = new TelegramChannel();
