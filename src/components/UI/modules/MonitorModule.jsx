import React, { useState, useEffect } from 'react';
import { Zap, BarChart2, AlertTriangle, Database } from 'lucide-react';
import { useActivityStore } from '../../../services/agent/ActivityStore';
import { useInnerWorldStore } from '../../../services/innerworld/InnerWorldStore';
import ActivityTicker from '../ActivityTicker';
import ToolBlock from '../ToolBlock';

const MonitorModule = ({ activeTab }) => {
    const { activities, isCompacting } = useActivityStore();
    const { publicState } = useInnerWorldStore();
    const [memStats, setMemStats] = useState(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                if (window.electronAPI?.memory?.stats) {
                    const stats = await window.electronAPI.memory.stats();
                    setMemStats(stats);
                }
            } catch { /* not in electron or unavailable */ }
        };
        fetchStats();
    }, []);

    if (activeTab === 'audit') {
        return (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Neural Audit</div>

                {/* Risk level */}
                <div className="bg-white/5 border border-white/5 rounded-xl p-3">
                    <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Inner World State</div>
                    {publicState ? (
                        <pre className="text-[10px] text-white/50 font-mono whitespace-pre-wrap break-all leading-relaxed max-h-64 overflow-y-auto">
                            {JSON.stringify(publicState, null, 2)}
                        </pre>
                    ) : (
                        <p className="text-white/30 text-xs italic">No inner world data yet.</p>
                    )}
                </div>

                {/* Compaction status */}
                {isCompacting && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Memory compaction in progress…
                    </div>
                )}

                {/* Memory stats */}
                {memStats && (
                    <div className="bg-white/5 border border-white/5 rounded-xl p-3">
                        <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Memory Index</div>
                        <div className="flex items-center gap-2 text-white/60 text-xs">
                            <Database className="w-3.5 h-3.5 text-blue-400" />
                            <span>{memStats.count ?? '—'} facts indexed</span>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Default: live telemetry
    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Live activity pills */}
            <div className="bg-black/10 border-b border-white/5 shrink-0">
                <ActivityTicker />
            </div>

            {/* Activity history */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Activity History</div>

                {activities.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 text-white/20 text-xs italic gap-1">
                        <Zap className="w-5 h-5 mb-1 opacity-30" />
                        No tool activity yet.
                    </div>
                )}

                {[...activities].reverse().map(act => (
                    <ToolBlock
                        key={act.id}
                        name={act.name}
                        args={act.args}
                        result={act.result}
                        status={act.status}
                    />
                ))}
            </div>

            {/* Stats bar */}
            <div className="shrink-0 border-t border-white/5 px-4 py-2 flex items-center justify-between text-[10px] text-white/30">
                <div className="flex items-center gap-1.5">
                    <Database className="w-3 h-3" />
                    {memStats ? `${memStats.count ?? 0} facts` : 'Memory —'}
                </div>
                <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                        publicState?.risk === 'high'   ? 'bg-red-400' :
                        publicState?.risk === 'medium' ? 'bg-yellow-400' :
                        'bg-green-400'
                    }`} />
                    Risk: {publicState?.risk ?? 'nominal'}
                </div>
                {isCompacting && (
                    <div className="flex items-center gap-1 text-yellow-400/60">
                        <AlertTriangle className="w-3 h-3" />
                        Compacting
                    </div>
                )}
            </div>
        </div>
    );
};

export default MonitorModule;
