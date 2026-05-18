import React, { useState, useEffect } from 'react';
import { Plug, Clock, Settings, RefreshCw, Globe, ToggleLeft, ToggleRight, Plus, X } from 'lucide-react';
import { useSettingsStore } from '../../../services/settings/SettingsStore';

const EMPTY_FORM = {
    open: false,
    name: '', transport: 'stdio',
    command: '', args: '', env: '',
    url: '', headers: ''
};

const SystemsModule = ({ activeTab }) => {
    const {
        mcpServers, setMcpServers,
        mcpServerPolicies, setMcpServerPolicy,
        webhookEnabled, setWebhookEnabled,
        webhookPort, setWebhookPort,
        geminiApiKey, setGeminiApiKey,
        openaiApiKey, setOpenaiApiKey,
        anthropicApiKey, setAnthropicApiKey,
        claudeCliBinPath, setClaudeCliBinPath,
        claudeCliLoggedIn, setClaudeCliLoggedIn,
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
    const [addForm, setAddForm]       = useState(EMPTY_FORM);

    useEffect(() => { setLocalTab(activeTab); }, [activeTab]);
    useEffect(() => { setPortDraft(String(webhookPort)); }, [webhookPort]);

    // Subscribe to authoritative status events from the main process.
    useEffect(() => {
        if (!window.electronAPI?.mcp?.onStatus) return undefined;
        const off = window.electronAPI.mcp.onStatus(({ serverName, status }) => {
            setConnStatus(s => ({ ...s, [serverName]: status }));
            if (status === 'connected') setRefreshKey(k => k + 1);
        });
        // Hydrate from current state on mount
        window.electronAPI.mcp.list?.().then(list => {
            if (!Array.isArray(list)) return;
            const map = {};
            for (const e of list) map[e.serverName] = e.status;
            setConnStatus(s => ({ ...map, ...s }));
        }).catch(() => {});
        return off;
    }, []);

    // Fetch MCP tool counts
    useEffect(() => {
        if (localTab !== 'mcp') return;
        const fetch = async () => {
            if (!window.electronAPI?.mcp?.listTools) return;
            setLoading(true);
            const counts = {};
            await Promise.allSettled(
                Object.keys(mcpServers).map(async name => {
                    if (connStatus[name] !== 'connected') { counts[name] = 0; return; }
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
    }, [mcpServers, refreshKey, localTab, connStatus]);

    const buildConnectPayload = (name, cfg) => ({
        serverName: name,
        transport: cfg.transport || 'stdio',
        command: cfg.command,
        args: cfg.args || [],
        env: cfg.env || {},
        url: cfg.url,
        headers: cfg.headers || {},
    });

    const handleConnect = async (name, cfg) => {
        if (!window.electronAPI?.mcp?.connect) return;
        setConnStatus(s => ({ ...s, [name]: 'connecting' }));
        try {
            // Resolve ${SETTINGS.*} via MCPLoader so env/headers don't ship literals.
            const { mcpLoader } = await import('../../../services/agent/MCPLoader');
            await mcpLoader.connectServer(name, cfg);
            await mcpLoader.refreshAll();
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
        const name = addForm.name.trim();
        if (!name) return;

        const isStdio = addForm.transport === 'stdio';
        if (isStdio && !addForm.command.trim()) return;
        if (!isStdio && !addForm.url.trim()) return;

        let env = {};
        try { env = addForm.env ? JSON.parse(addForm.env) : {}; } catch {}
        let headers = {};
        try { headers = addForm.headers ? JSON.parse(addForm.headers) : {}; } catch {}

        const cfg = isStdio
            ? {
                transport: 'stdio',
                command: addForm.command.trim(),
                args: addForm.args.trim() ? addForm.args.trim().split(/\s+/) : [],
                env,
            }
            : {
                transport: addForm.transport,
                url: addForm.url.trim(),
                headers,
            };

        setMcpServers({ ...mcpServers, [name]: cfg });
        setAddForm(EMPTY_FORM);
    };

    const cyclePolicy = (name) => {
        const order = { allow: 'ask', ask: 'deny', deny: 'allow' };
        const current = mcpServerPolicies?.[name] || 'allow';
        setMcpServerPolicy(name, order[current]);
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

                        {Object.entries(mcpServers).map(([name, cfg]) => {
                            const transport = cfg.transport || 'stdio';
                            const summary = transport === 'stdio'
                                ? `${cfg.command || ''} ${(cfg.args ?? []).join(' ')}`.trim()
                                : `${transport.toUpperCase()} ${cfg.url || ''}`;
                            const policy = mcpServerPolicies?.[name] || 'allow';
                            const policyColor =
                                policy === 'allow' ? 'text-green-400/70 border-green-500/20 bg-green-500/10' :
                                policy === 'ask'   ? 'text-yellow-300/80 border-yellow-500/20 bg-yellow-500/10' :
                                                     'text-red-400/80 border-red-500/20 bg-red-500/10';
                            return (
                                <div key={name} className="bg-white/5 border border-white/5 rounded-xl px-3 py-2.5 flex items-center gap-3">
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                        connStatus[name] === 'connected'  ? 'bg-green-400' :
                                        connStatus[name] === 'connecting' ? 'bg-yellow-400 animate-pulse' :
                                        connStatus[name] === 'error'      ? 'bg-red-400' :
                                        'bg-white/20'
                                    }`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs text-white/70 font-mono truncate flex items-center gap-2">
                                            {name}
                                            <span className="text-[8px] uppercase tracking-wider text-white/30 px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{transport}</span>
                                        </div>
                                        <div className="text-[10px] text-white/30 font-mono truncate mt-0.5">{summary}</div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {toolCounts[name] !== undefined && (
                                            <span className="text-[10px] text-white/30 font-mono">{toolCounts[name]} tools</span>
                                        )}
                                        <button
                                            onClick={() => cyclePolicy(name)}
                                            title="Per-server tool approval policy. Click to cycle: allow → ask → deny."
                                            className={`px-2 py-0.5 rounded text-[9px] uppercase tracking-wider border ${policyColor}`}
                                        >
                                            {policy}
                                        </button>
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
                            );
                        })}

                        {/* Add-server form */}
                        {addForm.open && (() => {
                            const isStdio = addForm.transport === 'stdio';
                            const canSubmit = addForm.name.trim() && (isStdio ? addForm.command.trim() : addForm.url.trim());
                            return (
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
                                        <div className="text-[9px] text-white/30">Transport</div>
                                        <select
                                            value={addForm.transport}
                                            onChange={e => setAddForm(f => ({ ...f, transport: e.target.value }))}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/80 text-[10px] font-mono focus:outline-none focus:border-blue-500/40"
                                        >
                                            <option value="stdio">stdio (local process)</option>
                                            <option value="sse">sse (remote)</option>
                                            <option value="http">http (streamable, remote)</option>
                                        </select>
                                    </div>
                                </div>

                                {isStdio ? (
                                    <>
                                        <div className="space-y-1">
                                            <div className="text-[9px] text-white/30">Command</div>
                                            <input
                                                value={addForm.command}
                                                onChange={e => setAddForm(f => ({ ...f, command: e.target.value }))}
                                                placeholder="npx"
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/80 text-[10px] font-mono focus:outline-none focus:border-blue-500/40"
                                            />
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
                                            <div className="text-[9px] text-white/30">Env (JSON, optional — supports ${'$'}{'{'}SETTINGS.openaiApiKey{'}'})</div>
                                            <input
                                                value={addForm.env}
                                                onChange={e => setAddForm(f => ({ ...f, env: e.target.value }))}
                                                placeholder='{"OPENAI_API_KEY": "${SETTINGS.openaiApiKey}"}'
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/80 text-[10px] font-mono focus:outline-none focus:border-blue-500/40"
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="space-y-1">
                                            <div className="text-[9px] text-white/30">URL</div>
                                            <input
                                                value={addForm.url}
                                                onChange={e => setAddForm(f => ({ ...f, url: e.target.value }))}
                                                placeholder={addForm.transport === 'sse' ? 'http://localhost:3001/sse' : 'https://example.com/mcp'}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/80 text-[10px] font-mono focus:outline-none focus:border-blue-500/40"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-[9px] text-white/30">Headers (JSON, optional — supports ${'$'}{'{'}SETTINGS.anthropicApiKey{'}'})</div>
                                            <input
                                                value={addForm.headers}
                                                onChange={e => setAddForm(f => ({ ...f, headers: e.target.value }))}
                                                placeholder='{"Authorization": "Bearer ${SETTINGS.anthropicApiKey}"}'
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/80 text-[10px] font-mono focus:outline-none focus:border-blue-500/40"
                                            />
                                        </div>
                                    </>
                                )}

                                <div className="flex gap-2 pt-1">
                                    <button
                                        onClick={handleAddServer}
                                        disabled={!canSubmit}
                                        className="px-3 py-1.5 rounded-lg text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-30"
                                    >
                                        Add Server
                                    </button>
                                    <button
                                        onClick={() => setAddForm(EMPTY_FORM)}
                                        className="px-3 py-1.5 rounded-lg text-[10px] bg-white/5 text-white/40 border border-white/10 hover:text-white/60 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                            );
                        })()}
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

                        <div className="text-[9px] uppercase tracking-widest text-white/30 mt-4 mb-1">Claude (Subscription CLI)</div>
                        <div className="bg-white/5 border border-white/5 rounded-xl p-3 space-y-3">
                            <div className="text-[10px] text-white/40 leading-snug">
                                Use your Claude Pro/Max subscription instead of API credits. Routes chat through the local <span className="font-mono text-white/60">claude</span> CLI binary.
                            </div>

                            <div className="space-y-1.5">
                                <div className="text-[10px] text-white/50">Binary Path</div>
                                <input
                                    type="text"
                                    value={claudeCliBinPath || ''}
                                    onChange={e => setClaudeCliBinPath(e.target.value)}
                                    placeholder="claude"
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-xs font-mono focus:outline-none focus:border-white/20"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <span className={`inline-block w-2 h-2 rounded-full ${claudeCliLoggedIn ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                <span className="text-[10px] text-white/60">
                                    {claudeCliLoggedIn ? 'Authenticated — using your subscription' : 'Not authenticated'}
                                </span>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={async () => {
                                        try { await window.electronAPI?.claudeCode?.login?.({ binPath: claudeCliBinPath || 'claude' }); }
                                        catch (e) { console.error('claude login spawn failed', e); }
                                    }}
                                    className="flex-1 bg-purple-600/80 hover:bg-purple-500 text-white text-[11px] font-medium px-3 py-2 rounded-lg transition-colors"
                                >
                                    Login via Browser
                                </button>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        try {
                                            const res = await window.electronAPI?.claudeCode?.authStatus?.({ binPath: claudeCliBinPath || 'claude' });
                                            setClaudeCliLoggedIn(!!res?.loggedIn);
                                        } catch (e) {
                                            console.error('claude auth status failed', e);
                                            setClaudeCliLoggedIn(false);
                                        }
                                    }}
                                    className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-medium px-3 py-2 rounded-lg transition-colors"
                                >
                                    Verify
                                </button>
                            </div>

                            <div className="text-[9px] text-white/25 italic">
                                Requires the Claude Code CLI installed (<span className="font-mono">npm install -g @anthropic-ai/claude-code</span>). After logging in, click Verify.
                            </div>
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
