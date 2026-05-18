import { useSettingsStore } from '../settings/SettingsStore';
import { llmRouter } from '../llm/Router';
import { audioGraph } from './AudioGraph';

class AudioEngine {
    constructor() {
        this.proactiveSpokenThisRun = false;
    }

    resetRunState() {
        this.proactiveSpokenThisRun = false;
    }

    async speak({ text, category, eventId }) {
        if (!text) return;

        const { voiceEnabled } = useSettingsStore.getState();

        // 1. Check if voice is enabled. If not enabled, drop all speech.
        if (!voiceEnabled) {
            console.log(`[AudioEngine] Voice disabled. Dropping TTS event: ${JSON.stringify({ eventId, category, spoken: false, suppressionReason: 'voice_disabled' })}`);
            return;
        }

        // 2. Enforce Voice Behavior Rules
        let shouldSpeak = true;
        let suppressionReason = null;

        if (category === 'proactive') {
            if (this.proactiveSpokenThisRun) {
                shouldSpeak = false;
                suppressionReason = 'proactive_limit_reached';
            } else {
                this.proactiveSpokenThisRun = true;
            }
        }

        // 3. Log event
        console.log(`[AudioEngine] TTS Event: ${JSON.stringify({
            eventId,
            category,
            spoken: shouldSpeak,
            suppressionReason
        })}`);

        if (!shouldSpeak) {
            return;
        }

        // 4. Synthesize and play
        try {
            const blob = await llmRouter.synthesizeAudio(text);
            if (blob) {
                await audioGraph.playAudio(blob);
            } else {
                console.warn(`[AudioEngine] TTS Synthesis returned null for event ${eventId}`);
            }
        } catch (e) {
            console.error(`[AudioEngine] TTS Synthesis failed for event ${eventId}:`, e);
        }
    }
}

export const audioEngine = new AudioEngine();
