/**
 * Heuristic intent inference — runs synchronously, no LLM call.
 * Rules are checked in order; first match wins.
 */

const RULES = [
    {
        id: 'consuming_media',
        confidence: 0.9,
        test: ({ app, active_panel }) =>
            /youtube|twitch|netflix|vimeo|spotify|prime\s*video|hbo|disney/i.test(active_panel + ' ' + app),
    },
    {
        id: 'writing_code',
        confidence: 0.88,
        test: ({ app, visible_text }) =>
            /code|cursor|vscode|sublime|vim|neovim|intellij|webstorm|atom|rider|clion|goland/i.test(app) ||
            visible_text.some(t => /\b(function|const |import |export |class |def |return|interface|=>|async)\b/.test(t)),
    },
    {
        id: 'debugging',
        confidence: 0.85,
        test: ({ visible_text, has_error }) =>
            has_error ||
            visible_text.some(t => /error|exception|traceback|undefined|null pointer|stack trace/i.test(t)),
    },
    {
        id: 'using_terminal',
        confidence: 0.92,
        test: ({ app, active_panel }) =>
            /terminal|powershell|cmd\.exe|bash|zsh|wsl|command prompt|hyper|alacritty|iterm/i.test(app + ' ' + active_panel),
    },
    {
        id: 'designing',
        confidence: 0.92,
        test: ({ app }) =>
            /figma|sketch|adobe\s*xd|photoshop|illustrator|canva|affinity|inkscape/i.test(app),
    },
    {
        id: 'reading_email',
        confidence: 0.82,
        test: ({ visible_text }) =>
            visible_text.some(t => /\b(inbox|compose|reply|forward|subject:|from:|to:)\b/i.test(t)),
    },
    {
        id: 'reading_article',
        confidence: 0.7,
        test: ({ app, visible_text }) =>
            /chrome|firefox|edge|safari|brave/i.test(app) &&
            visible_text.filter(t => t.length > 60).length > 3,
    },
    {
        id: 'filling_form',
        confidence: 0.75,
        test: ({ ui_elements, visible_text }) =>
            ui_elements.filter(e => e.type === 'input').length >= 2 ||
            visible_text.some(t => /\b(required|field|submit|checkbox|select)\b/i.test(t)),
    },
    {
        id: 'writing_document',
        confidence: 0.72,
        test: ({ app, visible_text }) =>
            /word|docs|notion|obsidian|notepad|writer|pages\b/i.test(app) ||
            visible_text.filter(t => t.length > 80).length > 2,
    },
    {
        id: 'browsing',
        confidence: 0.4,
        test: ({ app }) => /chrome|firefox|edge|safari|brave|opera/i.test(app),
    },
];

/**
 * @param {object} perceptionResult  PerceptionResult from PerceptionEngine
 * @param {object[]} _history        Previous PerceptionResults (unused by heuristic, available for future LLM path)
 * @returns {{ intent: string, confidence: number, context: object }}
 */
export function inferIntent(perceptionResult, _history = []) {
    if (!perceptionResult) return { intent: 'unknown', confidence: 0, context: null };

    for (const rule of RULES) {
        if (rule.test(perceptionResult)) {
            return {
                intent: rule.id,
                confidence: rule.confidence,
                context: { app: perceptionResult.app, panel: perceptionResult.active_panel },
            };
        }
    }

    return {
        intent: 'idle',
        confidence: 0.3,
        context: { app: perceptionResult.app, panel: perceptionResult.active_panel },
    };
}
