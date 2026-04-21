const http = require('http');

class WebhookGateway {
    constructor() {
        this.server = null;
    }

    start(port, mainWindow, secret) {
        if (this.server) return;

        this.server = http.createServer((req, res) => {
            if (req.method !== 'POST' || req.url !== '/webhook') {
                res.writeHead(404);
                res.end('Not Found');
                return;
            }

            // Optional bearer token auth
            if (secret) {
                const auth = req.headers['authorization'] || '';
                if (auth !== `Bearer ${secret}`) {
                    res.writeHead(401);
                    res.end('Unauthorized');
                    return;
                }
            }

            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const payload = JSON.parse(body);
                    if (!payload.message) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'message field required' }));
                        return;
                    }
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('webhook:message', {
                            message: payload.message,
                            metadata: payload.metadata || {},
                            source: 'webhook',
                            timestamp: Date.now(),
                        });
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: true }));
                } catch (e) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
            });
        });

        this.server.listen(port, '127.0.0.1', () => {
            console.log(`[WebhookGateway] Listening on http://127.0.0.1:${port}/webhook`);
        });

        this.server.on('error', (err) => {
            console.error('[WebhookGateway] Server error:', err.message);
        });
    }

    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
            console.log('[WebhookGateway] Stopped');
        }
    }
}

module.exports = { WebhookGateway };
