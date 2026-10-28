import { useCallback, useState } from 'react';
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { NodeGraphProps } from '@/curriculum/schema';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, Save } from 'lucide-react';

export function NodeGraph({ initialNodes = [], initialEdges = [], width = '100%', height = '450px' }: NodeGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            animated: true,
            style: { stroke: 'var(--primary)', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--primary)' },
          },
          eds
        )
      ),
    [setEdges]
  );

  const onInit = useCallback((instance: ReactFlowInstance) => {
    setRfInstance(instance);
  }, []);

  const clearCanvas = () => {
    if (nodes.length === 0 && edges.length === 0) return;
    setNodes([]);
    setEdges([]);
  };

  const addNode = () => {
    const newNode: Node = {
      id: `node-${Date.now()}`,
      position: { x: Math.random() * 300 + 100, y: Math.random() * 200 + 100 },
      data: { label: `New Node` },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const saveFlow = () => {
    if (!rfInstance) return;
    const flow = rfInstance.toObject();
    const blob = new Blob([JSON.stringify(flow, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'node-graph.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="my-5 rounded-lg border border-border overflow-hidden bg-card shadow-sm">
      <div className="flex items-center gap-2 bg-muted/50 px-4 py-2 border-b border-border">
        <span className="text-sm font-semibold text-foreground">Node Graph Editor</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="xs" onClick={addNode}>
            <Plus className="size-3 mr-1" /> Add Node
          </Button>
          <Button variant="ghost" size="xs" onClick={saveFlow}>
            <Save className="size-3 mr-1" /> Save
          </Button>
          <Button variant="ghost" size="xs" onClick={clearCanvas}>
            <Trash2 className="size-3 mr-1" /> Clear
          </Button>
        </div>
      </div>

      <div style={{ width, height }} className="bg-background">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={onInit}
          fitView
          attributionPosition="bottom-left"
        >
          <Background color="var(--border)" gap={16} />
          <Controls
            className="!bg-card !border-border [&_button]:!bg-card [&_button]:!border-border [&_button]:!text-foreground [&_button]:hover:!bg-muted"
          />
          <MiniMap
            nodeColor={() => 'var(--primary)'}
            maskColor="rgba(0,0,0,0.1)"
            className="!bg-card !border-border"
          />
        </ReactFlow>
      </div>

      <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between text-xs text-muted-foreground">
        <span>Drag nodes, connect handles to create edges</span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-primary" />
          {nodes.length} nodes · {edges.length} edges
        </span>
      </div>
    </div>
  );
}
