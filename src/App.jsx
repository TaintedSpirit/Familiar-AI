import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// UI Components
import CompanionWrapper from './components/Companion/CompanionWrapper';
import CommandBar from './components/UI/CommandBar';
import InnerWorldHUD from './components/UI/InnerWorldHUD';
import SettingsHUD from './components/UI/SettingsHUD';
import DetachedChat from './components/UI/DetachedChat';

// Hooks
import { useGlobalHotkeys } from './hooks/useGlobalHotkeys';
import { useDiscordBridge } from './hooks/useDiscordBridge';
import LiveCanvas from './components/UI/LiveCanvas';
import { channelManager } from './services/channels/ChannelManager';

import { llmRouter } from './services/llm/Router';
import { agentLoop } from './services/agent/AgentLoop';
import { cronEngine } from './services/watchers/CronEngine';
import { scheduler } from './services/scheduler/Scheduler';
import { consolidationLoop } from './services/memory2/ConsolidationLoop';
import { soulLoader } from './services/soul/SoulLoader';
import { mcpLoader } from './services/agent/MCPLoader';
import { watcherEngine } from './services/watchers/WatcherEngine';
import { audioGraph } from './services/voice/AudioGraph';
import { useInnerWorldStore } from './services/innerworld/InnerWorldStore';
import { useSettingsStore } from './services/settings/SettingsStore';
import { useMemoryStore } from './services/memory/MemoryStore';
import { useWorkflowStore } from './services/workflow/WorkflowStore';
import { useContextStore } from './services/context/ContextStore';
import { useWatcherStore } from './services/watchers/WatcherStore';
import { useVisionStore } from './services/vision/VisionStore';
import { useFormStore } from './services/forms/FormStore';
import { useSpeechStore } from './services/voice/SpeechStore';
// import { useSafetyStore } from './services/safety/SafetyStore';

// Icons
import { Bell } from 'lucide-react';

const EvolutionOverlay = ({ form, onComplete }) => {
  useEffect(() => {
    const t = setTimeout(onComplete, 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md pointer-events-auto"
      onClick={onComplete}
    >
      <motion.div
        initial={{ scale: 0.7, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 120 }}
        className="flex flex-col items-center gap-4 text-center"
      >
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="w-24 h-24 rounded-full bg-white/10 border border-white/20 shadow-[0_0_60px_rgba(255,255,255,0.15)]"
        />
        <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Something shifted</p>
        <h2 className="text-white text-2xl font-light tracking-wide">{form.name}</h2>
        <p className="text-white/40 text-sm max-w-xs leading-relaxed">{form.description}</p>
        <p className="text-white/20 text-[10px] mt-4">click to continue</p>
      </motion.div>
    </motion.div>
  );
};

function App() {
  // --- Standard Local UI State ---
  const [showProjects, setShowProjects] = useState(false);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRituals, setShowRituals] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState(null);
  const [showDetachedChat, setShowDetachedChat] = useState(false);
  const [isUndocked, setIsUndocked] = useState(false);
  const [blobState, setBlobState] = useState('idle');
  const [idleThought, setIdleThought] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [showSpeechBubble, setShowSpeechBubble] = useState(false);
  const [showDebugBorder, setShowDebugBorder] = useState(false);
  const [pendingEvolution, setPendingEvolution] = useState(null);

  // Mutable ref so cron/scheduler callbacks always call the latest handleCommand
  const handleCommandRef = useRef(null);

  // --- Store Selectors (Follow Rules of Hooks) ---
  const innerWorldOpen = useInnerWorldStore(s => s.isOpen);
  const setInnerWorldOpen = useInnerWorldStore(s => s.setOpen);
  const publicInnerWorld = useInnerWorldStore(s => s.publicState);
  const innerWorldSettings = useInnerWorldStore(s => s.settings);
  const suspendAwareness = useContextStore(s => s.suspendAwareness);
  const resumeAwareness = useContextStore(s => s.resumeAwareness);

  const isAwarenessEnabled = useVisionStore(s => s.isAwarenessEnabled);
  const toggleAwareness = useVisionStore(s => s.toggleAwareness);
  const currentIntent = useContextStore(s => s.currentIntent);

  const {
    activePersona,
    companionScale, // Import scale
    toolbarScale,
    commandBarOpacity,
    chatOpacity,
    mcpServers
  } = useSettingsStore();

  // Speech Store
  const isListening = useSpeechStore(s => s.isListening);
  const voiceMode = useSpeechStore(s => s.voiceMode);
  const inputDeviceId = useSpeechStore(s => s.inputDeviceId);
  const setIsProcessing = useSpeechStore(s => s.setIsProcessing);
  const setIsSpeaking = useSpeechStore(s => s.setIsSpeaking);
  const microphoneBlocked = useSpeechStore(s => s.microphoneBlocked);

  const rawNotifications = useWatcherStore(state => state.notifications);
  const unreadNotifications = React.useMemo(() => rawNotifications.filter(n => !n.read), [rawNotifications]);
  const markRead = useWatcherStore(state => state.markRead);
  const clearNotifications = useWatcherStore(state => state.clearNotifications);
  const [showNotifTray, setShowNotifTray] = useState(false);

  const addMessage = useMemoryStore(state => state.addMessage);
  const updateArtifact = useMemoryStore(state => state.updateArtifact);
  const activeProjectId = useMemoryStore(s => s.activeProjectId);
  const projects = useMemoryStore(s => s.projects);

  const messages = React.useMemo(() => {
    if (!projects) return [];
    const p = projects.find(proj => proj.id === activeProjectId);
    return p ? (p.messages || []) : [];
  }, [projects, activeProjectId]);

  // --- Session Restoration ---
  // Runs once per app launch. If zustand-persisted messages from a prior session
  // exist, inject a system note so the user (and LLM) knows context was restored.
  useEffect(() => {
    if (sessionStorage.getItem('session_initialized')) return;
    sessionStorage.setItem('session_initialized', '1');

    const state = useMemoryStore.getState();
    const project = state.projects?.find(p => p.id === state.activeProjectId);
    const existing = (project?.messages || []).filter(m => m.role !== 'system');
    if (existing.length >= 2) {
      addMessage({
        role: 'system',
        content: `Session restored — ${existing.length} message${existing.length !== 1 ? 's' : ''} from your previous session are loaded as context.`,
        id: Date.now()
      });
    }
  }, []);

  // --- Soul Loader Init ---
  useEffect(() => {
    soulLoader.load().catch(e => console.warn('[App] SoulLoader init failed:', e));
  }, []);

  // --- MCP Client Init ---
  useEffect(() => {
    if (mcpServers && Object.keys(mcpServers).length > 0) {
      mcpLoader.configure(mcpServers).catch(err => console.error('[App] MCPLoader init failed:', err));
    }
  }, [mcpServers]);

  // --- Background Service Initialization ---
  useEffect(() => {
    watcherEngine.start();
    consolidationLoop.start(useMemoryStore);

    // Wire cron job execution — always reads latest handleCommand via ref
    cronEngine.onFire = (intent) => handleCommandRef.current?.(intent);

    if (voiceMode === 'always-listening') {
      audioGraph.startInput(inputDeviceId).catch(err => console.error("Audio Start Failed:", err));
    }

    return () => {
      watcherEngine.stop();
      audioGraph.stopInput();
      consolidationLoop.stop();
      cronEngine.onFire = null;
    };
  }, []);

  // Sync Input Device Changes
  useEffect(() => {
    if (isListening && inputDeviceId !== 'default') {
      audioGraph.startInput(inputDeviceId).catch(e => console.error("Device Sync Failed:", e));
    }
  }, [inputDeviceId]);

  // Handle Speech Events
  useEffect(() => {
    const handleSpeechCaptured = async (e) => {
      const audioBlob = e.detail;
      console.log("[App] Speech Captured, Transcribing...");

      // One-Shot Logic: If in PTT mode, stop listening immediately after capture
      if (useSpeechStore.getState().voiceMode === 'push-to-talk') {
        audioGraph.stopInput();
      }

      setBlobState('listening'); // Or thinking? Listening implies "receiving".
      setIsProcessing(true);

      try {
        const text = await llmRouter.transcribeAudio(audioBlob);
        if (text && text.trim().length > 0) {
          console.log("[App] Transcription:", text);
          // Inject user message
          // addMessage handled by handleCommand now for consistency
          // Execute Command
          await handleCommand(text, { source: 'voice' });
        } else {
          console.log("[App] Empty transcription.");
        }
      } catch (err) {
        console.error("[App] Transcription Error:", err);
        addMessage({ role: 'system', content: `Transcription Failed: ${err.message}`, id: Date.now() });
      } finally {
        setIsProcessing(false);
        setBlobState('idle');
      }
    };

    window.addEventListener('speech-captured', handleSpeechCaptured);
    return () => window.removeEventListener('speech-captured', handleSpeechCaptured);
  }, [addMessage]);

  // Auto-Hide Speech Bubble
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'assistant') {
      setShowSpeechBubble(true);
      const timer = setTimeout(() => {
        setShowSpeechBubble(false);
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      setShowSpeechBubble(false);
    }
  }, [messages]);

  // --- Discord Bridge ---
  const { isConnected: discordConnected } = useDiscordBridge();

  // --- Telegram / Channel Bridge ---
  const { telegramEnabled, telegramBotToken, telegramUserId } = useSettingsStore();
  useEffect(() => {
    if (!telegramEnabled || !telegramBotToken) return;
    channelManager.start({
      telegramToken: telegramBotToken,
      telegramUserId,
      onMessage: (msg) => {
        const activeProject = useMemoryStore.getState().activeProjectId;
        useMemoryStore.getState().addMessage(activeProject, {
          role: 'user',
          content: `[Telegram from ${msg.from}]: ${msg.text}`,
        });
      },
    });
    return () => channelManager.stop();
  }, [telegramEnabled, telegramBotToken, telegramUserId]);

  // --- Global Hotkey PTT (extracted to hook) ---
  useGlobalHotkeys({ setShowDetachedChat, setShowSettings });

  // Hard Reset Hook
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.altKey && e.key === 'r') {
        console.warn("HARD RESET TRIGGERED");
        localStorage.clear();
        window.location.reload();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debug Border Toggle
  useEffect(() => {
    const handleDebugKey = (e) => {
      if (e.ctrlKey && e.altKey && e.key === 'd') {
        setShowDebugBorder(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleDebugKey);
    return () => window.removeEventListener('keydown', handleDebugKey);
  }, []);

  // --- Scheduler: idle thoughts, nudges, ritual checks ---
  useEffect(() => {
    const unsubScheduler = scheduler.subscribe((event, data) => {
      if (event === 'IDLE_THOUGHT') {
        setIdleThought(data);
      } else if (event === 'NUDGE') {
        useWatcherStore.getState().addNotification(data, 'low');
      } else if (event === 'RITUAL_CHECK') {
        handleCommandRef.current?.(data);
      }
    });
    const stopScheduler = scheduler.start();
    return () => { unsubScheduler(); stopScheduler(); };
  }, []);

  // --- Webhook: route incoming HTTP messages to handleCommand ---
  useEffect(() => {
    const off = window.electronAPI?.webhook?.onMessage?.((data) => {
      if (data?.message) handleCommandRef.current?.(data.message);
    });
    return () => off?.();
  }, []);



  // --- Action Handlers ---
  const handleCommand = async (text, options = {}) => {
    console.log("[App] Command:", text);

    // Evaluate risk before processing
    useInnerWorldStore.getState().evaluate();
    const { blocked, risk } = useInnerWorldStore.getState().publicState;
    if (blocked) {
      addMessage({ role: 'system', content: `Command blocked — risk level is ${risk}. Open Inner World for details.`, id: Date.now() });
      return;
    }

    consolidationLoop.markActivity();

    // Add user message to store immediately so it appears in UI
    addMessage({ role: 'user', content: text, id: Date.now() });

    setBlobState('thinking');
    setIdleThought("Processing...");

    setIdleThought("Processing...");

    try {
      // VISION: Capture Logic
      // If awareness is enabled, force a capture NOW before sending to LLM.
      // This ensures the screenshot is fresh and matches what the user is currently looking at.
      if (useVisionStore.getState().isAwarenessEnabled) {
        console.log("[App] Awareness ON. Capturing context before query...");
        await useContextStore.getState().captureContext();
      }

      let response;
      try {
        const { setStreamingText, clearStreamingText, addMessage: addMsg } = useMemoryStore.getState();
        response = await agentLoop.run(text, messages, {
          onChunk: (chunk) => setStreamingText(chunk),
          onStep: (step) => {
            if (step.type === 'tool_call') {
              const argSummary = step.args && Object.keys(step.args).length
                ? ` → ${Object.values(step.args)[0]?.toString().slice(0, 80)}`
                : '';
              addMsg({ role: 'system', content: `[tool] ${step.name}${argSummary}`, id: Date.now() });
            }
          }
        });
        clearStreamingText();
      } catch (err) {
        console.error("[App] AgentLoop Error:", err);
        useMemoryStore.getState().clearStreamingText();
        response = {
          type: 'text',
          content: "I'm having some internal connection issues, but I'm here. Let's talk.",
          reply: "I'm having some internal connection issues, but I'm here. Let's talk."
        };
      }

      if (response && (response.reply || response.content)) {
        const replyText = response.reply || response.content;
        addMessage({ role: 'assistant', content: replyText, id: Date.now() });

        if (voiceMode === 'always-listening' || voiceMode === 'push-to-talk') {
          llmRouter.synthesizeAudio(replyText).then(audio => {
            if (audio) audioGraph.playAudio(audio);
          });
        }

        // Check for form evolution after each successful response
        const formStore = useFormStore.getState();
        formStore.incrementMetric('sessions');
        const evolved = formStore.checkEvolution();
        if (evolved) setPendingEvolution(evolved);
      }
    } catch (e) {
      console.error("Command Error:", e);
      addMessage({ role: 'assistant', content: `Execution Error: ${e.message}`, id: Date.now() });
    } finally {
      setBlobState('idle');
      setIdleThought(null);
    }
  };

  // Keep ref current so cron/scheduler/webhook callbacks always use fresh handleCommand
  useEffect(() => { handleCommandRef.current = handleCommand; });

  const handleMenuAction = (actionId) => {
    if (actionId === 'settings') setShowSettings(true);
    if (actionId === 'toggle_awareness') toggleAwareness();
    if (actionId === 'open_iw') setInnerWorldOpen(!innerWorldOpen);
  };

  // --- Global Failsafe: Ensure capture release on ANY mouse up ---
  useEffect(() => {
    const handleGlobalPointerUp = (e) => {
      // Always reset dragging state
      setIsDragging(false);
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => window.removeEventListener('pointerup', handleGlobalPointerUp);
  }, []);

  // --- Hash Routing ---
  const [route, setRoute] = useState(window.location.hash || '#/companion');

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);



  // --- Mouse Event Management (Islands of Interactivity) ---
  const handleMouseEnterValues = () => {
    setIsHovering(true);
    // Tell Electron to CAPTURE mouse events (not pass through)
    window.electronAPI.send('set-ignore-mouse-events', false);
  };

  const handleMouseLeaveValues = () => {
    setIsHovering(false);
    // Tell Electron to IGNORE mouse events (pass through to desktop)
    // Only if we aren't dragging!
    if (!isDragging) {
      window.electronAPI.send('set-ignore-mouse-events', true, { forward: true });
    }
  };

  // --- Render Helpers ---
  const renderCompanion = () => (
    <div className="absolute top-20 right-20 w-auto h-auto pointer-events-none">
      <InnerWorldHUD />
      <motion.div
        drag
        dragMomentum={false}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={() => { setIsDragging(false); handleMouseLeaveValues(); }}
        style={{
          scale: companionScale || 1.0,
        }}
        className={`interactive flex flex-col items-center gap-8 cursor-grab active:cursor-grabbing pointer-events-auto ${isDragging ? '' : 'transition-all duration-300'}`}
        onMouseEnter={handleMouseEnterValues}
        onMouseLeave={handleMouseLeaveValues}
      >
        <CompanionWrapper
          shouldPause={isDragging}
          blobProps={{ state: blobState, provider: 'gemini', idleThought }}
          publicState={publicInnerWorld}
          settings={innerWorldSettings}
          isOpen={innerWorldOpen}
          visionEnabled={isAwarenessEnabled}
          onAction={handleMenuAction}
        />

        <AnimatePresence mode="wait">
          {showSpeechBubble && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute -top-32 left-1/2 -translate-x-1/2 z-[100] text-white/80 font-light text-lg tracking-wide text-center w-64 px-6 py-3 glass rounded-2xl"
            >
              {messages[messages.length - 1].content}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );

  const renderCommandBar = () => (
    <>
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-auto h-auto pointer-events-none flex justify-center">
        <motion.div
          drag
          dragMomentum={false}
          onDragStart={() => setIsDragging(true)}
          onDragEnd={() => { setIsDragging(false); handleMouseLeaveValues(); }}
          style={{
            scale: toolbarScale || 1.0,
            opacity: commandBarOpacity !== undefined ? commandBarOpacity : 1.0
          }}
          className="interactive w-full max-w-xl pointer-events-auto"
          onMouseEnter={handleMouseEnterValues}
          onMouseLeave={handleMouseLeaveValues}
        >
          <CommandBar
            currentIntent={currentIntent}
            onCommand={handleCommand}
            onMenuAction={(action) => {
              if (action === 'PROJECTS') setShowProjects(p => !p);
              if (action === 'WORKFLOW') setShowWorkflow(p => !p);
              if (action === 'SETTINGS') setShowSettings(true);
              if (action === 'RITUALS') setShowRituals(p => !p);
              if (action === 'LOGS') setShowLogs(p => !p);
              if (action === 'CHAT') {
                setShowDetachedChat(p => !p);
                setIsUndocked(p => !p);
              }
            }}
          />

          {/* Console/HUD Elements inside Drag Container? No, decoupled HUD? 
              Settings was decoupled. InnerWorldHUD? 
              Let's keep HUDs attached to CommandBar for now as "widgets" of it, 
              OR decouple them too.
              Settings is global overlay now.
          */}

        </motion.div>
      </div>

      {/* Global Overlays (Settings, Chat, Notifications) - Positioned Absolutely on Screen */}

      {showSettings && (
        <div className="pointer-events-auto" onMouseEnter={handleMouseEnterValues} onMouseLeave={handleMouseLeaveValues}>
          <SettingsHUD onClose={() => setShowSettings(false)} discordConnected={discordConnected} />
        </div>
      )}

      {/* Notifications - Top Right Fixed */}
      <div
        className="absolute top-4 right-4 flex flex-col items-end gap-3 pointer-events-none z-[150]"
        onMouseEnter={handleMouseEnterValues}
        onMouseLeave={handleMouseLeaveValues}
      >
        {/* Bell tray toggle */}
        <div className="pointer-events-auto relative">
          <button
            onClick={() => setShowNotifTray(p => !p)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass border border-white/10 text-white/60 hover:text-white transition-colors"
          >
            <Bell className="w-3.5 h-3.5" />
            {unreadNotifications.length > 0 && (
              <span className="text-[10px] font-bold bg-blue-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                {unreadNotifications.length}
              </span>
            )}
          </button>

          {/* Tray panel */}
          <AnimatePresence>
            {showNotifTray && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                className="absolute top-full right-0 mt-2 w-80 max-h-96 overflow-y-auto flex flex-col glass border border-white/10 rounded-2xl shadow-2xl"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                  <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Notifications</span>
                  {rawNotifications.length > 0 && (
                    <button
                      onClick={clearNotifications}
                      className="text-[10px] text-white/30 hover:text-red-400 transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {rawNotifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-white/20">No notifications yet.</div>
                ) : (
                  rawNotifications.map(n => {
                    const mins = Math.floor((Date.now() - n.timestamp) / 60000);
                    const timeLabel = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
                    const priorityColor = n.priority === 'high' ? 'text-red-400' : n.priority === 'medium' ? 'text-yellow-400' : 'text-blue-400';
                    return (
                      <div
                        key={n.id}
                        className={`flex items-start gap-3 px-4 py-3 border-b border-white/5 last:border-0 transition-colors ${n.read ? 'opacity-40' : ''}`}
                      >
                        <Bell className={`w-3 h-3 mt-0.5 shrink-0 ${priorityColor}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white/80 leading-snug">{n.text}</p>
                          <p className="text-[10px] text-white/30 mt-0.5">{timeLabel}</p>
                        </div>
                        {!n.read && (
                          <button
                            onClick={() => markRead(n.id)}
                            className="text-[10px] text-white/30 hover:text-white shrink-0 transition-colors"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Toast popups for new unread (max 3, auto-dismissed by marking read) */}
        <AnimatePresence>
          {unreadNotifications.slice(0, 3).map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="pointer-events-auto glass border border-blue-500/30 px-4 py-2 rounded-xl text-xs text-white/90 flex items-center gap-3"
            >
              <Bell className="w-3 h-3 text-blue-400 shrink-0" />
              <span>{n.text}</span>
              <button onClick={() => markRead(n.id)} className="text-[10px] text-white/40 hover:text-white ml-2 shrink-0">✕</button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showDetachedChat && (
          <div className="absolute right-20 bottom-40 z-50 pointer-events-auto">
            <motion.div
              drag
              dragMomentum={false}
              onDragStart={() => setIsDragging(true)}
              onDragEnd={() => { setIsDragging(false); handleMouseLeaveValues(); }}
              onMouseEnter={handleMouseEnterValues}
              onMouseLeave={handleMouseLeaveValues}
              style={{ opacity: chatOpacity !== undefined ? chatOpacity : 1.0 }}
            >
              <DetachedChat onClose={() => {
                setShowDetachedChat(false);
                setIsUndocked(false);
              }} onSend={handleCommand} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );

  const { disableAotOnDrag, useOpaqueDrag, useIpcDrag } = useSettingsStore();

  return (
    <>
      {showDebugBorder && (
        <style>{`
          .app-container * {
            outline: 1px solid rgba(255, 50, 50, 0.5) !important;
            background: rgba(255, 0, 0, 0.05);
          }
          /* Highlight the main container to show the window bounds */
          .app-container {
            background: rgba(0, 255, 0, 0.05) !important;
            box-shadow: inset 0 0 0 4px red;
          }
          /* Ensure the pointer-events-auto regions are clearly distinct */
          .pointer-events-auto {
            background: rgba(0, 0, 255, 0.1) !important;
            outline: 2px solid blue !important;
          }
        `}</style>
      )}
      {microphoneBlocked && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[999] px-5 py-2 bg-red-900/80 border border-red-500/40 rounded-xl text-red-200 text-sm pointer-events-auto">
          Microphone access denied — check your system permissions to enable voice.
        </div>
      )}
      <div className={`app-container w-full h-full bg-transparent overflow-visible select-none pointer-events-none`}>
        {route.includes('companion') && renderCompanion()}
        {route.includes('commandbar') && renderCommandBar()}
      </div>

      <LiveCanvas />

      <AnimatePresence>
        {pendingEvolution && (
          <EvolutionOverlay
            form={pendingEvolution}
            onComplete={() => {
              const formStore = useFormStore.getState();
              formStore.unlockForm(pendingEvolution.id);
              formStore.setCurrentForm(pendingEvolution.id);
              setPendingEvolution(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export default App;
