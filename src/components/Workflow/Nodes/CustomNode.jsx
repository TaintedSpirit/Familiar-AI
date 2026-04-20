import React from 'react';
import { Handle, Position } from 'reactflow';
import { Globe, Code, Cpu, Clock, Database, PlayCircle, Braces } from 'lucide-react';

const icons = {
    httpRequest: Globe,
    javascript: Code,
    llmCall: Cpu,
    scheduler: Clock,
    storage: Database,
    trigger: PlayCircle,
    codeExecute: Braces
};

const colors = {
    httpRequest: 'border-blue-500 shadow-blue-500/20',
    javascript: 'border-yellow-500 shadow-yellow-500/20',
    llmCall: 'border-purple-500 shadow-purple-500/20',
    scheduler: 'border-green-500 shadow-green-500/20',
    storage: 'border-orange-500 shadow-orange-500/20',
    trigger: 'border-red-500 shadow-red-500/20',
    codeExecute: 'border-teal-500 shadow-teal-500/20',
    default: 'border-white/20 shadow-white/5'
};

const CustomNode = ({ data, type, selected }) => {
    const Icon = icons[type] || icons.trigger;
    const borderClass = colors[type] || colors.default;

    return (
        <div className={`
            min-w-[150px] bg-[#09090b] rounded-xl border ${selected ? 'border-indigo-400 ring-1 ring-indigo-400' : 'border-white/10'} 
            shadow-xl p-3 relative group transition-all
            ${selected ? 'shadow-indigo-500/20' : ''}
        `}>
            {/* Input Handle */}
            {type !== 'trigger' && (
                <Handle
                    type="target"
                    position={Position.Left}
                    className="!bg-white/40 !w-3 !h-3 !-left-1.5 !border-0 group-hover:!bg-white transition-colors"
                />
            )}
            {/* Body */}
            <div className="p-3 bg-[#0f0f12]">
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selected ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/5 text-white/40'
                        }`}>
                        {data.icon || <Icon className="w-5 h-5" />}
                    </div>
                    <div>
                        <div className="font-medium text-white/90 text-sm">{data.label}</div>
                        <div className="text-[10px] text-white/40 font-mono uppercase tracking-wider">{type}</div>
                    </div>
                </div>

                {data.customStatus && (
                    <div className="mt-2 text-[10px] text-yellow-400/90 font-mono bg-yellow-500/10 px-2 py-1 rounded border border-yellow-500/20 flex items-center justify-between">
                        <span>{data.customStatus}</span>
                        {data.progress !== undefined && (
                            <span className="text-white/60">{Math.round(data.progress)}%</span>
                        )}
                    </div>
                )}

                {data.progress !== undefined && (
                    <div className="mt-1 h-1 w-full bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-yellow-400 transition-all duration-300 ease-linear"
                            style={{ width: `${data.progress}%` }}
                        />
                    </div>
                )}

                {data.output && (
                    <div className="mt-2 text-[9px] text-white/40 font-mono bg-white/5 px-2 py-1 rounded border border-white/10 truncate max-w-[160px]">
                        {data.output}
                    </div>
                )}
            </div>

            {/* Status Indicator (if running) */}
            {data.status && (
                <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-[#09090b] ${data.status === 'running' ? 'bg-yellow-400 animate-pulse' :
                    data.status === 'success' ? 'bg-green-400' : 'bg-red-400'
                    }`} />
            )}

            {/* Output Handle */}
            <Handle
                type="source"
                position={Position.Right}
                className="!bg-white/40 !w-3 !h-3 !-right-1.5 !border-0 group-hover:!bg-white transition-colors"
            />
        </div>
    );
};

export default CustomNode;
