import React from 'react';
import { X, Minus, Square } from 'lucide-react';

const TitleBar = () => {
    const handleControl = (action) => {
        if (window.electronAPI) {
            window.electronAPI.send('window-controls', action);
        }
    };

    return (
        <div className="h-10 w-full bg-black/40 backdrop-blur-md flex items-center justify-between px-4 border-b border-white/5 select-none" style={{ WebkitAppRegion: 'drag' }}>
            <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-indigo-500/50" />
                <span className="text-xs font-medium text-white/40 tracking-wider">AI FAMILIAR // SYSTEM.ROOT</span>
            </div>

            <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' }}>
                <button onClick={() => handleControl('minimize')} className="p-2 hover:bg-white/10 rounded transition-colors text-white/40 hover:text-white">
                    <Minus className="w-3 h-3" />
                </button>
                <button onClick={() => handleControl('maximize')} className="p-2 hover:bg-white/10 rounded transition-colors text-white/40 hover:text-white">
                    <Square className="w-3 h-3" />
                </button>
                <button onClick={() => handleControl('close')} className="p-2 hover:bg-red-500/20 rounded transition-colors text-white/40 hover:text-red-400">
                    <X className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
};

export default TitleBar;
