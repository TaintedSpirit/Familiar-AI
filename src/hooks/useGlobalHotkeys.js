import { useEffect } from 'react';
import { useSettingsStore } from '../services/settings/SettingsStore';
import { useSpeechStore } from '../services/voice/SpeechStore';
import { audioGraph } from '../services/voice/AudioGraph';


/**
 * Registers global hotkey listeners via Electron IPC (uIOhook).
 * Must be called once at the top of the component tree.
 *
 * @param {object} callbacks  - { setShowDetachedChat, setShowSettings }
 */
export function useGlobalHotkeys({ setShowDetachedChat, setShowSettings }) {
    useEffect(() => {
        if (!window.electronAPI) return;

        const isMatch = (config, input) => {
            if (!config) return false;
            if (!config.keycode && config.button === undefined) return false;

            if (config.type !== 'keyboard' && input.type !== 'keydown' && input.type !== 'keyup') return false;
            if (config.type === 'mouse' && input.type !== 'mousedown' && input.type !== 'mouseup') return false;

            if (config.type === 'keyboard' && config.keycode !== input.keycode) return false;
            if (config.type === 'mouse' && config.button !== input.button) return false;

            const mods = config.modifiers || { ctrl: false, alt: false, shift: false, meta: false };
            if (!!input.ctrlKey !== !!mods.ctrl) return false;
            if (!!input.altKey !== !!mods.alt) return false;
            if (!!input.shiftKey !== !!mods.shift) return false;
            if (!!input.metaKey !== !!mods.meta) return false;

            return true;
        };

        const handleGlobalInput = (e, data) => {
            const { hotkeys } = useSettingsStore.getState();
            const { micHold, micToggle } = hotkeys || {};
            const { voiceMode, isListening } = useSpeechStore.getState();

            if (data.type === 'keydown' || data.type === 'mousedown') {
                if (voiceMode === 'push-to-talk' && isMatch(micHold, data)) {
                    if (!isListening) audioGraph.startInput();
                    return;
                }
                if (isMatch(micToggle, data)) {
                    if (isListening) audioGraph.stopInput();
                    else audioGraph.startInput();
                }
                if (isMatch(hotkeys?.toggleChat, data)) {
                    setShowDetachedChat(prev => !prev);
                }
                if (isMatch(hotkeys?.toggleSettings, data)) {
                    setShowSettings(prev => !prev);
                }
                if (isMatch(hotkeys?.stopSpeaking, data)) {
                    audioGraph.stopSpeaking();
                }
            }

            if (data.type === 'keyup' || data.type === 'mouseup') {
                if (voiceMode === 'push-to-talk' && isMatch(micHold, data)) {
                    audioGraph.stopInput();
                }
            }
        };

        const removeDown = window.electronAPI.on('global-hotkey-down', (e, d) => handleGlobalInput(e, { ...d, type: 'keydown' }));
        const removeUp = window.electronAPI.on('global-hotkey-up', (e, d) => handleGlobalInput(e, { ...d, type: 'keyup' }));
        const removeMouseDown = window.electronAPI.on('global-mouse-down', (e, d) => handleGlobalInput(e, { ...d, type: 'mousedown' }));
        const removeMouseUp = window.electronAPI.on('global-mouse-up', (e, d) => handleGlobalInput(e, { ...d, type: 'mouseup' }));

        return () => {
            removeDown?.();
            removeUp?.();
            removeMouseDown?.();
            removeMouseUp?.();
        };
    }, [setShowDetachedChat, setShowSettings]);
}
