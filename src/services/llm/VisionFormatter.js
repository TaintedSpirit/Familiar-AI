import { SCREENSHOT_STALE_MS } from "../constants";

/**
 * VisionFormatter — shared screenshot formatting utilities for all providers.
 *
 * Eliminates the duplicate _formatOpenAIContent / _formatAnthropicContent
 * methods that existed in the old Router.js (lines 757-788 AND 1077-1112).
 */

/**
 * @param {object|null} sharedContext — from ContextStore.
 * @param {number} [maxAgeMs=300000] — max age before considering screenshot stale.
 * @returns {boolean} true if a fresh screenshot is available.
 */
export function isScreenshotFresh(sharedContext, maxAgeMs = SCREENSHOT_STALE_MS) {
    return !!(sharedContext?.screenshot && (Date.now() - sharedContext.timestamp < maxAgeMs));
}

/**
 * Strip the data-URI prefix from a base64 screenshot string.
 * @param {string} dataUri
 * @returns {string} raw base64 data.
 */
function stripBase64Prefix(dataUri) {
    return dataUri.replace(/^data:image\/(png|jpeg|webp);base64,/, "");
}

/**
 * Format user content for the OpenAI chat completions API.
 * Returns plain text if no fresh screenshot, or a multipart array if one is available.
 */
export function formatForOpenAI(text, sharedContext) {
    if (!isScreenshotFresh(sharedContext)) return text;

    const base64Image = stripBase64Prefix(sharedContext.screenshot);
    return [
        { type: "text", text: text || "Describe what you see on my screen." },
        {
            type: "image_url",
            image_url: {
                url: `data:image/png;base64,${base64Image}`,
                detail: "high"
            }
        }
    ];
}

/**
 * Format user content for the Anthropic Messages API.
 * Image block goes first (Anthropic best practice), followed by text.
 */
export function formatForAnthropic(text, sharedContext) {
    if (!isScreenshotFresh(sharedContext)) return text;

    const base64Image = stripBase64Prefix(sharedContext.screenshot);
    return [
        {
            type: "image",
            source: {
                type: "base64",
                media_type: "image/png",
                data: base64Image
            }
        },
        { type: "text", text: text || "Describe what you see on my screen." }
    ];
}

/**
 * Format inline image data for the Gemini SDK.
 * Returns an array of message parts (text + inlineData).
 */
export function formatForGemini(text, sharedContext) {
    const parts = [text];
    if (!isScreenshotFresh(sharedContext)) return parts;

    const base64Image = stripBase64Prefix(sharedContext.screenshot);
    parts.push({
        inlineData: {
            data: base64Image,
            mimeType: "image/png"
        }
    });
    console.log("[VisionFormatter] Attaching screenshot to Gemini request");
    return parts;
}
