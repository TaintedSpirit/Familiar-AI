import { GoogleGenerativeAI } from "@google/generative-ai";
import { useSettingsStore } from "../settings/SettingsStore";
import { useSafetyStore } from "../safety/SafetyStore";
import { useSpeechStore } from "../voice/SpeechStore";
import { useMemoryStore } from "../memory/MemoryStore";
import { useWorkflowStore } from "../workflow/WorkflowStore";
import { workflowEngine } from "../workflow/WorkflowEngine";
import { useVisionStore } from "../vision/VisionStore";
import { useContextStore } from "../context/ContextStore";
import { useFormStore } from "../forms/FormStore";
import { FormCapabilities } from "../forms/FormCapabilities";
import { COMPANION_PERSONA, detectExplainMode } from "./Persona";
import { FETCH_TIMEOUT_MS } from "../constants";
import { projectMemoryClient } from "../memory2/MemoryClient";

// Safe JSON extractor — strips markdown fences then parses; never executes code.
function safeExtractJSON(text) {
    const stripped = text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try {
        return JSON.parse(stripped.substring(start, end + 1));
    } catch {
        return null;
    }
}

// Fetch with automatic timeout and abort.
function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(id));
}

export class LLMRouter {
    constructor() {
        this.genAI = null;
        this.model = null;
        this.lastGeminiKey = null;
        this._lastEmbedKey = null;
    }

    async init() {
        // Init logic handled dynamically in query for now to catch settings updates
    }

    async query(prompt, contextMessages, onChunk = null) {
        try {
            const { aiProvider, geminiApiKey, openaiApiKey, secondaryAiProvider, secondaryModel, model: selectedModel, temperature, topP, topK, autonomyLevel, setFallbackState } = useSettingsStore.getState();

            // Keep project memory embedding key in sync with the Gemini key in settings
            if (geminiApiKey && geminiApiKey !== this._lastEmbedKey) {
                this._lastEmbedKey = geminiApiKey;
                projectMemoryClient.setEmbeddingKey(geminiApiKey).catch(() => { });
            }
            const { activeProjectId, projects } = useMemoryStore.getState();

            // 0. Project Context
            const currentProject = projects.find(p => p.id === activeProjectId);
            const projectName = currentProject?.name || "General";
            const projectContext = currentProject?.description || "No active project.";
            const keyDecisions = currentProject?.decisions || [];

            // FAST PATH: Explicit Commands
            if (prompt.match(/^(run|start|execute|begin)\s+(the\s+)?(workflow|sequence|graph)/i)) {
                return {
                    type: 'proposal',
                    title: 'Workflow Execution',
                    action: 'Start',
                    content: "Initiating workflow execution sequence."
                };
            }

            // FAST PATH: Thread Creation (Hard Commit)
            // Supports: "Start a thread: X", "Start thread X", "Create a thread about X"
            const threadMatch = prompt.match(/^(start|create|open|new|track)\s*(?:a\s+)?(?:new\s+)?thread\s*(?:[:]|about|on|named|called)?\s+(.+)/i) ||
                prompt.match(/^(keep\s+track\s+of\s+this)\s*(?:[:])?\s*(.+)/i);

            if (threadMatch) {
                const topic = threadMatch[2] || threadMatch.pop(); // Catch various group positions
                return {
                    type: 'proposal',
                    title: "New Thread",
                    content: `Starting thread: "${topic}"`,
                    data: {
                        title: `Create Thread: ${topic}`,
                        action: 'create_thread',
                        payload: { title: topic }
                    },
                    speech: `Thread created: ${topic}`
                };
            }

            if (prompt.match(/^(clear|wipe|delete|reset|empty)\s+(the\s+)?(workflow|sequence|graph|nodes|canvas)/i)) {
                return {
                    type: 'workflow_edit_proposal',
                    data: {
                        summary: "Wiping existing workflow canvas.",
                        operations: [{ type: 'clear' }]
                    }
                };
            }

            // 1. Detect Intent
            let intent = this.detectIntent(prompt);

            // 2. Refresh Context (Time, Weather, etc.)
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

            // 3a. Check for Weather intent (naive check to save API calls)
            let weatherInfo = "Not requested";
            if (prompt.toLowerCase().match(/(weather|temperature|outside|hot|cold|rain)/)) {
                weatherInfo = await this.getWeather(timeZone);
            }

            // 3b. Search Check (If skill is RESEARCHER)
            let searchResults = "";
            if (intent === 'RESEARCHER') {
                searchResults = await this.performSearch(prompt);
            }

            // 3c. Website Reading (Auto-detect URL)
            let websiteContent = "";
            const urlMatch = prompt.match(/https?:\/\/[^\s]+/);
            if (urlMatch && window.electronAPI && window.electronAPI.scrapeUrl) {
                websiteContent = await window.electronAPI.scrapeUrl(urlMatch[0]);
                if (websiteContent.length > 2000) websiteContent = websiteContent.substring(0, 2000) + "...[truncated]";
            }

            // 3d. Workflow Context
            const workflowState = useWorkflowStore.getState().getGraphJSON();
            const engineState = workflowEngine.getSnapshot();

            // 3e. Desktop Context & Plan State
            const { activeApp, activeTitle, sharedContext, activePlan, planProgress, awarenessEnabled, focusMode } = await import('../context/ContextStore').then(m => m.useContextStore.getState());

            // 3f. Form & Evolution State
            const formCapabilities = FormCapabilities.getPromptContext();

            // 3g. Vision State
            const { visionStatus } = useVisionStore.getState();

            // 3h. Structured Perception State
            const { usePerceptionStore } = await import('../perception/PerceptionStore.js').catch(() => ({ usePerceptionStore: null }));
            const perception = usePerceptionStore?.getState().current ?? null;
            const lastIntent = usePerceptionStore?.getState().lastIntent ?? null;

            // 4. Construct System Prompt
            const isExplainMode = detectExplainMode(prompt);

            // Trust Level & Threads
            const { getActiveProject } = useMemoryStore.getState();
            const project = getActiveProject();
            const activeProjectTrust = project?.trustLevel || 'observe';
            const activeThreads = project?.threads?.filter(t => t.status === 'active') || [];

            const basePrompt = this.getSkillSystemPrompt(intent);

            // Soul context (loaded from soul.md, memory.md, goals.md)
            let soulContext = '';
            try {
                const { soulLoader } = await import('../soul/SoulLoader');
                if (!soulLoader.isLoaded()) await soulLoader.load();
                soulContext = soulLoader.getSoulContext();
            } catch { /* non-fatal */ }

            // Long-term memory recall (openclaw-style FTS5 hybrid search)
            let recallContext = '';
            try {
                const { memoryClient } = await import('../memory2/MemoryClient');
                if (memoryClient.available()) {
                    const { hits } = await memoryClient.search(prompt, { limit: 4, recencyHalfLifeDays: 30 });
                    if (hits && hits.length) {
                        recallContext = '\n*** RECALLED MEMORY ***\n' + hits.map(h => `- [${h.type}] ${h.snippet}`).join('\n') + '\n';
                    }
                }
            } catch (e) {
                console.warn('[Router] memory recall skipped:', e?.message);
            }

            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateString = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const platform = navigator.platform;

            let autonomyInstruction = "";
            if (autonomyLevel < 40) autonomyInstruction = "AUTONOMY: LOW. You are cautious. ALWAYS ask for confirmation before proposing complex actions. Drafts are tentative.";
            else if (autonomyLevel >= 80) autonomyInstruction = "AUTONOMY: HIGH. You are trusted. Be bold. Assume approval for standard tasks. Frame proposals as 'ready to execute'.";
            else autonomyInstruction = "AUTONOMY: BALANCED. Propose actions clearly but wait for user alignment.";

            // *** SYSTEM PROMPT: PLAIN CHAT MODE ***
            // Strict user requirement: NO AGENT BEHAVIOR. NO TOOLS. NO PLANNING.
            const systemPrompt = `
    You are "Antigravity", a helpful AI companion.
    
    *** STAGE 1: CORE DIRECTIVES ***
    1. Respond to the user's input directly and concisely.
    2. Do NOT use any tools. Do NOT plan. Do NOT output "thought" or "reasoning".
    3. Output ONLY the response text.
    
    *** STAGE 2: STRICT OUTPUT CONTRACT ***
    - Forbidden Tokens: (Go), (Tools), task_boundary, Plan:, Status:, Tools:, notify_user.
    - If you are asked to do something you cannot do without tools, simply say you cannot do it or offer a text explanation.
    - NEVER start a loop.
    
    *** STAGE 3: PERSONA ***
    ${basePrompt}
    - Tone: Calm, competent, slightly advanced.
    ${soulContext}
    ${recallContext}
    - Be brief (1-2 sentences) unless asked for detail.
    
    *** CONTEXT ***
    - Time: ${timeString}, ${dateString}
    - Active Window: ${awarenessEnabled && activeTitle ? activeTitle : "Unknown"} (${activeApp || "Unknown"})
    - Vision: ${visionStatus === 'live' ? "Live View Available" : "Stale/Offline"}
    - Focus Goal: ${focusMode.active ? focusMode.goal : "None"}
    ${lastIntent ? `- Inferred Intent: ${lastIntent.intent} (${Math.round(lastIntent.confidence * 100)}% confidence)` : ''}
    ${perception?.visible_text?.length ? `- Screen Content: ${perception.visible_text.slice(0, 3).join(' | ')}` : ''}
    ${perception?.has_error ? '- ⚠ Error detected on screen' : ''}
    
    ${searchResults ? `RESEARCH DATA:\n${searchResults}` : ''}
    ${websiteContent ? `WEBSITE CONTEXT:\n${websiteContent}` : ''}
        `;

            // 5. Select Provider & Call
            let completion = "";

            // ... (provider logic skipped for brevity, keeping existing) ...



            // ... (Provider Logic) ...
            if (aiProvider === 'gemini') {
                if (!geminiApiKey) {
                    return { type: 'text', content: "Please enter your Google Gemini API Key in the Settings menu (Gear Icon)." };
                }

                // Re-init if key changed
                if (!this.genAI || this.lastGeminiKey !== geminiApiKey) {
                    this.genAI = new GoogleGenerativeAI(geminiApiKey);
                    this.lastGeminiKey = geminiApiKey;
                }

                this.model = this.genAI.getGenerativeModel({
                    model: selectedModel || "gemini-pro",
                    generationConfig: {
                        temperature: temperature || 0.7,
                        topP: topP || 0.95,
                        topK: topK || 40,
                        maxOutputTokens: 8192,
                        stopSequences: ["(Go)", "(Tools)", "task_boundary", "thought", "Plan:", "Status:", "Tools:"]
                    }
                });

                // Convert history
                const history = contextMessages.map(m => ({
                    role: m.role === 'user' ? 'user' : 'model',
                    parts: [{ text: m.content }]
                }));

                const chat = this.model.startChat({
                    history: history,
                    systemInstruction: systemPrompt
                });

                // Prepare message parts
                let messageParts = [prompt];

                // Vision: Attach Screenshot if available and fresh
                const { sharedContext } = useContextStore.getState();
                if (sharedContext?.screenshot && (Date.now() - sharedContext.timestamp < 300000)) {
                    const base64Image = sharedContext.screenshot.replace(/^data:image\/(png|jpeg);base64,/, "");
                    messageParts.push({
                        inlineData: {
                            data: base64Image,
                            mimeType: "image/png"
                        }
                    });
                    console.log("[Router] Attaching screenshot to Gemini request");
                }

                // Reset fallback on fresh Gemini call
                setFallbackState(false, null);

                try {
                    if (onChunk) {
                        const result = await chat.sendMessageStream(messageParts);
                        for await (const chunk of result.stream) {
                            completion += chunk.text();
                            onChunk(completion);
                        }
                    } else {
                        const result = await chat.sendMessage(messageParts);
                        completion = result.response.text();
                    }
                } catch (geminiErr) {
                    const errMsg = geminiErr?.message || String(geminiErr);
                    const isRateLimit = geminiErr?.status === 429 || geminiErr?.status === 503 ||
                        /429|503|quota|rate.?limit|resource.?exhausted/i.test(errMsg);

                    const canFallback = isRateLimit && openaiApiKey && secondaryAiProvider === 'openai';

                    if (canFallback) {
                        console.warn(`[Router] Gemini unavailable (${geminiErr?.status || 'error'}). Falling back to OpenAI.`);
                        setFallbackState(true, `Gemini ${geminiErr?.status || 'error'} — using backup`);
                        useSafetyStore.getState().logExecution('provider_switch', null,
                            `Provider fallback: Gemini → OpenAI. Reason: ${errMsg.substring(0, 120)}`, 'applied');

                        const fallbackModelId = secondaryModel || 'gpt-4o';
                        const fbResponse = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${openaiApiKey}`
                            },
                            body: JSON.stringify({
                                model: fallbackModelId,
                                messages: [
                                    { role: 'system', content: systemPrompt },
                                    ...contextMessages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content || '') })),
                                    { role: 'user', content: prompt }
                                ],
                                temperature: temperature || 0.7,
                                max_tokens: 4000
                            })
                        });
                        const fbData = await fbResponse.json();
                        if (fbData.error) throw new Error(`Gemini unavailable; OpenAI fallback also failed: ${fbData.error.message}`);
                        completion = fbData.choices[0].message.content;
                    } else {
                        throw geminiErr;
                    }
                }

            } else if (aiProvider === 'openai') {
                if (!openaiApiKey) {
                    return { type: 'text', content: "Current Provider is set to OpenAI, but no API Key is configured in Settings." };
                }

                // Safety check for model name collision
                const openAIModel = (selectedModel && selectedModel.includes('gpt')) ? selectedModel : 'gpt-4o';

                try {
                    const cleanHistory = contextMessages.map(m => ({
                        role: m.role === 'user' ? 'user' : 'assistant',
                        content: String(m.content || "")
                    }));

                    const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${openaiApiKey} `
                        },
                        body: JSON.stringify({
                            model: openAIModel,
                            messages: [
                                { role: 'system', content: systemPrompt },
                                ...cleanHistory,
                                { 
                                    role: 'user', 
                                    content: this._formatOpenAIContent(prompt, useContextStore.getState().sharedContext)
                                }
                            ],
                            temperature: temperature || 0.7,
                            max_tokens: 4000,
                            stop: ["(Go)", "task_boundary", "thought", "notify_user"]
                        })
                    });

                    const data = await response.json();

                    if (data.error) {
                        return { type: 'text', content: `OpenAI API Error: ${data.error.message} (Model: ${openAIModel})` };
                    }

                    completion = data.choices[0].message.content;
                } catch (err) {
                    return { type: 'text', content: `Connection Error to OpenAI: ${err.message} ` };
                }

            } else if (aiProvider === 'ollama' || aiProvider === 'lm-studio') {
                const baseUrl = aiProvider === 'lm-studio' ? 'http://localhost:1234/v1/chat/completions' : 'http://localhost:11434/api/chat';
                // Ollama specific format often matches OpenAI but raw Ollama API is separate.
                // Using Ollama Chat API
                const body = aiProvider === 'lm-studio' ? {
                    // LM Studio OpenAI Compat
                    model: selectedModel || 'local-model',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...contextMessages,
                        { role: 'user', content: prompt }
                    ],
                    temperature: temperature || 0.7
                } : {
                    // Native Ollama
                    model: selectedModel || 'mistral',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...contextMessages,
                        { role: 'user', content: prompt }
                    ],
                    stream: false,
                    options: {
                        temperature: temperature || 0.7,
                        top_p: topP || 0.95,
                    }
                };

                const response = await fetchWithTimeout(baseUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await response.json();

                if (aiProvider === 'lm-studio') {
                    completion = data.choices[0].message.content;
                } else {
                    completion = data.message.content;
                }

            } else if (aiProvider === 'anthropic') {
                if (!anthropicApiKey) {
                    return { type: 'text', content: "Please enter your Anthropic API Key in Settings." };
                }

                try {
                    // Map generic system prompt to Anthropic format if needed, 
                    // or just prepend to messages if using 'messages' API with 'system' param.
                    // Claude 3 Messages API supports 'system' parameter.

                    const cleanHistory = contextMessages.map(m => ({
                        role: m.role === 'user' ? 'user' : 'assistant',
                        content: String(m.content || "")
                    }));

                    const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
                        method: 'POST',
                        headers: {
                            'x-api-key': anthropicApiKey,
                            'anthropic-version': '2023-06-01',
                            'content-type': 'application/json',
                            // 'anthropic-dangerous-direct-browser-access': 'true' // ENABLE if running in browser, but Electron has Node rights?
                            // In Electron renderer (frontend), we have CORS issues unless we use IPC or hazardous header.
                            // For now, let's try dangerous header since it's a local app.
                            'anthropic-dangerous-direct-browser-access': 'true'
                        },
                        body: JSON.stringify({
                            model: selectedModel || 'claude-3-sonnet-20240229',
                            max_tokens: 4096,
                            system: systemPrompt,
                            messages: [
                                ...cleanHistory,
                                { 
                                    role: 'user', 
                                    content: this._formatAnthropicContent(prompt, useContextStore.getState().sharedContext)
                                }
                            ],
                            temperature: temperature || 0.7
                        })
                    });

                    const data = await response.json();

                    if (data.error) {
                        return { type: 'text', content: `Anthropic Error: ${data.error.message}` };
                    }

                    completion = data.content[0].text;

                } catch (err) {
                    console.error("Anthropic Fetch Error:", err);
                    return { type: 'text', content: `Connection Error to Anthropic: ${err.message}` };
                }

            } else {
                completion = `Provider ${aiProvider} is not fully configured. Please check Settings.`;
            }



            // 6. Parse Response
            // Define finalDisplay (visual text) and finalSpeech (spoken text)
            // Define finalDisplay (visual text) and finalSpeech (spoken text)
            let finalDisplay = completion;
            let finalSpeech = completion;

            // Clean up [INTENT] tags from display if present
            finalDisplay = finalDisplay.replace(/\[INTENT:[^\]]+\]/g, '').trim();
            finalSpeech = finalSpeech.replace(/\[INTENT:[^\]]+\]/g, '').trim();

            // STRICT GUARD: Check for hallucinated tool calls
            const bannedPatterns = [
                /\(Go\)\.\s*\(Tools\)\./i,
                /notify_user/i,
                /task_boundary/i,
                /Planning Mode/i,
                /run_command/i
            ];

            let hasViolation = bannedPatterns.some(p => p.test(completion));

            if (hasViolation) {
                console.warn("[Router] Violation detected in output. Retrying with strict repair prompt...");
                // Retry Logic: Ask for repair
                try {
                    const repairPrompt = "Previous response contained forbidden tool usage. Return ONLY the final answer to the user in 1-2 sentences. No tools, no planning, no meta.";
                    // We need to call the provider again. Ideally, we'd refactor `query` to be recursive or use a helper,
                    // but for now, we will just simulate a quick repair call using the same provider logic (simplified).
                    // Since `query` is big, let's just use the `completion` content WE WANTED if possible?
                    // No, the completion IS the violation.

                    // If we are in this block, `completion` is tainted.
                    // We will return a safe fallback message to prevent the loop, 
                    // effectively "failing closed" to a safe state rather than displaying the loop.
                    completion = "I am focusing on our conversation. How can I help?";

                    // Overwrite final display
                    finalDisplay = completion;
                    finalSpeech = completion;
                } catch (e) {
                    console.error("Repair failed", e);
                    finalDisplay = "Error: Output violation.";
                    finalSpeech = "Error.";
                }
            } else {
                finalDisplay = completion;
                finalSpeech = completion;
            }

            // Secondary Regex Cleanup (just in case)
            bannedPatterns.forEach(pattern => {
                finalDisplay = finalDisplay.replace(new RegExp(pattern, 'gi'), '');
                finalSpeech = finalSpeech.replace(new RegExp(pattern, 'gi'), '');
            });

            finalDisplay = finalDisplay.trim();
            finalSpeech = finalSpeech.trim();

            // Safety: If sanitization removed everything, use a fallback
            if (!finalDisplay || finalDisplay.length === 0) {
                console.warn("[Router] Response was empty after sanitization. Using fallback.");
                finalDisplay = "Ready.";
                finalSpeech = "Ready.";
            }

            console.log("[Router] Final response:", { finalDisplay, finalSpeech });

            let graphData = null;
            try {
                graphData = safeExtractJSON(completion);
            } catch (e) {
                console.error("[Router] Parser error:", e);
            }

            if (graphData) {
                // ... (keep graph logic) ...
                if (graphData.operations && Array.isArray(graphData.operations)) {
                    return {
                        type: 'workflow_edit_proposal',
                        content: graphData.summary || "Proposed changes to workflow.",
                        data: graphData
                    };
                } else if (intent === 'ENGINEER' || graphData.nodes) {
                    return {
                        type: 'workflow_proposal',
                        content: "I have designed a workflow for you.",
                        data: graphData
                    };
                }
            }



            // Check for Structured Proposals (Persona Protocol)
            const proposalMatch = completion.match(/\[PROPOSAL\]([\s\S]*?)\[\/PROPOSAL\]/);
            if (proposalMatch) {
                try {
                    const proposalData = JSON.parse(proposalMatch[1]);
                    return {
                        type: 'proposal',
                        content: finalDisplay.replace(proposalMatch[0], '').trim(), // Remove JSON from chat
                        data: proposalData,
                        speech: finalSpeech
                    };
                } catch (e) {
                    console.error("Proposal JSON Parse Error", e);
                }
            }

            // Check for Structured Plans (Persona Protocol)
            const planMatch = completion.match(/\[PLAN\]([\s\S]*?)\[\/PLAN\]/);
            if (planMatch) {
                try {
                    const planData = JSON.parse(planMatch[1]);
                    return {
                        type: 'plan',
                        content: finalDisplay.replace(planMatch[0], '').trim(),
                        data: planData,
                        speech: finalSpeech
                    };
                } catch (e) {
                    console.error("Plan JSON Parse Error", e);
                }
            }

            // Legacy Proposal Check (Standard Actionable Code)
            if (completion.includes('PROPOSAL:') || completion.includes('ACTION_REQUEST:') || completion.includes('ACTION:')) {
                return {
                    type: 'proposal',
                    content: finalDisplay,
                    data: { title: "Suggested Action", raw: completion },
                    speech: finalSpeech
                };
            }

            return {
                type: 'text',
                content: finalDisplay,
                speech: finalSpeech
            };
        } catch (e) {
            console.error("[Router] Query Fatal Error:", e);
            return {
                type: 'text',
                content: `Error: ${e.message}`,
                speech: "Error."
            };
        }
    }

    detectIntent(text) {
        const { activePersona } = useSettingsStore.getState();
        if (activePersona && activePersona !== 'auto') {
            return activePersona.toUpperCase();
        }

        const t = text.toLowerCase();

        // ENGINEER only if explicit action or heavy technical terminology not in a conversational context
        if (t.match(/(run|execute|start|launch)\s+(the\s+)?(workflow|graph|sequence)/)) return 'ENGINEER';

        if (t.match(/(audit|verify|safety|risk|evaluate|check)\s+(code|change|system|logic)/)) return 'AUDITOR';
        if (t.match(/(research|search|find|list|gather)/)) return 'RESEARCHER';
        if (t.match(/(architect|structure|design|plan)/)) return 'ARCHITECT';
        if (t.match(/(build|create|write|code|implement|draft)/)) return 'BUILDER';
        if (t.match(/(edit|revise|change|update|fix)/)) return 'EDITOR';
        if (t.match(/(decide|choose|pick)/)) return 'STRATEGIST';

        // Conversational check for workflow talk
        if (t.match(/(flow|node|wire|pipeline|automation)/) && !t.includes('talk') && !t.includes('speak') && !t.includes('respond')) {
            return 'ENGINEER';
        }

        if (t.match(/(think|opinion|should|review|critique|idea|thoughts)/)) return 'CONSULTANT';

        return 'COMPANION';
    }

    getSkillSystemPrompt(skill) {
        if (skill === 'CUSTOM') {
            const { customPersonaPrompt } = useSettingsStore.getState();
            return customPersonaPrompt?.trim() || "ROLE: Companion. Be helpful and concise.";
        }

        const prompts = {
            RESEARCHER: `ROLE: Researcher. You are precise and thorough. Synthesize facts into clear, actionable insights. Use bullet points for density.`,
            ARCHITECT: `ROLE: Architect (Thinker). Owns system intent and correctness. Defines Inner World semantics, state models, and simulation rules. Never touches code; output is strictly declarative. Produces structured plans with acceptance criteria and textual state diagrams.`,
            BUILDER: `ROLE: Builder. You are a pragmatist. Write clean, modern, and efficient code. Focus on implementation details and best practices. Output code directly.`,
            EDITOR: `ROLE: Editor. Refine text for impact, clarity, and tone. Be ruthless but constructive.`,
            STRATEGIST: `ROLE: Strategist. Weigh options and follow second-order effects. Recommend the highest-leverage path.`,
            CONSULTANT: `ROLE: Consultant. You are a creative partner. Have an opinion. Do not be generic or neutral. Use your knowledge of the project to offer specific advice. If asked “should I”, say Yes or No with reasoning.`,
            AUDITOR: `ROLE: Auditor (Safety). Evaluate proposed changes for safety, determinism, and reversibility. Operate in READ-ONLY mode. Verify no side effects, infinite loops, or unauthorized state transitions. Communicate findings as explicit PASS/FAIL reports with risk summaries.`,
            ENGINEER: `ROLE: Workflow Engineer. Utilize the visual workflow graph to automate tasks. Read the JSON graph and output JSON graph updates. Understand nodes (HTTP, JS, AI, Storage) and edges. If asked to run, output ACTION: Start.`,
            COMPANION: `ROLE: Companion. You are a present and discerning collaborator. Not a digital assistant -- a partner. Speak like a friend deeply interested in the user's work. Be concise, warm, and intellectually rigorous. Skip generic openers; pick up on subtext and help maintain creative flow.`,
        };
        return prompts[skill] || prompts.COMPANION;
    }

    async getWeather(tz) { return "72F Sunny"; }
    async performSearch(q) { return "Simulated Search Results"; }

    // ─── Agentic Tool-Use Methods ────────────────────────────────────────────

    async queryWithTools(messages, tools, onChunk = null) {
        // Sort tools alphabetically so the serialized payload is deterministic across calls,
        // maximizing prompt-cache hits on providers that cache tool definitions.
        const sortedTools = [...tools].sort((a, b) => a.name.localeCompare(b.name));

        const { aiProvider, geminiApiKey, openaiApiKey, anthropicApiKey, model: selectedModel, temperature } = useSettingsStore.getState();

        const { soulLoader } = await import('../soul/SoulLoader');
        const soulContext = soulLoader.getSoulContext();

        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

        let skillsContext = '';
        try {
            const { skillLoader } = await import('../soul/SkillLoader');
            skillsContext = await skillLoader.getSkillsForPrompt();
        } catch { /* non-fatal */ }

        const { sharedContext } = useContextStore.getState();
        const hasVision = sharedContext?.screenshot && (Date.now() - sharedContext.timestamp < 300000);

        // Structured perception context for the tool-use system prompt
        const { usePerceptionStore: usePS } = await import('../perception/PerceptionStore.js').catch(() => ({ usePerceptionStore: null }));
        const toolPerception = usePS?.getState().current ?? null;
        const toolIntent     = usePS?.getState().lastIntent ?? null;
        const perceptionBlock = toolPerception
            ? `SCREEN STATE (last perception scan):
- App: ${toolPerception.app} | Panel: ${toolPerception.active_panel}
- Intent: ${toolIntent?.intent || 'unknown'} (${Math.round((toolIntent?.confidence || 0) * 100)}% confidence)
- Visible Text: ${toolPerception.visible_text.slice(0, 4).join(' | ') || 'none'}
- UI Elements: ${toolPerception.ui_elements.map(e => `${e.type}:${e.text || e.placeholder || e.href}`).join(', ') || 'none'}
${toolPerception.has_error ? '- ⚠ Error content visible on screen' : ''}`
            : '';

        const systemPrompt = `You are Antigravity, an AI orchestrator with access to a "Pack" of specialized sub-agents.
Use tools to fulfill the user's request. For complex, long-running, or multi-step tasks (research, coding, auditing), prefer delegating to a specialist via the "spawn_agent" tool.

THE PACK:
- The Scribe (researcher): Best for deep web research and citations.
- The Artificer (builder): Best for code generation and file operations.
- The Sentinel (auditor): Best for security reviews and logic checks.

VISION & SCREEN AWARENESS:
You have structured screen perception. When the user asks what is on their screen or needs screen-based help:
1. Call "get_screen_context" — it captures a screenshot AND runs OCR to extract visible text, UI elements, cursor position, and infers user intent.
2. The tool returns a structured SCREEN PERCEPTION REPORT. Reason over the structured data first, then confirm with the screenshot attached to your visual context.
3. Be specific: reference exact text, button labels, and error messages from the structured report.
${hasVision ? '⚡ A recent screenshot is already attached to this message. You can describe what you see directly.' : ''}
${perceptionBlock ? `\n${perceptionBlock}` : ''}

When you spawn an agent, you can continue the conversation with the user. The specialist will report its findings back to this chat when complete.
${soulContext}
${skillsContext}
Current time: ${timeStr}, ${dateStr}`;

        if (aiProvider === 'anthropic') {
            return this._queryToolsAnthropic(messages, sortedTools, systemPrompt, { anthropicApiKey, selectedModel, temperature, sharedContext });
        } else if (aiProvider === 'openai') {
            return this._queryToolsOpenAI(messages, sortedTools, systemPrompt, { openaiApiKey, selectedModel, temperature, sharedContext });
        } else if (aiProvider === 'gemini') {
            return this._queryToolsGemini(messages, sortedTools, systemPrompt, { geminiApiKey, selectedModel, temperature, sharedContext });
        } else {
            return { type: 'text', content: 'Tool use requires Anthropic, OpenAI, or Gemini as the active provider.' };
        }
    }

    _formatOpenAIContent(text, sharedContext) {
        if (!sharedContext?.screenshot || (Date.now() - sharedContext.timestamp > 300000)) {
            return text;
        }
        return [
            { type: "text", text },
            {
                type: "image_url",
                image_url: { url: sharedContext.screenshot }
            }
        ];
    }

    _formatAnthropicContent(text, sharedContext) {
        if (!sharedContext?.screenshot || (Date.now() - sharedContext.timestamp > 300000)) {
            return text;
        }
        const base64Image = sharedContext.screenshot.replace(/^data:image\/(png|jpeg);base64,/, "");
        const mediaType = sharedContext.screenshot.match(/^data:(image\/[a-z]+);base64/)?.[1] || "image/png";
        
        return [
            { type: "text", text },
            {
                type: "image",
                source: {
                    type: "base64",
                    media_type: mediaType,
                    data: base64Image
                }
            }
        ];
    }

    async _queryToolsAnthropic(messages, tools, systemPrompt, { anthropicApiKey, selectedModel, temperature, sharedContext }) {
        if (!anthropicApiKey) return { type: 'text', content: 'Anthropic API key required for agent mode.' };

        const anthropicTools = tools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters
        }));

        const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': anthropicApiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: selectedModel?.startsWith('claude') ? selectedModel : 'claude-sonnet-4-6',
                max_tokens: 4096,
                system: systemPrompt,
                tools: anthropicTools,
                messages: this._toAnthropicMessages(messages, sharedContext),
                temperature: temperature || 0.7
            })
        });

        const data = await response.json();
        if (data.error) return { type: 'text', content: `Anthropic Error: ${data.error.message}` };

        if (data.stop_reason === 'tool_use') {
            const toolCalls = data.content
                .filter(b => b.type === 'tool_use')
                .map(b => ({ id: b.id, name: b.name, args: b.input }));
            return { type: 'tool_calls', toolCalls };
        }

        const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
        return { type: 'text', content: text };
    }

    async _queryToolsOpenAI(messages, tools, systemPrompt, { openaiApiKey, selectedModel, temperature, sharedContext }) {
        if (!openaiApiKey) return { type: 'text', content: 'OpenAI API key required for agent mode.' };

        const openAITools = tools.map(t => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.parameters }
        }));

        const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
                model: selectedModel?.startsWith('gpt') ? selectedModel : 'gpt-4o',
                messages: [{ role: 'system', content: systemPrompt }, ...this._toOpenAIMessages(messages, sharedContext)],
                tools: openAITools,
                temperature: temperature || 0.7
            })
        });

        const data = await response.json();
        if (data.error) return { type: 'text', content: `OpenAI Error: ${data.error.message}` };

        const choice = data.choices[0];
        if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
            const toolCalls = choice.message.tool_calls.map(tc => ({
                id: tc.id,
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments)
            }));
            return { type: 'tool_calls', toolCalls };
        }

        return { type: 'text', content: choice.message.content || '' };
    }

    async _queryToolsGemini(messages, tools, systemPrompt, { geminiApiKey, selectedModel, temperature, sharedContext }) {
        if (!geminiApiKey) return { type: 'text', content: 'Gemini API key required for agent mode.' };

        if (!this.genAI || this.lastGeminiKey !== geminiApiKey) {
            this.genAI = new GoogleGenerativeAI(geminiApiKey);
            this.lastGeminiKey = geminiApiKey;
        }

        const functionDeclarations = tools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters
        }));

        const model = this.genAI.getGenerativeModel({
            model: selectedModel || 'gemini-1.5-flash',
            tools: [{ functionDeclarations }],
            systemInstruction: systemPrompt,
            generationConfig: { temperature: temperature || 0.7 }
        });

        const history = this._toGeminiMessages(messages.slice(0, -1));
        const lastMsg = messages[messages.length - 1];
        const chat = model.startChat({ history });

        // Build the parts to send based on the last message type
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
            console.log("[Router] Sending functionResponse to Gemini for tool:", lastMsg.toolName);
            // If we have a screenshot, we'll send it as a follow-up after the functionResponse
            shouldFollowUpWithImage = !!(sharedContext?.screenshot && (Date.now() - sharedContext.timestamp < 300000));
        } else {
            // Normal user message — can include image inline
            messageParts.push(lastMsg?.content || '');
            if (sharedContext?.screenshot && (Date.now() - sharedContext.timestamp < 300000)) {
                const base64Image = sharedContext.screenshot.replace(/^data:image\/(png|jpeg);base64,/, "");
                messageParts.push({
                    inlineData: {
                        data: base64Image,
                        mimeType: "image/png"
                    }
                });
                console.log("[Router] Attaching screenshot to Gemini user message");
            }
        }

        let result = await chat.sendMessage(messageParts);
        let parts = result.response.candidates?.[0]?.content?.parts || [];

        // Follow-up: If the last message was a tool result AND we have a screenshot,
        // send the image in a second turn so the model can actually see it
        if (shouldFollowUpWithImage) {
            const base64Image = sharedContext.screenshot.replace(/^data:image\/(png|jpeg);base64,/, "");
            console.log("[Router] Sending follow-up screenshot to Gemini for visual analysis");
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

    _toAnthropicMessages(messages, sharedContext) {
        const result = [];
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (msg.role === 'system') continue; // Anthropic system is a separate param
            if (msg.role === 'user') {
                // If it's the last user message, attach vision context
                const isLastUser = !messages.slice(i + 1).some(m => m.role === 'user');
                const content = isLastUser
                    ? this._formatAnthropicContent(msg.content || '', sharedContext)
                    : (msg.content || '');
                result.push({ role: 'user', content });
            } else if (msg.role === 'assistant') {
                if (msg.toolCalls?.length) {
                    result.push({
                        role: 'assistant',
                        content: msg.toolCalls.map(tc => ({
                            type: 'tool_use', id: tc.id, name: tc.name, input: tc.args
                        }))
                    });
                } else {
                    result.push({ role: 'assistant', content: msg.content || '' });
                }
            } else if (msg.role === 'tool') {
                // Anthropic requires tool_result to follow an assistant message with tool_use
                const prev = result[result.length - 1];
                const prevHasToolUse = prev?.role === 'assistant' && Array.isArray(prev?.content) && prev.content.some(c => c.type === 'tool_use');
                if (prevHasToolUse) {
                    result.push({
                        role: 'user',
                        content: [{ type: 'tool_result', tool_use_id: msg.toolCallId, content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '') }]
                    });
                } else {
                    console.warn('[Router] Dropping orphaned tool result from Anthropic history:', msg.toolCallId);
                }
            }
        }
        return result;
    }

    _toOpenAIMessages(messages, sharedContext) {
        // First pass: convert all messages
        const converted = messages
            .filter(msg => msg.role !== 'system') // OpenAI system goes as a separate param
            .map((msg, i) => {
                if (msg.role === 'tool') {
                    return {
                        role: 'tool',
                        tool_call_id: msg.toolCallId || `tool_${i}`,
                        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '')
                    };
                }
                if (msg.toolCalls?.length) {
                    return {
                        role: 'assistant',
                        content: null,
                        tool_calls: msg.toolCalls.map(tc => ({
                            id: tc.id, type: 'function',
                            function: { name: tc.name, arguments: JSON.stringify(tc.args) }
                        }))
                    };
                }
                const isLastUser = msg.role === 'user' && !messages.slice(i + 1).some(m => m.role === 'user');
                const content = isLastUser
                    ? this._formatOpenAIContent(msg.content || '', sharedContext)
                    : (msg.content || '');
                return { role: msg.role === 'assistant' ? 'assistant' : 'user', content };
            });

        // Second pass: remove orphaned tool messages (not preceded by assistant with tool_calls)
        // OpenAI strictly requires: assistant[tool_calls] → tool → tool → ... pattern
        const sanitized = [];
        for (let i = 0; i < converted.length; i++) {
            const msg = converted[i];
            if (msg.role === 'tool') {
                const prev = sanitized[sanitized.length - 1];
                // Only include if the immediately preceding message is an assistant with tool_calls
                if (prev?.role === 'assistant' && prev?.tool_calls?.length) {
                    sanitized.push(msg);
                } else {
                    console.warn('[Router] Dropping orphaned tool message from history:', msg.tool_call_id);
                }
            } else {
                sanitized.push(msg);
            }
        }
        return sanitized;
    }

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

    _formatOpenAIContent(text, sharedContext) {
        if (!sharedContext?.screenshot || (Date.now() - sharedContext.timestamp > 300000)) {
            return text;
        }

        const base64Image = sharedContext.screenshot.replace(/^data:image\/(png|jpeg);base64,/, "");
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

    _formatAnthropicContent(text, sharedContext) {
        if (!sharedContext?.screenshot || (Date.now() - sharedContext.timestamp > 300000)) {
            return text;
        }

        const base64Image = sharedContext.screenshot.replace(/^data:image\/(png|jpeg);base64,/, "");
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

    async classifyInteractionType(text) {
        // Fast, lightweight classification for safety
        const { geminiApiKey } = useSettingsStore.getState();
        if (!geminiApiKey) return { type: 'conversation' };

        try {
            if (!this.genAI) {
                this.genAI = new GoogleGenerativeAI(geminiApiKey);
            }

            const model = this.genAI.getGenerativeModel({
                model: "gemini-1.5-flash",
                generationConfig: { responseMimeType: "application/json" }
            });

            const prompt = `Classify this user input.
            Categories:
        - conversation: Chat, questions, reasoning, creative requests.
        - command: Project management, creating / deleting things, explicit configuration changes.
        - workflow_action: Running, stopping, or editing the workflow / graph explicitly.
        - system_control: App - level controls(volume, window, reload).

            Input: "${text}"
        
        Output JSON: { "type": "conversation" | "command" | "workflow_action" | "system_control" } `;

            const result = await model.generateContent(prompt);
            const textResult = result.response.text();

            // Safety parse
            try {
                return JSON.parse(textResult);
            } catch (e) {
                // Fallback for malformed JSON
                const match = textResult.match(/"type":\s*"(\w+)"/);
                if (match) return { type: match[1] };
                return { type: 'conversation' };
            }

        } catch (e) {
            console.error("[Router] Classification failed:", e);
            return { type: 'conversation' }; // Fail open (allow chat)
        }
    }




    async transcribeAudio(audioBlob) {
        const { geminiApiKey, openaiApiKey } = useSettingsStore.getState();
        const { speechProvider } = useSpeechStore.getState();

        // Providers
        const runGemini = async () => {
            if (!geminiApiKey) throw new Error("Gemini Key missing");
            // Init if missing
            if (!this.genAI || this.lastGeminiKey !== geminiApiKey) {
                this.genAI = new GoogleGenerativeAI(geminiApiKey);
                this.lastGeminiKey = geminiApiKey;
            }

            // Convert Blob to Base64
            const reader = new FileReader();
            return new Promise((resolve, reject) => {
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64Audio = reader.result.split(',')[1];
                    const mimeType = reader.result.split(';')[0].split(':')[1] || 'audio/webm';

                    const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                    const result = await model.generateContent([
                        { inlineData: { mimeType: mimeType, data: base64Audio } },
                        { text: "Transcribe this audio. Output ONLY the words spoken, no punctuation or filler." }
                    ]);
                    resolve(result.response.text());
                };
                reader.onerror = reject;
            });
        };

        const runOpenAI = async () => {
            if (!openaiApiKey) throw new Error("OpenAI Key missing");
            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.webm');
            formData.append('model', 'whisper-1');

            const response = await fetchWithTimeout('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${openaiApiKey} ` },
                body: formData
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            return data.text;
        };

        try {
            console.log(`[Router] Transcribing via ${speechProvider}...`);
            if (speechProvider === 'gemini') return await runGemini();
            else return await runOpenAI();
        } catch (error) {
            console.error(`[Router] Transcription failed(${speechProvider}): `, error);
            // Fallback?
            if (speechProvider === 'gemini' && openaiApiKey) {
                console.log("[Router] Fallback to OpenAI...");
                return await runOpenAI();
            }
            throw error;
        }
    }

    async synthesizeAudio(text) {
        const { openaiApiKey } = useSettingsStore.getState();
        const { voiceId } = useSpeechStore.getState(); // Get configured voice

        if (!openaiApiKey) {
            console.warn("[Router] No OpenAI Key for TTS");
            return null;
        }

        try {
            const response = await fetchWithTimeout('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openaiApiKey} `,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'tts-1',
                    input: text,
                    voice: voiceId || 'alloy' // Use setting or default
                })
            });

            if (!response.ok) throw new Error("TTS Failed");
            return await response.blob();
        } catch (e) {
            console.error("[Router] TTS Error:", e);
            return null;
        }
    }
}

export const llmRouter = new LLMRouter();
