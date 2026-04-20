import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X, MessageSquare, Send, GripHorizontal, Mic, SquarePen, Search, Image as ImageIcon, LayoutGrid, Terminal } from 'lucide-react';
import { useMemoryStore } from '../../services/memory/MemoryStore';

const DetachedChat = ({ onClose, onSend }) => {
    // Get full store access for sidebar interactivity
    const { projects, activeProjectId, switchProject, createProject, streamingText } = useMemoryStore();

    // Derived state for current messages
    const activeProject = projects.find(p => p.id === activeProjectId);
    const messages = activeProject ? activeProject.messages : [];

    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef(null);
    const containerRef = useRef(null);
    const [isThinking, setIsThinking] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const dragControls = useDragControls();

    // Auto-scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
        // Check if last message is user, if so, we are thinking
        if (messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            setIsThinking(lastMsg.role === 'user');
        }
    }, [messages]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (inputValue.trim()) {
            onSend(inputValue);
            setInputValue('');
            setIsThinking(true);
        }
    };

    return (
        <motion.div
            drag
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            dragConstraints={{ left: -3000, right: 3000, top: -2000, bottom: 2000 }}
            dragElastic={0.1}
            initial={{ opacity: 0, scale: 0.9, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 50 }}
            // Increased width to accommodate sidebar
            className="pointer-events-auto w-[650px] h-[600px] bg-black/10 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/5 resize-y min-h-[400px] max-h-[80vh]"
        >

            {/* Header / Drag Handle */}
            <div className="h-10 shrink-0 bg-white/5 border-b border-white/5 flex items-center justify-between px-4 cursor-move select-none active:bg-white/10 transition-colors"
                onPointerDown={(e) => {
                    dragControls.start(e);
                }}
            >
                <div className="flex items-center gap-2 text-white/40 text-xs font-medium tracking-wider uppercase">
                    <MessageSquare className="w-3 h-3" />
                    <span>Commlink</span>
                </div>
                <div className="flex items-center gap-2">
                    <GripHorizontal className="w-3 h-3 text-white/20" />
                    <button onClick={onClose} className="hover:text-white text-white/20 transition-colors">
                        <X className="w-3 h-3" />
                    </button>
                </div>
            </div>

            {/* Main Content Area (Flex Row) */}
            <div className="flex flex-1 overflow-hidden">

                {/* SIDEBAR */}
                <div className="w-48 bg-black/20 border-r border-white/5 flex flex-col pt-3">

                    {/* User Requested Menu Options */}
                    <div className="px-2 space-y-1 mb-6">
                        <button
                            onClick={() => createProject(`Chat ${projects.length + 1}`)}
                            className="w-full flex items-center gap-3 px-3 py-2 text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-sm"
                        >
                            <SquarePen className="w-4 h-4" />
                            <span>New chat</span>
                        </button>
                        <button className="w-full flex items-center gap-3 px-3 py-2 text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-sm">
                            <Search className="w-4 h-4" />
                            <span>Search chats</span>
                        </button>
                        <button className="w-full flex items-center gap-3 px-3 py-2 text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-sm">
                            <ImageIcon className="w-4 h-4" />
                            <span>Images</span>
                        </button>
                        <button className="w-full flex items-center gap-3 px-3 py-2 text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-sm">
                            <LayoutGrid className="w-4 h-4" />
                            <span>Apps</span>
                        </button>
                        <button className="w-full flex items-center gap-3 px-3 py-2 text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-sm">
                            <Terminal className="w-4 h-4" />
                            <span>Codex</span>
                        </button>
                    </div>

                    <div className="px-3 pb-2 text-[10px] font-bold text-white/30 uppercase tracking-wider">
                        Recent Contexts
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1 px-2">
                        {projects.map(proj => (
                            <button
                                key={proj.id}
                                onClick={() => switchProject(proj.id)}
                                className={`w-full text-left px-3 py-2 rounded-lg text-xs truncate transition-all ${activeProjectId === proj.id
                                    ? 'bg-blue-500/20 text-blue-200 border border-blue-500/30'
                                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                                    }`}
                            >
                                {proj.name}
                            </button>
                        ))}
                    </div>
                    {/* Sidebar Footer / Tools */}
                    <div className="p-3 border-t border-white/5 text-[10px] text-white/20 text-center">
                        {projects.length} Active Threads
                    </div>
                </div>

                {/* CHAT AREA */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Chat History */}
                    <div
                        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        {messages.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-white/20 text-sm italic">
                                <p>Channel open.</p>
                                <p>Awaiting input.</p>
                            </div>
                        )}

                        <AnimatePresence mode='popLayout'>
                            {messages.map((msg, idx) => (
                                <motion.div
                                    key={msg.id || idx}
                                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ duration: 0.3, ease: "easeOut" }}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div
                                        className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm font-light leading-relaxed whitespace-pre-wrap shadow-sm
                                                ${msg.role === 'user'
                                                ? 'bg-blue-500/10 border border-blue-500/20 text-blue-100 rounded-tr-sm'
                                                : 'bg-white/5 border border-white/5 text-white/90 rounded-tl-sm'
                                            }`}
                                    >
                                        {msg.content}
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {/* Streaming / thinking indicator */}
                        <AnimatePresence>
                            {streamingText ? (
                                <motion.div
                                    key="streaming"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="flex justify-start"
                                >
                                    <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm font-light leading-relaxed whitespace-pre-wrap bg-white/5 border border-white/5 text-white/90">
                                        {streamingText}
                                        <motion.span
                                            animate={{ opacity: [1, 0, 1] }}
                                            transition={{ repeat: Infinity, duration: 0.8 }}
                                            className="inline-block w-0.5 h-3.5 bg-white/60 ml-0.5 align-middle"
                                        />
                                    </div>
                                </motion.div>
                            ) : isThinking && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                                <motion.div
                                    key="thinking"
                                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="flex justify-start items-center gap-3 ml-1 mt-2 mb-2"
                                >
                                    <div className="relative flex items-center justify-center w-8 h-8">
                                        <motion.div
                                            className="absolute inset-0 rounded-full border border-blue-400/30"
                                            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                                            transition={{ repeat: Infinity, duration: 2 }}
                                        />
                                        <motion.div
                                            className="w-1.5 h-1.5 bg-blue-400 rounded-full"
                                            animate={{ opacity: [0.5, 1, 0.5] }}
                                            transition={{ repeat: Infinity, duration: 1 }}
                                        />
                                    </div>
                                    <span className="text-xs text-blue-300/50 font-mono tracking-widest uppercase animate-pulse">Processing</span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <form
                        onSubmit={handleSubmit}
                        className="p-4 border-t border-white/5 bg-black/20 shrink-0"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <div className="relative">
                            <textarea
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSubmit(e);
                                    }
                                }}
                                placeholder="Send a message..."
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 pr-10 text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10 resize-none h-[50px] scrollbar-none"
                                style={{ minHeight: '50px' }}
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!('webkitSpeechRecognition' in window)) return;
                                        if (isListening) return; // or stop?

                                        const recognition = new window.webkitSpeechRecognition();
                                        recognition.lang = 'en-US';
                                        recognition.onstart = () => setIsListening(true);
                                        recognition.onend = () => setIsListening(false);
                                        recognition.onresult = (e) => {
                                            const transcript = e.results[0][0].transcript;
                                            setInputValue(prev => (prev ? prev + ' ' : '') + transcript);
                                        };
                                        recognition.start();
                                    }}
                                    className={`p-2 rounded-full transition-colors ${isListening ? 'text-red-400 animate-pulse bg-red-500/10' : 'text-white/40 hover:text-white'}`}
                                >
                                    <Mic className="w-4 h-4" />
                                </button>
                                <button
                                    type="submit"
                                    disabled={!inputValue.trim()}
                                    className="p-2 text-white/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </motion.div>
    );
};

export default DetachedChat;
