import React, { useState, useEffect } from 'react';
import { Plug, Clock, Settings, RefreshCw, Globe, ToggleLeft, ToggleRight, Plus, X } from 'lucide-react';
import { useSettingsStore } from '../../../services/settings/SettingsStore';

const SystemsModule = ({ activeTab }) => {
    const {
        mcpServers, setMcpServers,
        webhookEnabled, setWebhookEnabled,
        webhookPort, setWebhookPort,
        geminiApiKey, setGeminiApiKey,
        openaiApiKey, setOpenaiApiKey,
        anthropicApiKey, setAnthropicApiKey,
        authCooldowns, setAuthCooldowns,
        maxTokens, setMaxTokens,
        presencePenalty, setPresencePenalty,
        frequencyPenalty, setFrequencyPenalty,
        logLevel, setLogLevel,
    } = useSettingsStore();

    const [localTab, setLocalTab]   = useState(activeTab ?? 'mcp');
    const [toolCounts, setToolCounts] = useState({});
    const [refreshKey, setRefreshKey] = useState(0);
    const [loading, setLoading]       = useState(false);
    const [portDraft, setPortDraft]   = useState(String(webhookPort));
    const [connStatus, setConnStatus] = useState({});
    const [addForm, setAddForm]       = useState({ open: false, name: '', command: '', args: '', env: '' });

    useEffect(() => { setLocalTab(activeTab); }, [activeTab]);
    useEffect(() => { setPortDraft(String(webhookPort)); }, [webhookPort]);

    // Fetch MCP tool counts
    useEffect(() => {
        if (localTab !== 'mcp') return;
        const fetch = async () => {
            if (!window.electronAPI?.mcp?.listTools) return;
            setLoading(true);
            const counts = {};
            await Promise.allSettled(
                Object.keys(mcpServers).map(async name => {
                    try {
                        const tools = await window.electronAPI.mcp.listTools(name);
                        counts[name] = Array.isArray(tools) ? tools.length : 0;
                    } catch {
                        counts[name] = 0;
                    }
                })
            );
            setToolCounts(counts);
            setLoading(false);
        };
        fetch();
    }, [mcpServers, refreshKey, localTab]);

    const handleConnect = async (name, cfg) => {
        if (!window.electronAPI?.mcp?.connect) return;
        setConnStatus(s => ({ ...s, [name]: 'connecting' }));
        try {
            await window.electronAPI.mcp.connect({
                serverName: name,
                command: cfg.command,
                args: cfg.args || [],
                env: cfg.env || {}
            });
            setConnStatus(s => ({ ...s, [name]: 'connected' }));
        } catch {
            setConnStatus(s => ({ ...s, [name]: 'error' }));
        }
        setRefreshKey(k => k + 1);
    };

    const handleDisconnect = async (name) => {
        if (!window.electronAPI?.mcp?.disconnect) return;
        await window.electronAPI.mcp.disconnect(name).catch(() => {});
        setConnStatus(s => ({ ...s, [name]: 'disconnected' }));
        setRefreshKey(k => k + 1);
    };

    const handleDelete = (name) => {
        const next = { ...mcpServers };
        delete next[name];
        setMcpServers(next);
        setConnStatus(s => { const n = { ...s }; delete n[name]; return n; });
    };

    const handleAddServer = () => {
        if (!addForm.name.trim() || !addForm.command.trim()) return;
        let env = {};
        try { env = addForm.env ? JSON.parse(addForm.env) : {}; } catch {}
        setMcpServers({
            ...mcpServers,
            [addForm.name.trim()]: {
                command: addForm.command.trim(),
                args: addForm.args.trim() ? addForm.args.trim().split(/\s+/) : [],
                env
            }
        });
        setAddForm({ open: false, name: '', command: '', args: '', env: '' });
    };

    const handlePortSave = () => {
        const parsed = parseInt(portDraft, 10);
        if (!isNaN(parsed) && parsed > 0 && parsed < 65536) setWebhookPort(parsed);
    };

    const [showKeys, setShowKeys] = useState({});
    const toggleKey = (id) => setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Sub-tab bar */}
            <div className="flex shrink-0 border-b border-white/5 bg-black/10">
                {[
                    { id: 'mcp',    icon: Plug,     label: 'MCP'        },
                    { id: 'cron',   icon: Clock,    label: 'Automation' },
                    { id: 'auth',   icon: Globe,    label: 'Auth'       },
                    { id: 'config', icon: Settings, label: 'Config'     },
                ].map(({ id, icon: Icon, label }) => (
                    <button
                        key={id}
                        onClick={() => setLocalTab(id)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] uppercase tracking-wider transition-colors border-b-2 ${
                            localTab === id
                                ? 'border-blue-400 text-blue-300'
                                : 'border-transparent text-white/30 hover:text-white/60'
                        }`}
                    >
                        <Icon className="w-3 h-3" />
                        {label}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">

                {/* MCP TAB */}
                {localTab === 'mcp' && (
                    <>
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-[9px] uppercase tracking-widest text-white/30">MCP Servers</div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setRefreshKey(k => k + 1)}
                                    disabled={loading}
                                    className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors disabled:opacity-30"
                                >
                                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                                    Refresh
                                </button>
                                <button
                                    onClick={() => setAddForm(f => ({ ...f, open: !f.open }))}
                                    className="flex items-center gap-1 text-[10px] text-blue-400/60 hover:text-blue-400 transition-colors"
                                >
                                    <Plus className="w-3 h-3" />
                                    Add
                                </button>
                            </div>
                        </div>

                        {Object.keys(mcpServers).length === 0 && !addForm.open && (
                            <div className="flex flex-col items-center py-8 text-white/20 text-xs italic gap-1">
                                <Plug className="w-5 h-5 mb-1 opacity-30" />
                                No MCP servers configured.
                            </div>
                        )}

                        {Object.entries(mcpServers).map(([name, cfg]) => (
                            <div key={name} className="bg-white/5 border border-white/5 rounded-xl px-3 py-2.5 flex items-center gap-3">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    connStatus[name] === 'connected'  ? 'bg-green-400' :
                                    connStatus[name] === 'connecting' ? 'bg-yellow-400 animate-pulse' :
                                    connStatus[name] === 'error'      ? 'bg-red-400' :
                                    'bg-white/20'
                                }`} />
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs text-white/70 font-mono truncate">{name}</div>
                                    <div className="text-[10px] text-white/30 font-mono truncate mt-0.5">
                                        {cfg.command} {(cfg.args ?? []).join(' ')}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {toolCounts[name] !== undefined && (
                                        <span className="text-[10px] text-white/30 font-mono">{toolCounts[name]} tools</span>
                                    )}
                                    <button
                                        onClick={() => handleConnect(name, cfg)}
                                        disabled={connStatus[name] === 'connecting'}
                                        className="px-2 py-1 rounded-lg text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-40"
                                    >
                                        {connStatus[name] === 'connecting' ? '…' : 'Connect'}
                                    </button>
                                    <button
                                        onClick={() => handleDisconnect(name)}
                                        className="px-2 py-1 rounded-lg text-[10px] bg-white/5 text-white/40 border border-white/10 hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/20 transition-colors"
                                    >
                                        Disc.
                                    </button>
                                    <button
                                        onClick={() => handleDelete(name)}
                                        className="p-1 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                        title="Remove server"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {/* Add-server form */}
                        {addForm.open && (
                            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 space-y-2">
                                <div className="text-[9px] uppercase tracking-widest text-blue-400/60 mb-2">New MCP Server</div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <div className="text-[9px] text-white/30">Name</div>
                                        <input
                                            autoFocus
                                            value={addForm.name}
                                            onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                                            placeholder="e.g. filesystem"
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/80 text-[10px] font-mono focus:outline-none focus:border-blue-500/40"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-[9px] text-white/30">Command</div>
                                        <input
                                            value={addForm.command}
                                            onChange={e => setAddForm(f => ({ ...f, command: e.target.value }))}
                                            placeholder="npx"
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/80 text-[10px] font-mono focus:outline-none focus:border-blue-500/40"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-[9px] text-white/30">Args (space-separated)</div>
                                    <input
                                        value={addForm.args}
                                        onChange={e => setAddForm(f => ({ ...f, args: e.target.value }))}
                                        placeholder="-y @modelcontextprotocol/server-filesystem /path"
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/80 text-[10px] font-mono focus:outline-none focus:border-blue-500/40"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <div className="text-[9px] text-white/30">Env (JSON, optional)</div>
                                    <input
                                        value={addForm.env}
                                        onChange={e => setAddForm(f => ({ ...f, env: e.target.value }))}
                                        placeholder='{"MY_VAR": "value"}'
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/80 text-[10px] font-mono focus:outline-none focus:border-blue-500/40"
                                    />
                                </div>
                                <div className="flex gap-2 pt-1">
                                    <button
                                        onClick={handleAddServer}
                                        disabled={!addForm.name.trim() || !addForm.command.trim()}
                                        className="px-3 py-1.5 rounded-lg text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-30"
                                    >
                                        Add Server
                                    </button>
                                    <button
                                        onClick={() => setAddForm({ open: false, name: '', command: '', args: '', env: '' })}
                                        className="px-3 py-1.5 rounded-lg text-[10px] bg-white/5 text-white/40 border border-white/10 hover:text-white/60 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* CRON / AUTOMATION TAB */}
                {localTab === 'cron' && (
                    <>
                        <div className="text-[9px] uppercase tracking-widest text-white/30 mb-1">Scheduled Jobs</div>
                        <div className="flex flex-col items-center py-8 text-white/20 text-xs italic gap-1">
                            <Clock className="w-5 h-5 mb-1 opacity-30" />
                            Cron jobs are created by the agent via the
                            <code className="font-mono text-white/30 text-[10px]">schedule_task</code> tool.
                        </div>
                        <div className="bg-white/5 border border-white/5 rounded-xl px-3 py-2.5 text-[10px] text-white/30">
                            Active jobs will appear here when scheduled. Use the{' '}
                            <span className="text-blue-400/60">schedule_task</span> tool or cron triggers in the agent to create automation.
                        </div>
                    </>
                )}

                {/* AUTH TAB (OpenClaw Parity) */}
                {localTab === 'auth' && (
                    <>
                        <div className="text-[9px] uppercase tracking-widest text-white/30 mb-1">API Credentials</div>
                        <div className="space-y-2">
                            {[
                                { id: 'gemini', label: 'Gemini API Key', value: geminiApiKey, setter: setGeminiApiKey },
                                { id: 'openai', label: 'OpenAI API Key', value: openaiApiKey, setter: setOpenaiApiKey },
                                { id: 'anthropic', label: 'Anthropic API Key', value: anthropicApiKey, setter: setAnthropicApiKey },
                            ].map(key => (
                                <div key={key.id} className="bg-white/5 border border-white/5 rounded-xl p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="text-[10px] text-white/50">{key.label}</div>
                                        <button 
                                            onClick={() => toggleKey(key.id)}
                                            className="text-[9px] text-blue-400/60 hover:text-blue-400"
                                        >
                                            {showKeys[key.id] ? 'Hide' : 'Show'}
                                        </button>
                                    </div>
                                    <input
                                        type={showKeys[key.id] ? 'text' : 'password'}
                                        value={key.value}
                                        onChange={e => key.setter(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-xs font-mono focus:outline-none focus:border-white/20"
                                        placeholder="sk-..."
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="text-[9px] uppercase tracking-widest text-white/30 mt-4 mb-1">Auth Cooldowns (Backoff)</div>
                        <div className="bg-white/5 border border-white/5 rounded-xl p-3 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <div className="text-[10px] text-white/50">Billing Backoff (Hrs)</div>
                                    <input
                                        type="number"
                                        value={authCooldowns.billingBackoffHours}
                                        onChange={e => setAuthCooldowns({ billingBackoffHours: parseInt(e.target.value) })}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/70 text-xs font-mono"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <div className="text-[10px] text-white/50">Backoff Cap (Hrs)</div>
                                    <input
                                        type="number"
                                        value={authCooldowns.billingBackoffCapHours}
                                        onChange={e => setAuthCooldowns({ billingBackoffCapHours: parseInt(e.target.value) })}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/70 text-xs font-mono"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <div className="text-[10px] text-white/50">Cooldown Window (Hrs)</div>
                                <input
                                    type="number"
                                    value={authCooldowns.cooldownWindowHours}
                                    onChange={e => setAuthCooldowns({ cooldownWindowHours: parseInt(e.target.value) })}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/70 text-xs font-mono"
                                />
                                <div className="text-[9px] text-white/20 italic">Previces rapid re-retries of profiles that are blocked due to billing/excess failures.</div>
                            </div>
                        </div>
                    </>
                )}

                {/* CONFIG TAB */}
                {localTab === 'config' && (
                    <>
                        {/* Webhook */}
                        <div className="bg-white/5 border border-white/5 rounded-xl p-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2 text-xs text-white/70 font-medium">
                                        <Globe className="w-3.5 h-3.5 text-white/40" />
                                        Webhook Server
                                    </div>
                                    <div className="text-[10px] text-white/30 mt-0.5">Receive POST messages from external services</div>
                                </div>
                                <button
                                    onClick={() => setWebhookEnabled(!webhookEnabled)}
                                    className="text-white/40 hover:text-white/70 transition-colors"
                                >
                                    {webhookEnabled
                                        ? <ToggleRight className="w-5 h-5 text-blue-400" />
                                        : <ToggleLeft className="w-5 h-5" />
                                    }
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-white/30 shrink-0">Port:</span>
                                <input
                                    value={portDraft}
                                    onChange={e => setPortDraft(e.target.value)}
                                    onBlur={handlePortSave}
                                    onKeyDown={e => e.key === 'Enter' && handlePortSave()}
                                    className="w-24 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white/70 text-xs font-mono focus:outline-none focus:border-white/20"
                                    disabled={!webhookEnabled}
                                />
                                <span className="text-[10px] text-white/20">
                                    {webhookEnabled ? `Listening on :${webhookPort}` : 'Offline'}
                                </span>
                            </div>
                        </div>

                        {/* LLM Tuning */}
                        <div className="bg-white/5 border border-white/5 rounded-xl p-3 space-y-3">
                            <div className="text-[10px] text-white/50 font-medium uppercase tracking-wider">Advanced LLM Tuning</div>
                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-[10px]">
                                        <span className="text-white/40">Max Tokens</span>
                                        <span className="text-blue-400 font-mono">{maxTokens}</span>
                                    </div>
                                    <input 
                                        type="range" min="256" max="32768" step="256" value={maxTokens}
                                        onChange={e => setMaxTokens(parseInt(e.target.value))}
                                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-[10px]">
                                            <span className="text-white/40">Pres. Penalty</span>
                                            <span className="text-blue-400 font-mono">{presencePenalty}</span>
                                        </div>
                                        <input 
                                            type="range" min="-2" max="2" step="0.1" value={presencePenalty}
                                            onChange={e => setPresencePenalty(parseFloat(e.target.value))}
                                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-[10px]">
                                            <span className="text-white/40">Freq. Penalty</span>
                                            <span className="text-blue-400 font-mono">{frequencyPenalty}</span>
                                        </div>
                                        <input 
                                            type="range" min="-2" max="2" step="0.1" value={frequencyPenalty}
                                            onChange={e => setFrequencyPenalty(parseFloat(e.target.value))}
                                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* System */}
                        <div className="bg-white/5 border border-white/5 rounded-xl p-3 space-y-3">
                            <div className="text-[10px] text-white/50 font-medium uppercase tracking-wider">System</div>
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-white/40">Logging Level</span>
                                <select 
                                    value={logLevel}
                                    onChange={e => setLogLevel(e.target.value)}
                                    className="bg-black/40 border border-white/10 rounded px-2 py-1 text-[10px] text-white/70 outline-none"
                                >
                                    <option value="debug">DEBUG</option>
                                    <option value="info">INFO</option>
                                    <option value="warn">WARN</option>
                                    <option value="error">ERROR</option>
                                </select>
                            </div>
                        </div>

                        <div className="text-[10px] text-white/20 px-1 italic">
                            These settings mirror the OpenClaw high-agency configuration.
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default SystemsModule;
