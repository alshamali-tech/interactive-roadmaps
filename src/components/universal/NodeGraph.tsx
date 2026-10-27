/**
 * NodeGraph Widget — Drag-and-drop pipeline builder using @xyflow/react
 *
 * Renders an interactive React Flow canvas with custom node types
 * (input, process, condition, output). Users can drag nodes, connect
 * them with edges, and validate the pipeline structure.
 *
 * The "Run Pipeline" button validates the graph and animates execution.
 * Playground mode (playground: true) adds toolbar buttons to add nodes.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
  type ReactFlowInstance,
  type NodeMouseHandler,
  type EdgeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Play,
  RotateCcw,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Database,
  Cpu,
  HelpCircle,
  ArrowRight,
  Maximize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ─── Types ──────────────────────────────────────────────────────────────────

type NodeType = 'input' | 'process' | 'condition' | 'output';
type NodeStatus = 'idle' | 'running' | 'complete' | 'error';

interface CustomNodeData {
  label: string;
  description?: string;
  nodeType: NodeType;
  status?: NodeStatus;
  [key: string]: unknown;
}

interface RunResult {
  success: boolean;
  errors: string[];
  executionOrder: string[];
}

// ─── Node Type Styling ──────────────────────────────────────────────────────

const nodeTypeStyles: Record<NodeType, { bg: string; border: string; icon: React.ReactNode; label: string }> = {
  input: {
    bg: 'bg-blue-50',
    border: 'border-blue-400',
    icon: <Database className="h-4 w-4 text-blue-600" />,
    label: 'Input',
  },
  process: {
    bg: 'bg-slate-50',
    border: 'border-slate-400',
    icon: <Cpu className="h-4 w-4 text-slate-600" />,
    label: 'Process',
  },
  condition: {
    bg: 'bg-amber-50',
    border: 'border-amber-400',
    icon: <HelpCircle className="h-4 w-4 text-amber-600" />,
    label: 'Condition',
  },
  output: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-400',
    icon: <ArrowRight className="h-4 w-4 text-emerald-600" />,
    label: 'Output',
  },
};

const statusStyles: Record<NodeStatus, { dot: string; label: string }> = {
  idle: { dot: 'bg-slate-300', label: 'Idle' },
  running: { dot: 'bg-amber-400 animate-pulse', label: 'Running…' },
  complete: { dot: 'bg-emerald-500', label: 'Done' },
  error: { dot: 'bg-red-500', label: 'Error' },
};

// ─── Custom Node Component (Module Level + React.memo) ──────────────────────

const CustomNode = React.memo<NodeProps<Node<CustomNodeData>>>(({ data }) => {
  const style = nodeTypeStyles[data.nodeType] || nodeTypeStyles.process;
  const status = data.status || 'idle';
  const statusStyle = statusStyles[status];

  return (
    <div
      className={cn(
        'rounded-lg border-2 shadow-md px-4 py-3 min-w-[160px] transition-all',
        style.bg,
        style.border,
        status === 'running' && 'ring-2 ring-amber-400 ring-offset-2',
        status === 'complete' && 'ring-2 ring-emerald-500 ring-offset-2',
        status === 'error' && 'ring-2 ring-red-500 ring-offset-2'
      )}
    >
      {/* Target Handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-white !border-2 !border-slate-400"
      />

      {/* Header with type and status */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          {style.icon}
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            {style.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full', statusStyle.dot)} />
          <span className="text-xs text-slate-500">{statusStyle.label}</span>
        </div>
      </div>

      {/* Label */}
      <div className="text-sm font-semibold text-slate-800 mb-0.5">
        {data.label}
      </div>

      {/* Description */}
      {data.description && (
        <div className="text-xs text-slate-500">{data.description}</div>
      )}

      {/* Source Handle (right) */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-white !border-2 !border-slate-400"
      />
    </div>
  );
});

CustomNode.displayName = 'CustomNode';

// ─── Node Types (Module Level) ──────────────────────────────────────────────

const nodeTypes = {
  custom: CustomNode,
};

// ─── Main Component ─────────────────────────────────────────────────────────

interface NodeGraphProps {
  initialNodes: Array<{
    id: string;
    type?: 'input' | 'process' | 'output' | 'condition';
    position: { x: number; y: number };
    label: string;
    description?: string;
  }>;
  initialEdges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
    animated?: boolean;
  }>;
  title?: string;
  playground?: boolean;
}

export function NodeGraph({
  initialNodes,
  initialEdges,
  title = 'Pipeline Builder',
  playground = false,
}: NodeGraphProps) {
  // Convert props to React Flow format
  const convertNodes = useCallback(
    () =>
      initialNodes.map((n) => ({
        id: n.id,
        type: 'custom',
        position: n.position,
        data: {
          label: n.label,
          description: n.description,
          nodeType: n.type || 'process',
          status: 'idle' as NodeStatus,
        },
      })),
    [initialNodes]
  );

  const convertEdges = useCallback(
    () =>
      initialEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        animated: e.animated || false,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#64748b', strokeWidth: 2 },
      })),
    [initialEdges]
  );

  // State management
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CustomNodeData>>(convertNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(convertEdges());
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  // Refs for pipeline validation (avoid stale closures)
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // ─── Connection Handler ─────────────────────────────────────────────────

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#64748b', strokeWidth: 2 },
            animated: false,
          },
          eds
        )
      );
      setRunResult(null);
    },
    [setEdges]
  );

  // ─── Node/Edge Click Handlers ───────────────────────────────────────────

  const onNodeClick: NodeMouseHandler<Node<CustomNodeData>> = useCallback(() => {
    // Deselect edges when clicking a node
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
  }, [setEdges]);

  const onEdgeClick: EdgeMouseHandler = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation();
      setEdges((eds) =>
        eds.map((e) => ({ ...e, selected: e.id === edge.id ? !e.selected : false }))
      );
    },
    [setEdges]
  );

  const onPaneClick = useCallback(() => {
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
  }, [setEdges]);

  // ─── Add Node (Playground Mode) ─────────────────────────────────────────

  const addNode = useCallback(
    (nodeType: NodeType) => {
      const id = `node-${Date.now()}`;
      const newNode: Node<CustomNodeData> = {
        id,
        type: 'custom',
        position: { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
        data: {
          label: `New ${nodeTypeStyles[nodeType].label}`,
          nodeType,
          status: 'idle',
        },
      };
      setNodes((nds) => [...nds, newNode]);
      setRunResult(null);
    },
    [setNodes]
  );

  // ─── Reset Graph ────────────────────────────────────────────────────────

  const resetGraph = useCallback(() => {
    setNodes(convertNodes());
    setEdges(convertEdges());
    setRunResult(null);
  }, [convertNodes, convertEdges, setNodes, setEdges]);

  // ─── Clear Canvas (Playground Mode) ─────────────────────────────────────

  const clearCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setRunResult(null);
  }, [setNodes, setEdges]);

  // ─── Run Pipeline ───────────────────────────────────────────────────────

  const runPipeline = useCallback(async () => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;

    // Reset status
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, status: 'idle' as NodeStatus } })));
    setEdges((eds) => eds.map((e) => ({ ...e, animated: false })));
    setIsRunning(true);
    setRunResult(null);

    // Small delay to show reset
    await new Promise((r) => setTimeout(r, 200));

    // ─── Validation ─────────────────────────────────────────────────────

    const errors: string[] = [];

    // Check for exactly one input node
    const inputNodes = currentNodes.filter(
      (n) => n.data.nodeType === 'input' && currentEdges.every((e) => e.target !== n.id)
    );
    if (inputNodes.length === 0) {
      errors.push('Missing input node (no incoming edges)');
    } else if (inputNodes.length > 1) {
      errors.push(`Multiple input nodes found: ${inputNodes.map((n) => n.data.label).join(', ')}`);
    }

    // Check for exactly one output node
    const outputNodes = currentNodes.filter(
      (n) => n.data.nodeType === 'output' && currentEdges.every((e) => e.source !== n.id)
    );
    if (outputNodes.length === 0) {
      errors.push('Missing output node (no outgoing edges)');
    } else if (outputNodes.length > 1) {
      errors.push(`Multiple output nodes found: ${outputNodes.map((n) => n.data.label).join(', ')}`);
    }

    // Check for cycles (Kahn's algorithm)
    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();
    currentNodes.forEach((n) => {
      inDegree.set(n.id, 0);
      adjacencyList.set(n.id, []);
    });
    currentEdges.forEach((e) => {
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
      adjacencyList.get(e.source)?.push(e.target);
    });

    const queue: string[] = [];
    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) queue.push(nodeId);
    });

    const sorted: string[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      sorted.push(nodeId);
      adjacencyList.get(nodeId)?.forEach((neighbor) => {
        inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      });
    }

    if (sorted.length !== currentNodes.length) {
      const cycleNodes = currentNodes.filter((n) => !sorted.includes(n.id));
      errors.push(`Cycle detected involving: ${cycleNodes.map((n) => n.data.label).join(', ')}`);
    }

    // Check reachability from input
    if (inputNodes.length === 1) {
      const visited = new Set<string>();
      const visitQueue = [inputNodes[0].id];
      while (visitQueue.length > 0) {
        const nodeId = visitQueue.shift()!;
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);
        adjacencyList.get(nodeId)?.forEach((neighbor) => {
          if (!visited.has(neighbor)) visitQueue.push(neighbor);
        });
      }
      const unreachable = currentNodes.filter((n) => !visited.has(n.id));
      if (unreachable.length > 0) {
        errors.push(`Unreachable nodes: ${unreachable.map((n) => n.data.label).join(', ')}`);
      }
    }

    // If validation failed, mark unreachable nodes as errors
    if (errors.length > 0) {
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: {
            ...n.data,
            status: errors.some((e) => e.includes(n.data.label)) ? 'error' as NodeStatus : 'idle' as NodeStatus,
          },
        }))
      );
      setRunResult({ success: false, errors, executionOrder: sorted });
      setIsRunning(false);
      return;
    }

    // ─── Execution Animation ────────────────────────────────────────────

    // Compute execution levels (nodes at same level run in parallel)
    const levels: string[][] = [];
    const nodeLevel = new Map<string, number>();
    sorted.forEach((nodeId) => {
      const incomingEdges = currentEdges.filter((e) => e.target === nodeId);
      const maxParentLevel = incomingEdges.reduce((max, e) => {
        const parentLevel = nodeLevel.get(e.source) ?? -1;
        return Math.max(max, parentLevel);
      }, -1);
      const level = maxParentLevel + 1;
      nodeLevel.set(nodeId, level);
      if (!levels[level]) levels[level] = [];
      levels[level].push(nodeId);
    });

    // Animate each level
    for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
      const levelNodes = levels[levelIdx];

      // Mark nodes as running
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: {
            ...n.data,
            status: levelNodes.includes(n.id) ? 'running' as NodeStatus : n.data.status,
          },
        }))
      );

      // Animate edges flowing into this level
      setEdges((eds) =>
        eds.map((e) => ({
          ...e,
          animated: levelNodes.includes(e.target),
          style: {
            ...e.style,
            stroke: levelNodes.includes(e.target) ? '#f59e0b' : e.style?.stroke,
          },
        }))
      );

      // Wait for animation
      await new Promise((r) => setTimeout(r, 600));

      // Mark nodes as complete
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: {
            ...n.data,
            status: levelNodes.includes(n.id) ? 'complete' as NodeStatus : n.data.status,
          },
        }))
      );

      // Turn edges green
      setEdges((eds) =>
        eds.map((e) => ({
          ...e,
          animated: false,
          style: {
            ...e.style,
            stroke: levelNodes.includes(e.target) ? '#10b981' : e.style?.stroke,
          },
        }))
      );

      // Small pause before next level
      await new Promise((r) => setTimeout(r, 200));
    }

    setRunResult({ success: true, errors: [], executionOrder: sorted });
    setIsRunning(false);
  }, [setNodes, setEdges]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <div className="text-sm text-slate-500">
          {nodes.length} node{nodes.length !== 1 ? 's' : ''} · {edges.length} edge
          {edges.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Playground Toolbar */}
      {playground && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <span className="text-sm font-medium text-slate-700 mr-2">Add Node:</span>
          {(['input', 'process', 'condition', 'output'] as NodeType[]).map((type) => (
            <Button
              key={type}
              onClick={() => addNode(type)}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              {nodeTypeStyles[type].icon}
              <span className="capitalize">{type}</span>
            </Button>
          ))}
          <div className="flex-1" />
          <Button
            onClick={clearCanvas}
            variant="outline"
            size="sm"
            className="gap-1.5 text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
            Clear
          </Button>
        </div>
      )}

      {/* Canvas */}
      <div className="h-[500px] w-full border-2 border-slate-200 rounded-lg overflow-hidden bg-white">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.3}
          maxZoom={2}
          defaultEdgeOptions={{
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#64748b', strokeWidth: 2 },
          }}
        >
          <Background gap={20} size={1} color="#e2e8f0" />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(n) => {
              const nodeType = n.data?.nodeType as NodeType | undefined;
              const colors: Record<NodeType, string> = {
                input: '#3b82f6',
                process: '#64748b',
                condition: '#f59e0b',
                output: '#10b981',
              };
              return nodeType ? colors[nodeType] : '#94a3b8';
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
          />
        </ReactFlow>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <Button
          onClick={runPipeline}
          disabled={isRunning || nodes.length === 0}
          className="gap-2"
          size="lg"
        >
          {isRunning ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Running…
            </>
          ) : (
            <>
              <Play className="h-5 w-5" />
              Run Pipeline
            </>
          )}
        </Button>

        <Button onClick={resetGraph} variant="outline" className="gap-2" disabled={isRunning}>
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>

        {reactFlowInstance && (
          <Button
            onClick={() => reactFlowInstance.fitView({ padding: 0.2 })}
            variant="outline"
            size="sm"
            className="gap-1.5"
          >
            <Maximize2 className="h-4 w-4" />
            Fit View
          </Button>
        )}

        {playground && (
          <div className="ml-auto text-xs text-slate-500 flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-blue-400" />
              Input
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-slate-400" />
              Process
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-amber-400" />
              Condition
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-emerald-400" />
              Output
            </span>
          </div>
        )}
      </div>

      {/* Result Banner */}
      {runResult && (
        <div
          className={cn(
            'p-4 rounded-lg border-2 flex items-start gap-3',
            runResult.success
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-red-50 border-red-200'
          )}
        >
          {runResult.success ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
          )}
          <div className="flex-1">
            <div
              className={cn(
                'font-semibold mb-1',
                runResult.success ? 'text-emerald-900' : 'text-red-900'
              )}
            >
              {runResult.success ? 'Pipeline Complete!' : 'Pipeline Validation Failed'}
            </div>
            {runResult.success ? (
              <div className="text-sm text-emerald-700">
                All {runResult.executionOrder.length} nodes executed successfully in topological order.
              </div>
            ) : (
              <ul className="text-sm text-red-700 space-y-1 mt-2">
                {runResult.errors.map((err, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>{err}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Instructions */}
      {playground && !runResult && (
        <div className="text-xs text-slate-500 space-y-1">
          <p>
            <strong>Drag</strong> nodes to rearrange · <strong>Connect</strong> by dragging from a colored dot to another node ·{' '}
            <strong>Select</strong> an edge and press <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-mono text-[10px]">Delete</kbd> to remove
          </p>
          <p>
            A valid pipeline needs <strong>1 Input</strong>, <strong>1 Output</strong>, no cycles, and all nodes reachable.
          </p>
        </div>
      )}
    </div>
  );
}
