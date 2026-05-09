import { GoogleGenerativeAI } from "@google/generative-ai";
import { BaseAdapter } from "./BaseAdapter";
import { formatForGemini, isScreenshotFresh } from "../VisionFormatter";
import { useContextStore } from "../../context/ContextStore";

/**
 * GeminiAdapter — Google Generative AI (Gemini) provider.
 *
 * Handles: chat (streaming + non-streaming), tool-use via function declarations,
 * audio transcription, and Gemini SDK lifecycle management.
 *
 * Extracted from Router.js: lines 236-336 (chat), 869-957 (tools),
 * 1048-1075 (message converter), 1162-1192 (transcription).
 */
export class GeminiAdapter extends BaseAdapter {
    constructor() {
        super('gemini');
        this._genAI = null;
        this._lastKey = null;
    }

    isConfigured(settings) {
        return !!settings.geminiApiKey;
    }

    /** Lazy-init the Gemini SDK, re-creating only when the API key changes. */
    _ensureClient(apiKey) {
        if (!this._genAI || this._lastKey !== apiKey) {
            this._genAI = new GoogleGenerativeAI(apiKey);
            this._lastKey = apiKey;
        }
        return this._genAI;
    }

    // ── Plain Chat ─────────────────────────────────────────────────────────

    async chat(prompt, contextMessages, systemPrompt, settings, onChunk) {
        const { geminiApiKey, model: selectedModel, temperature, topP, topK } = settings;
        const genAI = this._ensureClient(geminiApiKey);

        const model = genAI.getGenerativeModel({
            model: selectedModel || "gemini-pro",
            generationConfig: {
                temperature: temperature || 0.7,
                topP: topP || 0.95,
                topK: topK || 40,
                maxOutputTokens: 8192,
                stopSequences: ["(Go)", "(Tools)", "task_boundary", "thought", "Plan:", "Status:", "Tools:"]
            }
        });

        const history = contextMessages.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
        }));

        const chat = model.startChat({
            history,
            systemInstruction: systemPrompt
        });

        // Build message parts with optional vision
        const { sharedContext } = useContextStore.getState();
        const messageParts = formatForGemini(prompt, sharedContext);

        let completion = "";
        let usageMetadata = null;

        if (onChunk) {
            const result = await chat.sendMessageStream(messageParts);
            for await (const chunk of result.stream) {
                completion += chunk.text();
                onChunk(completion);
            }
            usageMetadata = (await result.response).usageMetadata;
        } else {
            const result = await chat.sendMessage(messageParts);
            completion = result.response.text();
            usageMetadata = result.response.usageMetadata;
        }

        if (usageMetadata) {
            import("../../telemetry/TelemetryStore").then(module => {
                module.useTelemetryStore.getState().logUsage(
                    'gemini', selectedModel || "gemini-pro", usageMetadata.promptTokenCount, usageMetadata.candidatesTokenCount
                );
            }).catch(e => console.error("Telemetry error:", e));
        }

        return completion;
    }

    // ── Tool-Use Chat ──────────────────────────────────────────────────────

    async chatWithTools(messages, tools, systemPrompt, settings) {
        const { geminiApiKey, model: selectedModel, temperature } = settings;
        const genAI = this._ensureClient(geminiApiKey);

        const functionDeclarations = tools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters
        }));

        const model = genAI.getGenerativeModel({
            model: selectedModel || 'gemini-1.5-flash',
            tools: [{ functionDeclarations }],
            systemInstruction: systemPrompt,
            generationConfig: { temperature: temperature || 0.7 }
        });

        const history = this._toGeminiMessages(messages.slice(0, -1));
        const lastMsg = messages[messages.length - 1];
        const chat = model.startChat({ history });

        const { sharedContext } = useContextStore.getState();
        let messageParts = [];
        let shouldFollowUpWithImage = false;

        if (lastMsg?.role === 'tool') {
            // After a functionCall, Gemini requires a functionResponse — NOT plain text
            // IMPORTANT: Cannot mix functionResponse with inlineData in the same call
            messageParts.push({
                functionResponse: {
                    name: lastMsg.toolName || 'unknown',
                    response: { result: lastMsg.content || '' }
                }
            });
            console.log("[GeminiAdapter] Sending functionResponse for tool:", lastMsg.toolName);
            shouldFollowUpWithImage = isScreenshotFresh(sharedContext);
        } else {
            messageParts = formatForGemini(lastMsg?.content || '', sharedContext);
        }

        let result = await chat.sendMessage(messageParts);
        let parts = result.response.candidates?.[0]?.content?.parts || [];

        // Follow-up: send screenshot in a second turn if tool result + fresh screenshot
        if (shouldFollowUpWithImage) {
            const base64Image = sharedContext.screenshot.replace(/^data:image\/(png|jpeg);base64,/, "");
            console.log("[GeminiAdapter] Sending follow-up screenshot for visual analysis");
            result = await chat.sendMessage([
                `Screenshot captured at ${new Date(sharedContext.timestamp).toLocaleTimeString()}. Active window: "${sharedContext.title || 'Unknown'}" (${sharedContext.app || 'Unknown'}). Describe what you see and confirm whether the visible content matches the reported application. If there is a discrepancy between the window name and screenshot content, state it explicitly.`,
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: "image/png"
                    }
                }
            ]);
            parts = result.response.candidates?.[0]?.content?.parts || [];
        }

        const usageMetadata = result.response.usageMetadata;
        if (usageMetadata) {
            import("../../telemetry/TelemetryStore").then(module => {
                module.useTelemetryStore.getState().logUsage(
                    'gemini', selectedModel || 'gemini-1.5-flash', usageMetadata.promptTokenCount, usageMetadata.candidatesTokenCount
                );
            }).catch(e => console.error("Telemetry error:", e));
        }

        const functionCalls = parts.filter(p => p.functionCall);
        if (functionCalls.length) {
            const toolCalls = functionCalls.map((p, i) => ({
                id: `gemini_${Date.now()}_${i}`,
                name: p.functionCall.name,
                args: p.functionCall.args
            }));
            return { type: 'tool_calls', toolCalls };
        }

        const text = parts.filter(p => p.text).map(p => p.text).join('');
        return { type: 'text', content: text };
    }

    // ── Transcription ──────────────────────────────────────────────────────

    async transcribe(audioBlob, settings) {
        const genAI = this._ensureClient(settings.geminiApiKey);

        const reader = new FileReader();
        return new Promise((resolve, reject) => {
            reader.readAsDataURL(audioBlob);
            reader.onloadend = async () => {
                try {
                    const base64Audio = reader.result.split(',')[1];
                    const mimeType = reader.result.split(';')[0].split(':')[1] || 'audio/webm';
                    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                    const result = await model.generateContent([
                        { inlineData: { mimeType, data: base64Audio } },
                        { text: "Transcribe this audio. Output ONLY the words spoken, no punctuation or filler." }
                    ]);
                    resolve(result.response.text());
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = reject;
        });
    }

    // ── Message format converter ───────────────────────────────────────────

    _toGeminiMessages(messages) {
        const result = [];
        for (const msg of messages) {
            if (msg.role === 'user') {
                result.push({ role: 'user', parts: [{ text: msg.content || '' }] });
            } else if (msg.role === 'assistant') {
                const parts = [];
                if (msg.content) parts.push({ text: msg.content });
                if (msg.toolCalls?.length) {
                    msg.toolCalls.forEach(tc => {
                        parts.push({ functionCall: { name: tc.name, args: tc.args } });
                    });
                }
                result.push({ role: 'model', parts });
            } else if (msg.role === 'tool') {
                result.push({
                    role: 'user',
                    parts: [{
                        functionResponse: {
                            name: msg.toolName,
                            response: { result: msg.content }
                        }
                    }]
                });
            }
        }
        return result;
    }
}
