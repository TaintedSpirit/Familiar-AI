import { create } from 'zustand';
import { addEdge, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import { workflowEditor } from './WorkflowEditor';
import { useSafetyStore } from '../safety/SafetyStore';

export const useWorkflowStore = create((set, get) => ({
    // ... (existing state)
    nodes: [
        { id: '1', type: 'trigger', position: { x: 100, y: 100 }, data: { label: 'Start' } },
    ],
    edges: [],

    // ReactFlow Hooks
    onNodesChange: (changes) => {
        set({
            nodes: applyNodeChanges(changes, get().nodes),
        });
    },
    onEdgesChange: (changes) => {
        set({
            edges: applyEdgeChanges(changes, get().edges),
        });
    },
    onConnect: (connection) => {
        set({
            edges: addEdge(connection, get().edges),
        });
    },

    // Agent Actions
    setGraph: (nodes, edges) => set({ nodes, edges }),

    applyEdits: (operations) => {
        const { nodes, edges } = get();

        // 1. Snapshot
        let snapshotId = null;
        try {
            snapshotId = useSafetyStore.getState().createSnapshot('workflow', { nodes, edges });
        } catch (e) { console.warn("Snapshot failed", e); }

        const result = workflowEditor.apply({ nodes, edges }, operations);

        if (result.success) {
            set({ nodes: result.graph.nodes, edges: result.graph.edges });
            // 2. Log Success
            if (snapshotId) {
                useSafetyStore.getState().logExecution('workflow-edit', snapshotId, `Applied ${operations.length} ops`, 'applied');
            }
        }
        return result;
    },

    addNode: (type, position) => {
        // ...
        const newNode = {
            id: uuidv4(),
            type,
            position,
            data: { label: `${type} Node` },
        };
        set(state => ({ nodes: [...state.nodes, newNode] }));
        return newNode;
    },

    updateNodeData: (id, newData) => {
        set(state => ({
            nodes: state.nodes.map(node =>
                node.id === id ? { ...node, data: { ...node.data, ...newData } } : node
            )
        }));
    },

    // Serialization for LLM
    getGraphJSON: () => {
        const { nodes, edges } = get();
        return JSON.stringify({ nodes, edges }, null, 2);
    },

    exportGraph: () => {
        const { nodes, edges } = get();
        const json = JSON.stringify({ nodes, edges }, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `workflow-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    importGraph: (jsonString) => {
        try {
            const { nodes, edges } = JSON.parse(jsonString);
            if (!Array.isArray(nodes) || !Array.isArray(edges)) {
                throw new Error('Invalid workflow file: missing nodes or edges array.');
            }
            set({ nodes, edges });
            return { success: true };
        } catch (e) {
            console.error('[WorkflowStore] Import failed:', e);
            return { success: false, error: e.message };
        }
    },
}));
