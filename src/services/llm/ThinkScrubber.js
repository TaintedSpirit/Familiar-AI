const OPEN_TAGS = ['thinking', 'reasoning', 'thought', 'REASONING_SCRATCHPAD', 'think'];
const OPEN_RE = new RegExp(`<(${OPEN_TAGS.join('|')})>`, 'g');
const CLOSED_RE = new RegExp(`<(${OPEN_TAGS.join('|')})>[\\s\\S]*?<\\/\\1>`, 'g');

export class ThinkScrubber {
    constructor() {
        this._inTag = false;
        this._tagName = null;
        this._buf = '';
        this._emittedChars = 0;
        this._suppressed = '';
    }

    reset() {
        this._inTag = false;
        this._tagName = null;
        this._buf = '';
        this._emittedChars = 0;
        this._suppressed = '';
    }

    feed(delta) {
        this._buf += delta;
        let visible = '';

        while (this._buf.length > 0) {
            if (this._inTag) {
                const closeTag = `</${this._tagName}>`;
                const closeIdx = this._buf.indexOf(closeTag);
                if (closeIdx >= 0) {
                    this._suppressed += this._buf.slice(0, closeIdx);
                    this._buf = this._buf.slice(closeIdx + closeTag.length);
                    this._inTag = false;
                    this._tagName = null;
                } else {
                    // Still accumulating inside tag — hold the whole buffer
                    this._suppressed += this._buf;
                    this._buf = '';
                }
            } else {
                const ltIdx = this._buf.indexOf('<');
                if (ltIdx < 0) {
                    visible += this._buf;
                    this._buf = '';
                    break;
                }
                if (ltIdx > 0) {
                    visible += this._buf.slice(0, ltIdx);
                    this._buf = this._buf.slice(ltIdx);
                }

                // Try to match an open tag at this position
                const matchedTag = this._matchOpenTag(this._buf);
                if (matchedTag === null) {
                    // No tag matched — consume the '<' as literal
                    visible += '<';
                    this._buf = this._buf.slice(1);
                } else if (matchedTag === '') {
                    // Partial match — need more data
                    break;
                } else {
                    // Full open tag matched — check block boundary
                    const openTagStr = `<${matchedTag}>`;
                    if (this._atBlockBoundary(visible)) {
                        this._inTag = true;
                        this._tagName = matchedTag;
                        this._buf = this._buf.slice(openTagStr.length);
                    } else {
                        // Not at a boundary — emit as literal
                        visible += openTagStr;
                        this._buf = this._buf.slice(openTagStr.length);
                    }
                }
            }
        }

        this._emittedChars += visible.length;
        return visible;
    }

    flush() {
        let visible = '';
        if (!this._inTag && this._buf.length > 0) {
            // Incomplete potential tag at end of stream — emit as literal
            visible = this._buf;
        }
        if (this._suppressed) {
            console.debug('[ThinkScrubber] suppressed reasoning:', this._suppressed.slice(0, 200));
        }
        this.reset();
        return visible;
    }

    _matchOpenTag(str) {
        // Returns: tag name (string) if matched, '' if partial, null if no match
        if (!str.startsWith('<')) return null;
        for (const tag of OPEN_TAGS) {
            const full = `<${tag}>`;
            if (str.startsWith(full)) return tag;
            if (full.startsWith(str)) return ''; // partial
        }
        return null;
    }

    _atBlockBoundary(emittedSoFar) {
        if (this._emittedChars === 0 && emittedSoFar.length === 0) return true;
        const all = emittedSoFar;
        if (all.length === 0) return true;
        const lastChar = all[all.length - 1];
        if (lastChar === '\n') return true;
        // Only whitespace emitted so far
        if (/^\s*$/.test(all)) return true;
        return false;
    }

    // ── Static API (backward compat) ──────────────────────────────────────────

    static scrub(text) {
        if (!text) return text;
        let cleaned = text.replace(CLOSED_RE, '');
        cleaned = cleaned.replace(OPEN_RE, '');
        // Remove trailing incomplete open tag
        cleaned = cleaned.replace(/<(?:t(?:h(?:i(?:n(?:k(?:i(?:n(?:g?)?)?)?)?)?)?)?|r(?:e(?:a(?:s(?:o(?:n(?:i(?:n(?:g?)?)?)?)?)?)?)?)?|t(?:h(?:o(?:u(?:g(?:h(?:t?)?)?)?)?)?)?|R(?:E(?:A(?:S(?:O(?:N(?:I(?:N(?:G(?:_(?:S(?:C(?:R(?:A(?:T(?:C(?:H(?:P(?:A(?:D?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?[\s\S]*$/i, '');
        return cleaned.trimStart();
    }

    // wrap() is called with the adapter's onChunk which receives *accumulated* text.
    // We scrub the full accumulated text each call (backward-compatible with existing adapters).
    static wrap(originalOnChunk) {
        if (!originalOnChunk) return null;
        return {
            callback: (accumulatedText) => {
                const visible = ThinkScrubber.scrub(accumulatedText);
                if (visible !== undefined) originalOnChunk(visible);
            },
            flush: () => {}
        };
    }

    // wrapDelta() is for true per-delta streaming (future use when adapters emit deltas).
    static wrapDelta(originalOnChunk) {
        if (!originalOnChunk) return null;
        const scrubber = new ThinkScrubber();
        return {
            scrubber,
            callback: (delta) => {
                const visible = scrubber.feed(delta);
                if (visible) originalOnChunk(visible);
            },
            flush: () => {
                const tail = scrubber.flush();
                if (tail) originalOnChunk(tail);
            }
        };
    }
}
