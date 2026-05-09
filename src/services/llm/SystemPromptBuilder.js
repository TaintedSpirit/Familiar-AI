import { useSettingsStore } from "../settings/SettingsStore";
import { useMemoryStore } from "../memory/MemoryStore";
import { useWorkflowStore } from "../workflow/WorkflowStore";
import { workflowEngine } from "../workflow/WorkflowEngine";
import { useVisionStore } from "../vision/VisionStore";
import { useContextStore } from "../context/ContextStore";
import { FormCapabilities } from "../forms/FormCapabilities";
import { COMPANION_PERSONA, detectExplainMode } from "./Persona";
import { projectMemoryClient } from "../memory2/MemoryClient";
import { detectIntent, getSkillPrompt } from "./IntentClassifier";

/**
 * SystemPromptBuilder — assembles the complete system prompt for both
 * plain chat mode and agentic tool-use mode.
 *
 * Extracted from Router.js lines 49-226 (chat prompt) and 696-744 (agent prompt).
 * All context gathering (stores, perception, soul, memory recall) lives here.
 */

// ── Chat Mode Prompt ───────────────────────────────────────────────────────

/**
 * Build the full system prompt for plain chat mode.
 *
 * Gathers context from: settings, memory, perception, vision, soul, workflow,
 * time/date, and research results.
 *
 * @param {string} prompt — the user's message (used for memory recall + search).
 * @param {string} intent — detected intent from IntentClassifier.
 * @returns {Promise<{systemPrompt: string, searchResults: string, websiteContent: string}>}
 */
export async function buildChatPrompt(prompt, intent) {
    const settings = useSettingsStore.getState();
    const { autonomyLevel } = settings;

    // Keep project memory embedding key in sync
    if (settings.geminiApiKey && settings.geminiApiKey !== buildChatPrompt._lastEmbedKey) {
        buildChatPrompt._lastEmbedKey = settings.geminiApiKey;
        projectMemoryClient.setEmbeddingKey(settings.geminiApiKey).catch(() => { });
    }

    // Project context
    const { activeProjectId, projects, getActiveProject } = useMemoryStore.getState();
    const currentProject = projects.find(p => p.id === activeProjectId);
    const projectName = currentProject?.name || "General";
    const projectContext = currentProject?.description || "No active project.";

    // Intent → skill prompt
    const basePrompt = getSkillPrompt(intent, settings.customPersonaPrompt);

    // Time context
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateString = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Weather (only if relevant to the message)
    let weatherInfo = "Not requested";
    if (prompt.toLowerCase().match(/(weather|temperature|outside|hot|cold|rain)/)) {
        weatherInfo = "72F Sunny"; // Placeholder — will be replaced with real API
    }

    // Research (if intent is RESEARCHER)
    let searchResults = "";
    if (intent === 'RESEARCHER') {
        searchResults = "Simulated Search Results"; // Placeholder — will be replaced with search SDK
    }

    // Desktop context
    const { activeApp, activeTitle, awarenessEnabled, focusMode } = useContextStore.getState();

    // Vision state
    const { visionStatus } = useVisionStore.getState();

    // Auto-detect and scrape URLs in the prompt — only when awareness is on,
    // otherwise the familiar would react to every URL the user mentions even
    // with vision/awareness explicitly disabled.
    let websiteContent = "";
    if (awarenessEnabled) {
        const urlMatch = prompt.match(/https?:\/\/[^\s]+/);
        if (urlMatch && window.electronAPI && window.electronAPI.scrapeUrl) {
            websiteContent = await window.electronAPI.scrapeUrl(urlMatch[0]);
            if (websiteContent.length > 2000) websiteContent = websiteContent.substring(0, 2000) + "...[truncated]";
        }
    }

    // Structured perception — only consulted when awareness is on. Stale
    // perception from a previous session would otherwise leak into every prompt.
    const { usePerceptionStore } = awarenessEnabled
        ? await import('../perception/PerceptionStore.js').catch(() => ({ usePerceptionStore: null }))
        : { usePerceptionStore: null };
    const perception = usePerceptionStore?.getState().current ?? null;
    const lastIntent = usePerceptionStore?.getState().lastIntent ?? null;

    // Explain mode
    const isExplainMode = detectExplainMode(prompt);

    // Soul context
    let soulContext = '';
    try {
        const { soulLoader } = await import('../soul/SoulLoader');
        if (!soulLoader.isLoaded()) await soulLoader.load();
        soulContext = soulLoader.getSoulContext();
    } catch { /* non-fatal */ }

    // Long-term memory recall
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
        console.warn('[SystemPromptBuilder] memory recall skipped:', e?.message);
    }

    // Autonomy instruction
    let autonomyInstruction = "";
    if (autonomyLevel < 40) autonomyInstruction = "AUTONOMY: LOW. You are cautious. ALWAYS ask for confirmation before proposing complex actions. Drafts are tentative.";
    else if (autonomyLevel >= 80) autonomyInstruction = "AUTONOMY: HIGH. You are trusted. Be bold. Assume approval for standard tasks. Frame proposals as 'ready to execute'.";
    else autonomyInstruction = "AUTONOMY: BALANCED. Propose actions clearly but wait for user alignment.";

    // Trust level & threads
    const project = getActiveProject();
    const activeProjectTrust = project?.trustLevel || 'observe';
    const activeThreads = project?.threads?.filter(t => t.status === 'active') || [];

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
- Active Window: ${awarenessEnabled && activeTitle ? `${activeTitle} (${activeApp || "Unknown"})` : "Awareness disabled"}
- Vision: ${visionStatus === 'live' ? "Live View Available" : "Stale/Offline"}
- Focus Goal: ${focusMode.active ? focusMode.goal : "None"}
${lastIntent ? `- Inferred Intent: ${lastIntent.intent} (${Math.round(lastIntent.confidence * 100)}% confidence)` : ''}
${perception?.visible_text?.length ? `- Screen Content: ${perception.visible_text.slice(0, 3).join(' | ')}` : ''}
${perception?.has_error ? '- ⚠ Error detected on screen' : ''}

${searchResults ? `RESEARCH DATA:\n${searchResults}` : ''}
${websiteContent ? `WEBSITE CONTEXT:\n${websiteContent}` : ''}
    `;

    return {
        systemPrompt,
        searchResults,
        websiteContent
    };
}

// Static state for embedding key dedup
buildChatPrompt._lastEmbedKey = null;

// ── Agent / Tool-Use Mode Prompt ───────────────────────────────────────────

/**
 * Build the system prompt for agentic tool-use mode.
 *
 * Simpler than the chat prompt — focuses on the Pack delegation model,
 * vision awareness, and soul/skill context.
 *
 * @param {object} settings — full settings store snapshot.
 * @returns {Promise<string>} The agent system prompt.
 */
export async function buildAgentPrompt(settings) {
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
    const hasVision = !!(sharedContext?.screenshot && (Date.now() - sharedContext.timestamp < 300000));

    // MCP resources — surfaced so the model knows what's readable via read_mcp_resource.
    let mcpResourcesBlock = '';
    try {
        const { mcpLoader } = await import('../agent/MCPLoader');
        const resources = mcpLoader.getResources();
        if (resources.length > 0) {
            const lines = resources.slice(0, 40).map(r =>
                `- ${r.uri}  (server: ${r.serverName}${r.mimeType ? `, ${r.mimeType}` : ''})${r.description ? ` — ${r.description}` : ''}`
            );
            const more = resources.length > 40 ? `\n…and ${resources.length - 40} more.` : '';
            mcpResourcesBlock = `\nMCP RESOURCES (read with read_mcp_resource):\n${lines.join('\n')}${more}`;
        }
    } catch { /* non-fatal */ }

    // Structured perception for tool-use
    const { usePerceptionStore } = await import('../perception/PerceptionStore.js').catch(() => ({ usePerceptionStore: null }));
    const toolPerception = usePerceptionStore?.getState().current ?? null;
    const toolIntent = usePerceptionStore?.getState().lastIntent ?? null;
    const perceptionBlock = toolPerception
        ? `SCREEN STATE (last perception scan):
- App: ${toolPerception.app} | Panel: ${toolPerception.active_panel}
- Intent: ${toolIntent?.intent || 'unknown'} (${Math.round((toolIntent?.confidence || 0) * 100)}% confidence)
- Visible Text: ${toolPerception.visible_text.slice(0, 4).join(' | ') || 'none'}
- UI Elements: ${toolPerception.ui_elements.map(e => `${e.type}:${e.text || e.placeholder || e.href}`).join(', ') || 'none'}
${toolPerception.has_error ? '- ⚠ Error content visible on screen' : ''}`
        : '';

    return `You are Antigravity, an AI orchestrator with access to a "Pack" of specialized sub-agents.
Use tools to fulfill the user's request. For complex, long-running, or multi-step tasks (research, coding, auditing), prefer delegating to a specialist via the "spawn_agent" tool.

THE PACK:
- The Scribe (researcher): Best for deep web research and citations.
- The Artificer (builder): Best for code generation and file operations.
- The Sentinel (auditor): Best for security reviews and logic checks.
- The Codewright (claude code): Best for real coding work — file edits, refactors, multi-file changes, anything the in-app file tools can't finish in one shot. Invoke directly with the run_claude_code tool (not via spawn_agent).

VISION & SCREEN AWARENESS:
You have structured screen perception. When the user asks what is on their screen or needs screen-based help:
1. Call "get_screen_context" — it captures a screenshot AND runs OCR to extract visible text, UI elements, cursor position, and infers user intent.
2. The tool returns a structured SCREEN PERCEPTION REPORT. Reason over the structured data first, then confirm with the screenshot attached to your visual context.
3. Be specific: reference exact text, button labels, and error messages from the structured report.
${hasVision ? '⚡ A recent screenshot is already attached to this message. You can describe what you see directly.' : ''}
${perceptionBlock ? `\n${perceptionBlock}` : ''}

When you spawn an agent, you can continue the conversation with the user. The specialist will report its findings back to this chat when complete.
${mcpResourcesBlock}
${soulContext}
${skillsContext}
Current time: ${timeStr}, ${dateStr}`;
}
