# Long-Term Memory

_This file is the familiar's curated memory index. It is updated by the agent when the user asks to remember something, or during session consolidation. Edit freely — the agent reads and writes this file._

---

## Key Facts

_Important things the familiar has learned about this user and project._

- 2026-04-20: Memory system initialized. OpenClaw-style markdown + SQLite architecture adopted.
- 2026-04-20: AI Familiar is an Electron app (React + Vite + Zustand + Better-SQLite3) with workflow engine, voice, and Discord bridge.

## Decisions

_Non-obvious choices made together that should inform future work._

- Memory storage: markdown files at project root (human-readable, version-controllable) + SQLite FTS5 for search.
- Persona source of truth: Soul.md at project root takes priority over in-app soul editor.

## Ongoing Context

_State that carries between sessions._

- Primary LLM provider: Google Gemini.
- User prefers direct, short answers. Expands on request.
