import { v4 as uuidv4 } from 'uuid';

/**
 * Workflow Editor Service
 * Handles atomic, validated edits to the workflow graph.
 */
class WorkflowEditor {

    /**
     * Preview the result of operations without modifying the original state.
     * @param {Object} currentGraph { nodes, edges }
     * @param {Array} operations List of edit operations
     * @returns {Object} { success: boolean, graph: Object, error: string }
     */
    apply(currentGraph, operations) {
        // Deep copy to simulate atomic transaction
        let nodes = JSON.parse(JSON.stringify(currentGraph.nodes));
        let edges = JSON.parse(JSON.stringify(currentGraph.edges));

        try {
            for (const op of operations) {
                switch (op.type) {
                    case 'addNode':
                        this.#validateAddNode(op, nodes);
                        // Ensure ID
                        if (!op.node.id) op.node.id = uuidv4();
                        // Ensure data
                        if (!op.node.data) op.node.data = { label: 'New Node' };
                        // Ensure position
                        if (!op.node.position) op.node.position = { x: 0, y: 0 };
                        nodes.push(op.node);
                        break;

                    case 'removeNode':
                        // Idempotent: If node doesn't exist, we just continue.
                        // this.#validateNodeExists(op.nodeId, nodes);
                        nodes = nodes.filter(n => n.id !== op.nodeId);
                        // Cleanup dangling edges
                        edges = edges.filter(e => e.source !== op.nodeId && e.target !== op.nodeId);
                        break;

                    case 'updateNodeConfig':
                        this.#validateNodeExists(op.nodeId, nodes);
                        nodes = nodes.map(n => {
                            if (n.id === op.nodeId) {
                                return { ...n, data: { ...n.data, ...op.data } };
                            }
                            return n;
                        });
                        break;

                    case 'moveNode':
                        this.#validateNodeExists(op.nodeId, nodes);
                        nodes = nodes.map(n => {
                            if (n.id === op.nodeId) {
                                return { ...n, position: op.position };
                            }
                            return n;
                        });
                        break;

                    case 'addEdge':
                        this.#validateAddEdge(op, nodes);
                        // Ensure IDs if not provided (though ReactFlow handles them usually)
                        if (!op.edge.id) op.edge.id = `e${op.edge.source}-${op.edge.target}`;
                        // Check duplicates
                        if (!edges.find(e => e.source === op.edge.source && e.target === op.edge.target)) {
                            edges.push(op.edge);
                        }
                        break;

                    case 'removeEdge':
                        edges = edges.filter(e => e.id !== op.edgeId);
                        break;

                    case 'clear':
                        nodes = [];
                        edges = [];
                        break;

                    default:
                        throw new Error(`Unknown operation type: ${op.type}`);
                }
            }

            return { success: true, graph: { nodes, edges } };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // --- Validators ---

    #validateAddNode(op, nodes) {
        if (!op.node) throw new Error("addNode missing 'node' payload");
        if (op.node.id && nodes.find(n => n.id === op.node.id)) {
            throw new Error(`Node ID collision: ${op.node.id}`);
        }
    }

    #validateNodeExists(id, nodes) {
        if (!nodes.find(n => n.id === id)) {
            throw new Error(`Node not found: ${id}`);
        }
    }

    #validateAddEdge(op, nodes) {
        if (!op.edge || !op.edge.source || !op.edge.target) {
            throw new Error("addEdge missing source or target");
        }
        if (!nodes.find(n => n.id === op.edge.source)) throw new Error(`Edge source missing: ${op.edge.source}`);
        if (!nodes.find(n => n.id === op.edge.target)) throw new Error(`Edge target missing: ${op.edge.target}`);
    }
}

export const workflowEditor = new WorkflowEditor();
