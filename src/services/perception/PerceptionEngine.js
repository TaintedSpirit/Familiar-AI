// Lazily-initialized Tesseract singleton — one worker shared for all calls
let _workerPromise = null;

async function getWorker() {
    if (_workerPromise) return _workerPromise;
    _workerPromise = (async () => {
        const { createWorker } = await import('tesseract.js');
        return createWorker('eng', 1, { logger: () => {} });
    })();
    return _workerPromise;
}

// Patterns for lightweight UI element detection from OCR word tokens
const BUTTON_RE = /^(OK|Cancel|Submit|Save|Delete|Close|Open|Send|Search|Login|Logout|Sign\s*[Ii]n|Sign\s*[Oo]ut|Yes|No|Continue|Back|Next|Done|Apply|Confirm|New|Add|Remove|Edit|Update|Refresh|Reload|Share|Like|Subscribe|Follow|Download|Upload|Import|Export|Copy|Paste|Cut|Undo|Redo|Play|Pause|Stop)$/i;
const INPUT_RE  = /^(Search|Username|Password|Email|Address|Name|Title|Message|Query|Filter|Find)[\s:…]*$/i;
const URL_RE    = /^https?:\/\/.{4}/;
const ERROR_RE  = /error|exception|traceback|TypeError|ReferenceError|SyntaxError|undefined is not|cannot read/i;

function detectElements(words = []) {
    const elements = [];
    const seen = new Set();

    for (const w of words) {
        if (w.confidence < 50 || !w.text?.trim()) continue;
        const text = w.text.trim();
        const key  = text.toLowerCase();
        if (seen.has(key)) continue;

        if (BUTTON_RE.test(text)) {
            elements.push({ type: 'button', text, confidence: +(w.confidence / 100).toFixed(2) });
            seen.add(key);
        } else if (INPUT_RE.test(text)) {
            elements.push({ type: 'input', placeholder: text, confidence: +(w.confidence / 100).toFixed(2) });
            seen.add(key);
        } else if (URL_RE.test(text)) {
            elements.push({ type: 'url', href: text, confidence: +(w.confidence / 100).toFixed(2) });
            seen.add(key);
        }

        if (elements.length >= 20) break;
    }

    return elements;
}

/**
 * Runs OCR on a base64 screenshot and returns a structured PerceptionResult.
 * Falls back gracefully to metadata-only if Tesseract fails or is unavailable.
 *
 * @param {string}  screenshot  base64 data URL
 * @param {object}  metadata    { app, title, url }
 * @param {object}  cursor      { x, y }
 * @returns {Promise<PerceptionResult>}
 */
export async function analyzeScreen(screenshot, metadata = {}, cursor = { x: 0, y: 0 }) {
    const base = {
        app: metadata?.app || 'Unknown',
        active_panel: metadata?.title || 'Unknown',
        visible_text: [],
        ui_elements: [],
        has_error: false,
        cursor,
        timestamp: new Date().toISOString(),
        ocr_confidence: 0,
    };

    try {
        const worker = await getWorker();
        const { data } = await worker.recognize(screenshot);

        const lines = (data.lines || [])
            .filter(l => l.confidence > 35 && l.text?.trim())
            .map(l => l.text.trim());

        const elements = detectElements(data.words || []);
        const hasError = lines.some(l => ERROR_RE.test(l));

        return {
            ...base,
            visible_text: lines.slice(0, 40),
            ui_elements: elements,
            has_error: hasError,
            ocr_confidence: +(data.confidence || 0).toFixed(1),
        };
    } catch (err) {
        console.warn('[PerceptionEngine] OCR failed, returning metadata-only result:', err.message);
        return { ...base, ocr_error: err.message };
    }
}

export async function disposeWorker() {
    if (_workerPromise) {
        const w = await _workerPromise.catch(() => null);
        if (w) await w.terminate().catch(() => {});
        _workerPromise = null;
    }
}
