// Basic mapping for Uiohook keycodes to strings.
// Note: These are rough approximations based on common scancodes.
export const keyMap = {
    1: 'Esc', 2: '1', 3: '2', 4: '3', 5: '4', 6: '5', 7: '6', 8: '7', 9: '8', 10: '9', 11: '0',
    12: '-', 13: '=', 14: 'Backspace', 15: 'Tab',
    16: 'Q', 17: 'W', 18: 'E', 19: 'R', 20: 'T', 21: 'Y', 22: 'U', 23: 'I', 24: 'O', 25: 'P',
    26: '[', 27: ']', 28: 'Enter', 29: 'Ctrl',
    30: 'A', 31: 'S', 32: 'D', 33: 'F', 34: 'G', 35: 'H', 36: 'J', 37: 'K', 38: 'L', 39: ';',
    40: "'", 41: '`', 42: 'Shift', 43: '\\',
    44: 'Z', 45: 'X', 46: 'C', 47: 'V', 48: 'B', 49: 'N', 50: 'M', 51: ',', 52: '.', 53: '/',
    54: 'Shift', 56: 'Alt', 57: 'Space', 58: 'CapsLock',
    59: 'F1', 60: 'F2', 61: 'F3', 62: 'F4', 63: 'F5', 64: 'F6', 65: 'F7', 66: 'F8', 67: 'F9', 68: 'F10',
    87: 'F11', 88: 'F12',
    3639: 'PrintScreen', 3657: 'PageUp', 3665: 'PageDown', 3663: 'End', 3655: 'Home',
    57416: 'Up', 57419: 'Left', 57421: 'Right', 57424: 'Down',
    3667: 'Delete', 3666: 'Insert', 3675: 'Meta', // Windows Key / Command
    3676: 'Meta'
};

export const getKeyLabel = (keycode) => {
    return keyMap[keycode] || `Key ${keycode}`;
};
