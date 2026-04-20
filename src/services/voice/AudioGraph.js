import { useSpeechStore } from './SpeechStore';
import { VAD_HANGOVER_MS, VAD_MIN_SPEECH_MS } from '../constants';

class AudioGraph {
    constructor() {
        this.ctx = null;
        this.stream = null;
        this.source = null;
        this.analyzer = null;
        this.dataArray = null;
        this.isActive = false;
        this.isTransitioning = false; // mutex: prevents overlapping start/stop calls

        // VAD State
        this.silenceStart = 0;
        this.speakingStart = 0;
        this.isVoiceDetected = false;

        // Recorder
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.vadHangover = VAD_HANGOVER_MS;
        this.minSpeechDuration = VAD_MIN_SPEECH_MS;

        // TTS playback queue
        this.playQueue = [];
        this.isPlayingTTS = false;
    }

    async init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    #releaseStream() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            this.audioChunks = [];
        }
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }
        this.isActive = false;
        this.isVoiceDetected = false;
    }

    async startInput(deviceId = 'default') {
        if (this.isTransitioning) return;
        this.isTransitioning = true;
        await this.init();

        try {
            // Always release the existing stream directly — calling stopInput() here
            // would return early because isTransitioning is already true.
            this.#releaseStream();

            const constraints = {
                audio: {
                    deviceId: deviceId !== 'default' ? { exact: deviceId } : undefined,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.source = this.ctx.createMediaStreamSource(this.stream);
            this.analyzer = this.ctx.createAnalyser();

            // Settings
            this.analyzer.fftSize = 512;
            this.analyzer.smoothingTimeConstant = 0.4;

            this.source.connect(this.analyzer);

            this.isActive = true;
            this.dataArray = new Uint8Array(this.analyzer.frequencyBinCount);

            // Start Loop
            // Resume if needed
            if (this.ctx.state === 'suspended') await this.ctx.resume();

            this.analyzeLoop();

            useSpeechStore.getState().setIsListening(true);
            console.log("[AudioGraph] Input started");
        } catch (err) {
            console.error("[AudioGraph] Failed to start input:", err);
            useSpeechStore.getState().setIsListening(false);
            // NotAllowedError = user denied mic; OverconstrainedError = bad deviceId
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                useSpeechStore.getState().setMicrophoneBlocked(true);
            }
            throw err;
        } finally {
            this.isTransitioning = false;
        }
    }

    stopInput() {
        if (this.isTransitioning) return;
        this.#releaseStream();
        useSpeechStore.getState().setIsListening(false);
        useSpeechStore.getState().setAudioLevel(0);
        console.log("[AudioGraph] Input stopped");
    }

    analyzeLoop() {
        if (!this.isActive || !this.analyzer) return;

        requestAnimationFrame(() => this.analyzeLoop());

        this.analyzer.getByteFrequencyData(this.dataArray);

        // Average Volume
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            sum += this.dataArray[i];
        }
        const average = sum / this.dataArray.length;
        const normalized = Math.min(1, average / 100);

        // Update Stores
        useSpeechStore.getState().setAudioLevel(normalized);

        // VAD Logic (Only if voiceMode is 'always-listening' OR we just use manual PTT gating?)
        // If we are "Input Started", we are listening.
        // If 'push-to-talk', the USER triggers startInput/stopInput manually?
        // Or does startInput run always, but we only Record when PTT is held?
        // Let's assume: If startInput is called, we are "ON".
        // If VoiceMode is PTT, the Mic button in UI toggles start/stop?
        // Actually, PTT usually means: Hold -> Start Input, Release -> Stop Input.
        // So analyzeLoop runs only when Mic is ON.

        // So we ALWAYS use VAD if Mic is ON to detect speech segments?
        // Yes, even in PTT, we want to know when speech starts/ends to slice buffers cleanly.

        // Don't detect speech while TTS is playing — mic would pick up speaker output
        if (this.isPlayingTTS) {
            if (this.isVoiceDetected) {
                this.isVoiceDetected = false;
                if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                    this.mediaRecorder.stop();
                    this.audioChunks = [];
                }
            }
            return;
        }

        const settings = useSpeechStore.getState();
        const sensitivity = settings.vadSensitivity ?? 0.5;

        // normalized is roughly 0.0 to 1.0 (clamped).
        // Threshold: High Sensitivity (1.0) -> Low Threshold (0.05)
        //            Low Sensitivity (0.0) -> High Threshold (0.5)
        const threshold = 0.5 - (sensitivity * 0.45); // Map 0->0.5, 1->0.05

        if (normalized > threshold) {
            // Speech Detected
            this.silenceStart = Date.now();
            if (!this.isVoiceDetected) {
                this.isVoiceDetected = true;
                this.speakingStart = Date.now();
                console.log("[AudioGraph] Speech START (Level:", normalized.toFixed(2), "Threshold:", threshold.toFixed(2), ")");

                this.startRecording();
            }
        } else {
            // Silence
            if (this.isVoiceDetected) {
                const silenceDuration = Date.now() - this.silenceStart;
                if (silenceDuration > this.vadHangover) {
                    // Speech END
                    const speechDuration = Date.now() - this.speakingStart;
                    if (speechDuration > this.minSpeechDuration) {
                        console.log("[AudioGraph] Speech END (Duration:", speechDuration, "ms)");
                        this.stopRecordingAndEmit();
                    } else {
                        // Too short
                        // console.log("[AudioGraph] Speech too short, discarded.");
                        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                            this.mediaRecorder.stop();
                            this.audioChunks = [];
                        }
                    }
                    this.isVoiceDetected = false;
                }
            }
        }
    }

    startRecording() {
        if (!this.stream) return;
        this.audioChunks = [];
        try {
            this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm' });
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) this.audioChunks.push(event.data);
            };
            this.mediaRecorder.onstop = () => {
                // Handled in stopRecordingAndEmit usually
            };
            this.mediaRecorder.start();
        } catch (e) {
            console.error("Mic Error:", e);
        }
    }

    stopRecordingAndEmit() {
        if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;

        this.mediaRecorder.onstop = () => {
            const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
            this.audioChunks = [];

            if (blob.size > 1000) {
                console.log("[AudioGraph] Dispatching speech-captured, size:", blob.size);
                window.dispatchEvent(new CustomEvent('speech-captured', { detail: blob }));
            }
        };

        this.mediaRecorder.stop();
    }

    async playAudio(audioBlob) {
        this.playQueue.push(audioBlob);
        if (!this.isPlayingTTS) {
            this._drainQueue();
        }
    }

    async _drainQueue() {
        if (this.playQueue.length === 0) {
            this.isPlayingTTS = false;
            useSpeechStore.getState().setIsSpeaking(false);
            return;
        }

        this.isPlayingTTS = true;
        useSpeechStore.getState().setIsSpeaking(true);

        // Cancel any in-progress mic recording so the AI doesn't hear itself
        if (this.isVoiceDetected) {
            this.isVoiceDetected = false;
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
                this.audioChunks = [];
            }
        }

        const blob = this.playQueue.shift();

        try {
            await this.init();
            const arrayBuffer = await blob.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

            const source = this.ctx.createBufferSource();
            source.buffer = audioBuffer;
            if (this.analyzer) source.connect(this.analyzer);
            source.connect(this.ctx.destination);
            source.start();

            source.onended = () => this._drainQueue();
        } catch (e) {
            console.error("[AudioGraph] Playback error:", e);
            this._drainQueue(); // Skip broken entry, continue queue
        }
    }

    stopSpeaking() {
        this.playQueue = [];
        this.isPlayingTTS = false;
        useSpeechStore.getState().setIsSpeaking(false);
    }
}

export const audioGraph = new AudioGraph();
