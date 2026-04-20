import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
    addEdge,
    useNodesState,
    useEdgesState,
    Controls,
    Background,
    ReactFlowProvider,
    Panel
} from 'reactflow';
import 'reactflow/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Save, FolderOpen, Terminal, Scan, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

import CustomNode from './Nodes/CustomNode';
import Inspector from './Inspector';
import { workflowEngine } from '../../services/workflow/WorkflowEngine';

import { useWorkflowStore } from '../../services/workflow/WorkflowStore';
import { flowStrategist } from '../../services/workflow/WorkflowStrategist';

const nodeTypes = {
    httpRequest: CustomNode,
    javascript: CustomNode,
    llmCall: CustomNode,
    scheduler: CustomNode,
    trigger: CustomNode,
    storage: CustomNode,
    codeExecute: CustomNode
};

const WorkflowHUD = ({ onClose }) => {
    // 1. Connect to Store
    const {
        nodes, edges,
        onNodesChange, onEdgesChange, onConnect,
        addNode, updateNodeData, setGraph,
        exportGraph, importGraph
    } = useWorkflowStore();

    const importInputRef = React.useRef(null);

    const handleImportFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = importGraph(ev.target.result);
            if (!result.success) {
                setLogs(prev => [...prev, { id: crypto.randomUUID(), timestamp: Date.now(), message: `Import failed: ${result.error}`, type: 'error' }]);
            } else {
                setLogs(prev => [...prev, { id: crypto.randomUUID(), timestamp: Date.now(), message: 'Workflow imported successfully.', type: 'success' }]);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const [selectedNodeId, setSelectedNodeId] = useState(null); // Just store ID locally
    const selectedNode = nodes.find(n => n.id === selectedNodeId);

    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState([]);
    const [showLogs, setShowLogs] = useState(true);
    const [codeProposal, setCodeProposal] = useState(null); // { nodeId, code, label }

    const reactFlowWrapper = useRef(null);
    const [reactFlowInstance, setReactFlowInstance] = useState(null);

    const onDragOver = useCallback((event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event) => {
            event.preventDefault();

            const type = event.dataTransfer.getData('application/reactflow');
            if (typeof type === 'undefined' || !type) {
                return;
            }

            const position = reactFlowInstance.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            // Use store action
            addNode(type, position);
        },
        [reactFlowInstance, addNode]
    );

    const handleNodeClick = (e, node) => {
        setSelectedNodeId(node.id);
    };

    // Wrapper for Inspector
    const handleUpdateNode = (id, data) => {
        updateNodeData(id, data);
    };

    const handleDeleteNode = (id) => {
        // We need a store action for delete, or just use setNodes mechanism
        // For now, let's implement a quick helper in the comp or fetch from store if added
        // Adding local helper for now by manipulating store directly via event
        onNodesChange([{ id, type: 'remove' }]);
        setSelectedNodeId(null);
    };

    const handleDuplicateNode = (node) => {
        // Manual duplication logic using store
        const newNode = addNode(node.type, { x: node.position.x + 50, y: node.position.y + 50 });
        updateNodeData(newNode.id, { ...node.data, label: `${node.data.label} (Copy)` });
    };

    // 4. Engine Subscription & Live Execution Visuals
    const activeTimerRef = useRef(null);
    const prevResultsRef = useRef(new Set()); // Kept for legacy safety or remove? Remove.
    const [autoCenter, setAutoCenter] = useState(true); // Default ON
    const [narration, setNarration] = useState('');

    // Auto-dismiss narration
    useEffect(() => {
        if (narration) {
            const timer = setTimeout(() => setNarration(''), 6000);
            return () => clearTimeout(timer);
        }
    }, [narration]);
    useEffect(() => {
        // Connect Strategist
        flowStrategist.setInsightHandler(setNarration);

        const unsubscribe = workflowEngine.subscribe((state, event) => {
            if (!event) return;

            const { type, nodeId, output, error } = event;

            if (type === 'WORKFLOW_STARTED') {
                setIsRunning(true);
                // Silent Start
                // setNarration("Initializing workflow...");
                setLogs([{ id: uuidv4(), timestamp: Date.now(), message: 'Starting execution...', type: 'info' }]);
                // Reset all nodes visually
                const currentNodes = useWorkflowStore.getState().nodes;
                currentNodes.forEach(n => {
                    updateNodeData(n.id, { status: 'idle', progress: undefined, customStatus: null });
                });
            }

            else if (type === 'WORKFLOW_COMPLETED') {
                setIsRunning(false);
                // Keep succinct completion message
                setNarration("Sequence complete.");
                setLogs(prev => [...prev, { id: uuidv4(), timestamp: Date.now(), message: 'Workflow Completed', type: 'success' }]);
            }

            else if (type === 'WORKFLOW_FAILED') {
                setIsRunning(false);
                setNarration("Sequence failed.");
                setLogs(prev => [...prev, { id: uuidv4(), timestamp: Date.now(), message: `Workflow Failed: ${error}`, type: 'error' }]);
                // Strategist handles valid speech for failures
            }

            else if (type === 'NODE_STARTED') {
                updateNodeData(nodeId, { status: 'running' });
                // Silent Execution (Visuals Only)

                // Auto-Center Camera
                if (autoCenter && reactFlowInstance) {
                    const node = useWorkflowStore.getState().nodes.find(n => n.id === nodeId);
                    if (node) {
                        const x = node.position.x + 75;
                        const y = node.position.y + 40;
                        reactFlowInstance.setCenter(x, y, { zoom: 1.2, duration: 1000 });
                    }
                }
            }

            else if (type === 'NODE_COMPLETED') {
                const result = workflowEngine.memory[nodeId];
                const preview = result?.content
                    ? result.content.substring(0, 80) + (result.content.length > 80 ? '...' : '')
                    : result?.result !== null && result?.result !== undefined
                        ? String(result.result).substring(0, 80)
                        : null;
                updateNodeData(nodeId, { status: 'success', progress: 100, customStatus: null, output: preview });
                setLogs(prev => [...prev, { id: uuidv4(), timestamp: Date.now(), message: `Node Completed`, nodeId, type: 'success' }]);

                // Clear timer if it was this node
                if (activeTimerRef.current?.nodeId === nodeId) {
                    activeTimerRef.current = null;
                }
            }

            else if (type === 'NODE_FAILED') {
                updateNodeData(nodeId, { status: 'failed', customStatus: 'Error' });
                setLogs(prev => [...prev, { id: uuidv4(), timestamp: Date.now(), message: `Node Failed: ${error?.message || error}`, nodeId, type: 'error' }]);
                // Strategist handles valid speech for failures
            }

            else if (type === 'NODE_WAITING_TIMER' || (state.status === 'waiting_for_timer' && state.activeNodeId)) {
                // Ensure we capture the timer context
                if (state.waitingContext?.endsAt) {
                    const endsAt = new Date(state.waitingContext.endsAt).getTime();
                    activeTimerRef.current = { nodeId: state.activeNodeId, endsAt };
                    updateNodeData(state.activeNodeId, { status: 'running', customStatus: 'Waiting...' });
                }
            }

            else if (type === 'NODE_WAITING_INPUT') {
                setLogs(prev => [...prev, { id: uuidv4(), timestamp: Date.now(), message: `Waiting for Approval`, nodeId, type: 'warn' }]);
                updateNodeData(nodeId, { status: 'running', customStatus: 'Approval Needed' });
            }

            else if (type === 'CODE_PROPOSAL') {
                setCodeProposal({ nodeId: event.nodeId, code: event.code, label: event.label });
                updateNodeData(event.nodeId, { status: 'running', customStatus: 'Awaiting Approval' });
                setLogs(prev => [...prev, { id: uuidv4(), timestamp: Date.now(), message: `Code proposal ready for "${event.label}"`, type: 'warn' }]);
            }
        });

        // Live Render Loop for Timer
        const intervalId = setInterval(() => {
            // Heartbeat for engine (handles throttled timeouts)
            workflowEngine.checkTimers();

            if (activeTimerRef.current) {
                const { nodeId, endsAt } = activeTimerRef.current;
                const now = Date.now();
                const msLeft = Math.max(0, endsAt - now);
                const secondsLeft = (msLeft / 1000).toFixed(1);

                updateNodeData(nodeId, {
                    customStatus: `${secondsLeft}s`,
                    progress: 100 - (msLeft / 10000 * 100) // Rough progress bar (assuming 10s default for visual)
                    // Ideally we'd know duration.
                });
            }
        }, 100);

        return () => {
            unsubscribe();
            clearInterval(intervalId);
            flowStrategist.setInsightHandler(null); // Cleanup Strategist handler
        };
    }, [updateNodeData, autoCenter, reactFlowInstance]); // Added dependencies

    const runWorkflow = async () => {
        setIsRunning(true);
        setLogs(prev => [...prev, { id: uuidv4(), timestamp: Date.now(), message: 'Starting execution...' }]);
        prevResultsRef.current = new Set(); // Reset memory tracker

        workflowEngine.start(nodes, edges);
    };

    return (
        <div className="w-[90vw] h-[85vh] bg-[#09090b] border border-white/10 rounded-3xl shadow-2xl flex overflow-hidden ring-1 ring-white/5 relative">
            {/* Sidebar / Node Library */}
            <div className="w-16 border-r border-white/10 bg-[#0f0f12] flex flex-col items-center py-4 gap-4 z-20">
                {/* ... icons ... */}
                <div className="p-2 mb-4 bg-indigo-500/10 rounded-lg text-indigo-400">
                    <div className="w-6 h-6 rounded-full border-2 border-indigo-500" />
                </div>
                {/* ... */}
                {['httpRequest', 'javascript', 'llmCall', 'scheduler', 'storage', 'codeExecute'].map((type) => (
                    <div
                        key={type}
                        className="p-3 bg-white/5 hover:bg-white/10 rounded-xl cursor-grab active:cursor-grabbing text-white/50 hover:text-white transition-all tooltip"
                        onDragStart={(event) => event.dataTransfer.setData('application/reactflow', type)}
                        draggable
                        title={type}
                    >
                        {type === 'httpRequest' && <div className="w-4 h-4"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /></svg></div>}
                        {type === 'javascript' && <div className="w-4 h-4 text-yellow-500 font-mono">JS</div>}
                        {type === 'llmCall' && <div className="w-4 h-4 text-purple-500">AI</div>}
                        {type === 'scheduler' && <div className="w-4 h-4 text-green-500">Clock</div>}
                        {type === 'storage' && <div className="w-4 h-4 text-orange-500">DB</div>}
                        {type === 'codeExecute' && <div className="w-4 h-4 text-teal-500">{'{}'}</div>}
                    </div>
                ))}
            </div>

            {/* Narration Overlay */}
            <AnimatePresence>
                {narration && (
                    <motion.div
                        initial={{ opacity: 0, y: -20, x: "-50%" }}
                        animate={{ opacity: 1, y: 0, x: "-50%" }}
                        exit={{ opacity: 0, y: -20, x: "-50%" }}
                        className="absolute top-6 left-1/2 z-40 px-6 py-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-full text-sm text-white/90 font-medium shadow-xl flex items-center gap-3 pointer-events-none"
                    >
                        <div className={`w-2 h-2 rounded-full ${narration.includes("complete") ? "bg-green-500" : "bg-indigo-500 animate-pulse"}`} />
                        {narration}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Canvas Area */}
            <div className="flex-1 relative h-full bg-[#050507]" ref={reactFlowWrapper}>
                <ReactFlow
                    nodes={nodes || []}
                    edges={edges || []}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onInit={setReactFlowInstance}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onNodeClick={handleNodeClick}
                    nodeTypes={nodeTypes}
                    fitView
                    className="bg-[#050507]"
                >
                    <Background color="#222" gap={20} />
                    <Controls className="!bg-black/50 !border-white/10 !fill-white/80" />

                    <Panel position="top-right" className="flex gap-2">
                        <button
                            onClick={() => setAutoCenter(!autoCenter)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${autoCenter
                                ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30'
                                : 'bg-white/5 hover:bg-white/10 text-white/40 border border-white/5'
                                }`}
                            title="Auto-Focus Camera"
                        >
                            <Scan className="w-4 h-4" />
                        </button>
                        <button onClick={runWorkflow} className="flex items-center gap-2 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 rounded-lg transition-colors">
                            <Play className="w-4 h-4" /> {isRunning ? 'Running...' : 'Run'}
                        </button>
                        <button
                            onClick={() => { if (window.confirm('Clear all nodes and connections?')) setGraph([], []) }}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-colors"
                            title="Clear Canvas"
                        >
                            <Trash2 className="w-4 h-4" /> Clear
                        </button>
                        <button
                            onClick={exportGraph}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 border border-indigo-500/30 rounded-lg transition-colors"
                            title="Export workflow as JSON"
                        >
                            <Save className="w-4 h-4" /> Export
                        </button>
                        <button
                            onClick={() => importInputRef.current?.click()}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 rounded-lg transition-colors"
                            title="Import workflow from JSON"
                        >
                            <FolderOpen className="w-4 h-4" /> Import
                        </button>
                        <input
                            ref={importInputRef}
                            type="file"
                            accept=".json"
                            className="hidden"
                            onChange={handleImportFile}
                        />
                        <button onClick={onClose} className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-colors">
                            <X className="w-4 h-4" /> Close
                        </button>
                    </Panel>
                </ReactFlow>

                {/* Bottom Logs Panel */}
                <AnimatePresence>
                    {showLogs && (
                        <motion.div
                            initial={{ y: 200 }} animate={{ y: 0 }} exit={{ y: 200 }}
                            className="absolute bottom-0 left-0 right-0 h-48 bg-[#0f0f12] border-t border-white/10 p-4 flex flex-col z-10"
                        >
                            <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center gap-2 text-xs font-mono text-white/40 uppercase">
                                    <Terminal className="w-3 h-3" /> Execution Logs
                                </div>
                                <button onClick={() => setLogs([])} className="text-xs text-white/40 hover:text-white">Clear</button>
                                <button onClick={() => setShowLogs(false)} className="text-white/40 hover:text-white"><X className="w-3 h-3" /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto font-mono text-xs space-y-1">
                                {logs.map(log => (
                                    <div key={log.id} className={`flex gap-2 ${log.type === 'error' ? 'text-red-400' :
                                        log.type === 'success' ? 'text-green-400' : 'text-white/60'
                                        }`}>
                                        <span className="opacity-50">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                                        <span className="font-bold">{log.nodeId || 'SYSTEM'}:</span>
                                        <span>{log.message}</span>
                                        {log.data && <span className="opacity-50 truncate ml-2 text-[10px]">{JSON.stringify(log.data)}</span>}
                                    </div>
                                ))}
                                {logs.length === 0 && <span className="text-white/20 italic">Ready to execute.</span>}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                {!showLogs && (
                    <button onClick={() => setShowLogs(true)} className="absolute bottom-4 left-4 p-2 bg-black/50 border border-white/10 rounded text-white/40 hover:text-white">
                        <Terminal className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Code Proposal Approval Overlay */}
            <AnimatePresence>
                {codeProposal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="w-[560px] max-h-[70vh] bg-[#0f0f12] border border-teal-500/40 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                        >
                            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-teal-500/10">
                                <div className="flex items-center gap-2 text-teal-300 text-sm font-mono font-bold uppercase tracking-wider">
                                    <span>{'{}'}</span>
                                    <span>Code Execution Proposal — {codeProposal.label}</span>
                                </div>
                                <span className="text-[10px] text-white/30 uppercase tracking-wider">Awaiting Approval</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4">
                                <p className="text-[11px] text-white/40 mb-2 uppercase tracking-wider">Proposed Code</p>
                                <pre className="bg-black/40 border border-white/10 rounded-xl p-4 text-xs text-green-300 font-mono whitespace-pre-wrap overflow-x-auto">
                                    {codeProposal.code}
                                </pre>
                            </div>
                            <div className="flex gap-3 p-4 border-t border-white/10 justify-end">
                                <button
                                    onClick={() => {
                                        workflowEngine.reject('User rejected code execution');
                                        setCodeProposal(null);
                                    }}
                                    className="px-5 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-sm transition-colors"
                                >
                                    Reject
                                </button>
                                <button
                                    onClick={() => {
                                        workflowEngine.resume();
                                        setCodeProposal(null);
                                    }}
                                    className="px-5 py-2 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/30 text-sm font-medium transition-colors"
                                >
                                    Approve & Run
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Right Inspector */}
            <AnimatePresence>
                {selectedNode && (
                    <motion.div
                        initial={{ x: 300, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 300, opacity: 0 }}
                        className="border-l border-white/10 z-30 shadow-2xl"
                    >
                        <Inspector
                            node={selectedNode}
                            onChange={updateNodeData}
                            onDelete={handleDeleteNode}
                            onDuplicate={handleDuplicateNode}
                            onClose={() => setSelectedNode(null)}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default (props) => (
    <ReactFlowProvider>
        <WorkflowHUD {...props} />
    </ReactFlowProvider>
);
