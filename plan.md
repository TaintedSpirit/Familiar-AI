# Implementation Plan: AI Familiar - Agent Interaction Refinement

## Core Objective
Enhance the AI Familiar into a robust, "living" desktop companion with distinct project contexts, autonomous behaviors, and a premium, highly aesthetic "detached" presence.

## Phase 1: Robust Project Management System (Completed)
- [x] **Enhanced Project Model**: Update `MemoryStore` to support project descriptions, custom "themes" (color/icon), and "last active" timestamps.
- [x] **Project Settings in HUD**: Add ability to:
    - [x] Rename projects.
    - [x] Delete projects (with confirmation).
    - [x] Set a "Context/Goal" for the project (persistent system prompt injection).
- [x] **Context Isolation**: Ensure `llmRouter` pulls specifically from the *active* project's `memory` and `keyDecisions` when generating responses.
- [x] **API Key Configuration**: Add input fields in `SettingsHUD` (`Services > AI`) to persist API keys locally for real communication.

## Phase 2: Autonomous Presence & Rituals (In Progress)
- [x] **Scheduler Service**: Create `src/services/scheduler/Scheduler.js`.
    - [x] Track "user presence" (active interactions).
    - [x] Trigger "Check-ins" after X minutes of inactivity (configurable per project).
- [x] **Rituals UI**: Add a "Ritual" menu to `CommandBar`.
    - [x] Example: "Morning Standup" (Agent summarizes yesterday, asks for today's goal).
    - [x] Example: "Retro" (Agent reviews artifacts created in session).
- [x] **Thinking Mode**: When the agent is "working" (long latency), show a distinct, non-blocking visual state in the Detached Chat (e.g., specific pulse animation).

## Phase 3: Artifact System Evolution
- [x] **Interactive Artifacts**:
    - [x] When a `code_draft` is created, allow the user to click it to open a "Editor Modal" (LogsHUD -> ArtifactEditor).
    - [x] Allow "Edit & Save" back to memory.
    - [x] **Diff View**: Added toggle to view changes vs original version (simple implementation).
- [x] **Trust Dial**: Add a UI slider in `SettingsHUD` to control "verbosity" vs "action" (Validation Mode vs Auto-Execute Mode).

## Phase 4: Premium Detached Chat (Completed)
- [x] **True Transparency**: Ensure the detached window blends perfectly (use `backdrop-blur-xl`).
- [x] **Drag Controls**: Implement proper `dragControls` on the header only, allowing text selection in the body.
- [x] **Micro-animations**: Add entry/exit animations for messages (slide up + fade).

## Phase 5: Workflow Automation Engine (Completed)
- [x] **Visual Node Graph**: Implemented distinct node types (Trigger, JS, LLM, Web, Wait).
- [x] **Execution Engine**: Built robust state machine with sequential execution and event system.
- [x] **Persistent Timers**: Implemented `scheduler` nodes that persist across sessions.
- [x] **Live Visualization**: Added "Playhead" logic, node status indicators, and cinematic camera follow.
- [x] **Log System**: Granular, real-time event logging.

## Phase 6: Voice & Speech (Completed)
- [ ] **Voice Settings**: Connect the "Voice" and "Speech" tabs in SettingsHUD.
- [ ] **Text-to-Speech (TTS)**: Integrate a TTS engine (Web Speech API or ElevenLabs) for agent responses.
- [ ] **Speech-to-Text (STT)**: Add a microphone toggle in the CommandBar for voice input.
### Voice Behavior Rules (Explicit & Testable)

- **Voice Categories**:
  - Conversation — direct responses to user prompts
  - Critical — failures, timeouts, infinite loops, missing secrets, destructive warnings
  - Proactive — optional suggestions or optimizations

- **Hard Guarantees**:
  - When voice is enabled, **Conversation** and **Critical** speech must always play.
  - No gating, suppression, debouncing, or interaction detection may silence these categories.

- **Optional Speech**:
  - Proactive speech may be suppressed.
  - Limit to one proactive voice message per run.
  - Requires explicit user approval for action.

- **TTS Event Contract**:
  - All speech must use:  
    `tts.speak({ text, category: "conversation" | "critical" | "proactive", eventId })`

- **Debug & Verification**:
  - Log every TTS event with `{ eventId, category, spoken, suppressionReason }`
  - “Test Audio Output” must emit a `conversation` event and audibly speak.
  - Audio is considered broken if this test does not speak.



---

## Execution Steps

### Step 1: Refine Rituals Logic
- **Current Issue**: Ritual inputs are currently discard. They need to be saved to the chat history or memory.
- **Task**: Update `RitualsHUD` to capture user input at each step and inject it into the `MemoryStore` as a summarized "Ritual Report" upon completion.

### Step 2: Implement Voice Synthesis (TTS)
- Update `AudioEngine` to handle actual speech synthesis.
- Connect `SettingsStore` voice preferences to the engine.

### Step 3: Implement Voice Recognition (STT) & Safety
- [x] Add microphone button to `CommandBar` and `DetachedChat`.
- [x] Implement `SpeechRecognition` logic.
- [x] **Intent Classification**: Classify input as `conversation`, `command`, or `workflow_action`.
- [x] **Safety Layer**: Require explicit confirmation for non-conversation intents.
