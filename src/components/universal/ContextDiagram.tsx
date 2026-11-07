import { useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Settings,
  HelpCircle,
  LogOut,
  Database,
  Cloud,
  MessageSquare,
  X,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Diagram, DiagramNode, DiagramEdge, DiagramNodeType } from '@/engine/generatorSchema';

interface ContextDiagramProps {
  diagram: Diagram;
  onExplainThisDiagram?: (diagram: Diagram) => void;
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);
  return matches;
}

type CustomNodeData = {
  label: string;
  description?: string;
  index: number;
  onClick: () => void;
};

type CustomNode = Node<CustomNodeData, DiagramNodeType>;

const nodeStyles: Record<DiagramNodeType, string> = {
  input: 'bg-blue-50 dark:bg-blue-950/40 border-blue-400 dark:border-blue-700 text-blue-900 dark:text-blue-100',
  process: 'bg-gray-50 dark:bg-gray-800/60 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100',
  decision: 'bg-yellow-50 dark:bg-yellow-950/40 border-yellow-500 dark:border-yellow-600 text-yellow-900 dark:text-yellow-100',
  output: 'bg-green-50 dark:bg-green-950/40 border-green-500 dark:border-green-600 text-green-900 dark:text-green-100',
  storage: 'bg-purple-50 dark:bg-purple-950/40 border-purple-500 dark:border-purple-600 text-purple-900 dark:text-purple-100',
  service: 'bg-teal-50 dark:bg-teal-950/40 border-teal-500 dark:border-teal-600 text-teal-900 dark:text-teal-100',
};

const nodeIcons: Record<DiagramNodeType, React.ComponentType<{ className?: string }>> = {
  input: ArrowRight,
  process: Settings,
  decision: HelpCircle,
  output: LogOut,
  storage: Database,
  service: Cloud,
};

function DiagramNodeComponent({ data, type }: NodeProps<CustomNode>) {
  const Icon = nodeIcons[type] || Settings;
  const style = nodeStyles[type] || nodeStyles.process;
  
  const isDecision = type === 'decision';
  const isService = type === 'service';
  
  return (
    <div 
      className={cn(
        'border-2 shadow-md cursor-pointer transition-all hover:shadow-lg hover:scale-105 flex items-center justify-center text-sm font-medium',
        style,
        isDecision ? 'rotate-45 w-28 h-28 rounded-none' : 'px-4 py-3 rounded-lg min-w-[150px]',
      )}
      style={isService ? { clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)', width: '160px', height: '80px', paddingLeft: '20px', paddingRight: '20px' } : {}}
      onClick={data.onClick}
    >
      <Handle type="target" position={Position.Top} className="!bg-foreground !size-2 !border-2 !border-card" />
      
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: data.index * 0.1, duration: 0.4 }}
        className={cn('flex items-center gap-2', isDecision && '-rotate-45')}
      >
        <Icon className="size-4 shrink-0" />
        <span className={cn(isDecision && 'text-xs text-center leading-tight')}>{data.label}</span>
      </motion.div>
      
      <Handle type="source" position={Position.Bottom} className="!bg-foreground !size-2 !border-2 !border-card" />
    </div>
  );
}

const nodeTypes = {
  input: DiagramNodeComponent,
  process: DiagramNodeComponent,
  decision: DiagramNodeComponent,
  output: DiagramNodeComponent,
  storage: DiagramNodeComponent,
  service: DiagramNodeComponent,
};

function computeLayout(nodes: DiagramNode[], edges: DiagramEdge[]) {
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();
  
  nodes.forEach(n => {
    inDegree.set(n.id, 0);
    outEdges.set(n.id, []);
  });
  
  edges.forEach(e => {
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
    outEdges.get(e.from)?.push(e.to);
  });

  const roots = nodes.filter(n => (inDegree.get(n.id) || 0) === 0);
  if (roots.length === 0 && nodes.length > 0) {
    roots.push(nodes[0]);
  }

  const levels = new Map<string, number>();
  const queue = roots.map(r => ({ id: r.id, level: 0 }));
  
  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    if (levels.has(id)) continue;
    levels.set(id, level);
    
    const children = outEdges.get(id) || [];
    children.forEach(childId => {
      if (!levels.has(childId)) {
        queue.push({ id: childId, level: level + 1 });
      }
    });
  }

  const levelGroups = new Map<number, DiagramNode[]>();
  nodes.forEach(n => {
    const lvl = levels.get(n.id) || 0;
    if (!levelGroups.has(lvl)) levelGroups.set(lvl, []);
    levelGroups.get(lvl)!.push(n);
  });

  const xSpacing = 250;
  const ySpacing = 150;

  const layoutNodes: CustomNode[] = [];
  
  levelGroups.forEach((group, lvl) => {
    const totalWidth = group.length * xSpacing;
    const startX = -totalWidth / 2 + xSpacing / 2;
    
    group.forEach((n, idx) => {
      layoutNodes.push({
        id: n.id,
        type: n.type,
        position: { x: startX + idx * xSpacing, y: lvl * ySpacing },
        data: {
          label: n.label,
          description: n.description,
          index: layoutNodes.length,
          onClick: () => {}, // Will be overridden
        },
      });
    });
  });

  return layoutNodes;
}

const diagramTypeLabels: Record<string, string> = {
  flow: 'Flow Diagram',
  relationship: 'Relationship Diagram',
  architecture: 'Architecture Diagram',
  sequence: 'Sequence Diagram',
};

export function ContextDiagram({ diagram, onExplainThisDiagram }: ContextDiagramProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [selectedNode, setSelectedNode] = useState<DiagramNode | null>(null);
  const [layoutNodes, setLayoutNodes] = useState<CustomNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    const computedNodes = computeLayout(diagram.nodes, diagram.edges);
    const nodesWithClick = computedNodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        onClick: () => {
          const node = diagram.nodes.find(nd => nd.id === n.id);
          if (node?.description) setSelectedNode(node);
        }
      }
    }));
    setLayoutNodes(nodesWithClick);

    const flowEdges: Edge[] = diagram.edges.map((e, i) => ({
      id: `e-${i}`,
      source: e.from,
      target: e.to,
      label: e.label,
      type: 'smoothstep',
      animated: true,
      style: { stroke: 'var(--primary)', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--primary)' },
      labelStyle: { fill: 'var(--foreground)', fontWeight: 600, fontSize: 12 },
      labelBgStyle: { fill: 'var(--card)', stroke: 'var(--border)' },
      labelPaddingX: 8,
      labelPaddingY: 4,
    }));
    setEdges(flowEdges);
  }, [diagram]);

  if (isMobile) {
    return (
      <div className="my-5 rounded-lg border border-border overflow-hidden bg-card shadow-sm">
        <div className="flex items-center gap-2 bg-muted/50 px-4 py-2 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground">{diagramTypeLabels[diagram.type] || 'Diagram'}</span>
          <span className="text-sm font-semibold text-foreground truncate">{diagram.title}</span>
        </div>
        <div className="p-4 flex flex-col gap-3">
          {layoutNodes.map((node, idx) => {
            const originalNode = diagram.nodes.find(n => n.id === node.id);
            const outEdges = diagram.edges.filter(e => e.from === node.id);
            const Icon = nodeIcons[originalNode?.type || 'process'] || Settings;
            const style = nodeStyles[originalNode?.type || 'process'] || nodeStyles.process;
            
            return (
              <motion.div
                key={node.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <div 
                  className={cn('p-3 rounded-lg border-2 shadow-sm', style, originalNode?.description && 'cursor-pointer')}
                  onClick={() => originalNode?.description && setSelectedNode(originalNode)}
                >
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <Icon className="size-4 shrink-0" />
                    <span>{node.data.label}</span>
                  </div>
                  {originalNode?.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{originalNode.description}</p>
                  )}
                </div>
                {outEdges.length > 0 && (
                  <div className="flex flex-col items-center py-1 text-muted-foreground">
                    {outEdges.map((e, i) => (
                      <div key={i} className="flex flex-col items-center">
                        {e.label && <span className="text-xs font-medium">{e.label}</span>}
                        <ChevronDown className="size-4" />
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
        {onExplainThisDiagram && (
          <div className="px-4 py-3 border-t border-border bg-muted/30">
            <button
              onClick={() => onExplainThisDiagram(diagram)}
              className="w-full flex items-center justify-center gap-2 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
            >
              <MessageSquare className="size-4" />
              Explain This Diagram
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="my-5 rounded-lg border border-border overflow-hidden bg-card shadow-sm relative">
      <div className="flex items-center gap-2 bg-muted/50 px-4 py-2 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground">{diagramTypeLabels[diagram.type] || 'Diagram'}</span>
        <span className="text-sm font-semibold text-foreground truncate">{diagram.title}</span>
        {onExplainThisDiagram && (
          <button
            onClick={() => onExplainThisDiagram(diagram)}
            className="ml-auto flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            <MessageSquare className="size-3" />
            Explain This Diagram
          </button>
        )}
      </div>
      
      <div className="h-[500px] bg-background">
        <ReactFlow
          nodes={layoutNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          zoomOnScroll={false}
          panOnDrag={true}
          zoomOnPinch={true}
          attributionPosition="bottom-left"
        >
          <Background color="var(--border)" gap={16} />
          <Controls
            className="!bg-card !border-border [&_button]:!bg-card [&_button]:!border-border [&_button]:!text-foreground [&_button]:hover:!bg-muted"
            showInteractive={false}
          />
        </ReactFlow>
      </div>

      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:bottom-4 md:w-80 bg-card border border-border rounded-lg shadow-xl p-4 z-10"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                {(() => {
                  const Icon = nodeIcons[selectedNode.type] || Settings;
                  return <Icon className="size-4 text-primary" />;
                })()}
                <h3 className="font-semibold text-sm text-foreground">{selectedNode.label}</h3>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close details"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {selectedNode.description}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}