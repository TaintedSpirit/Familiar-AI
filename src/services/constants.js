// Centralized constants — edit here rather than hunting magic numbers.

// Voice Activity Detection
export const VAD_HANGOVER_MS = 800;       // silence after speech before cutting off
export const VAD_MIN_SPEECH_MS = 300;     // minimum utterance length to keep

// Screenshot / Vision freshness
export const SCREENSHOT_FRESH_MS = 60_000;   // 1 min — considered "live"
export const SCREENSHOT_STALE_MS = 300_000;  // 5 min — attached to LLM context only if fresher

// Safety store limits
export const SAFETY_MAX_SNAPSHOTS = 50;
export const SAFETY_MAX_LOGS = 100;

// Network
export const FETCH_TIMEOUT_MS = 15_000;  // abort hanging LLM/TTS requests after 15 s

// Watcher rate-limiting
export const WATCHER_RATE_LIMIT_MS = 600_000; // 10 min between the same notification type
