import { telegramChannel } from './TelegramChannel';

let _activeReplyTarget = null; // { source: 'telegram', chatId }

const channelManager = {
    start({ telegramToken, telegramUserId, onMessage }) {
        if (telegramToken) {
            telegramChannel.start(telegramToken, telegramUserId, (msg) => {
                _activeReplyTarget = { source: 'telegram', chatId: msg.chatId };
                onMessage(msg);
            });
        }
    },

    stop() {
        telegramChannel.stop();
        _activeReplyTarget = null;
    },

    async sendReply(text, target) {
        const dest = target || _activeReplyTarget;
        if (!dest) return;
        if (dest.source === 'telegram') {
            await telegramChannel.send(dest.chatId, text);
        }
    },

    getActiveTarget() {
        return _activeReplyTarget;
    },
};

export { channelManager };
