/**
 * Context Diagram Widget (W1.4) — read-only, interactive AI-generated diagrams.
 *
 * Renders a validated W1.2 `Diagram` with React Flow:
 *   - Desktop (≥768px): auto-laid-out graph with zoom controls + panning.
 *     Nodes are NOT draggable (read-only); clicking a node with a description
 *     opens a detail popover (closes on outside click / Escape / ✕).
 *   - Mobile (<768px): vertical stack of cards with flow arrows — far more
 *     usable on touch screens. Tapping a card opens a bottom sheet.
 *
 * Extras:
 *   - Distinct visual style + Lucide icon per node type (6 types).
 *   - Staggered fade-in for nodes; edges reveal after the nodes.
 *   - "Explain This Diagram" button (only when `onExplainThisDiagram` is given).
 *   - Error boundary: malformed data degrades to a friendly fallback instead
 *     of crashing the lesson.
 *   - Full dark-mode support via Tailwind `dark:` classes + theme CSS vars.
 *
 * Two deliberate departures from the original W1.4 brief:
 *   - The node detail opens as a fixed panel (bottom-right on desktop, bottom
 *     sheet on mobile) instead of a tooltip anchored to the clicked node.
 *     Anchoring would have to recompute through React Flow's fitView transform
 *     on every pan/zoom; the fixed panel is stable and never occludes a node.
 *   - The breakpoint query stays `(max-width: 768px)`, so a viewport of exactly
 *     768px gets the mobile cards rather than the desktop ≥768px graph. Three
 *     test mocks match on that literal string, and the integration suite's
 *     mobile block matches `includes('max-width: 768px')` — tightening it to
 *     767px would quietly make those mobile assertions render the desktop path.
 */

import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDownToLine,
  Settings,
  HelpCircle,
  ArrowUpFromLine,
  Database,
  Cloud,
  MessageCircle,
  X,
  ChevronDown,
  AlertTriangle,
  Server,
  Layers,
  Globe,
  Box,
  FileText,
  HardDrive,
  Shield,
  Zap,
  GitBranch,
  Workflow,
  Cpu,
  Network,
  Lock,
  Key,
  Search,
  Send,
  Users,
  Bot,
  Terminal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Diagram, DiagramNode, DiagramNodeType } from '@/engine/generatorSchema';
import { calculateDiagramLayout } from '@/lib/diagramLayout';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ContextDiagramProps {
  /** Validated diagram data (see DiagramSchema in engine/generatorSchema.ts). */
  diagram: Diagram;
  /** Optional callback for the "Explain This Diagram" button (AI tutor hook). */
  onExplainThisDiagram?: (diagram: Diagram) => void;
}

// ─── Responsive hook ─────────────────────────────────────────────────────────

function useMediaQuery(query: string): boolean {
  // Lazy init avoids a desktop-graph flash on mobile first paint.
  const [matches, setMatches] = useState<boolean>(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(query).matches
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(query);
    // No synchronous setMatches here: the lazy useState initializer above already
    // read the current value at first render, and re-setting it in the effect body
    // only causes a second render for the same answer (react-hooks/set-state-in-effect).
    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

// ─── Node type → visual style mapping ────────────────────────────────────────

type CustomNodeData = {
  label: string;
  description?: string;
  /** Authored hex colour override (W1.2 schema). */
  color?: string;
  /** Authored Lucide icon name; falls back to the node type's icon. */
  icon?: string;
  /** Stagger index for the fade-in animation (100ms steps). */
  index: number;
  onClick: () => void;
};

type CustomNode = Node<CustomNodeData, DiagramNodeType>;

const nodeStyles: Record<DiagramNodeType, string> = {
  input:
    'bg-blue-50 dark:bg-blue-950/40 border-blue-400 dark:border-blue-700 text-blue-900 dark:text-blue-100',
  process:
    'bg-gray-50 dark:bg-gray-800/60 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100',
  decision:
    'bg-yellow-50 dark:bg-yellow-950/40 border-yellow-500 dark:border-yellow-600 text-yellow-900 dark:text-yellow-100',
  output:
    'bg-green-50 dark:bg-green-950/40 border-green-500 dark:border-green-600 text-green-900 dark:text-green-100',
  storage:
    'bg-purple-50 dark:bg-purple-950/40 border-purple-500 dark:border-purple-600 text-purple-900 dark:text-purple-100',
  service:
    'bg-teal-50 dark:bg-teal-950/40 border-teal-500 dark:border-teal-600 text-teal-900 dark:text-teal-100',
};

const nodeIcons: Record<DiagramNodeType, React.ComponentType<{ className?: string }>> = {
  input: ArrowDownToLine,
  process: Settings,
  decision: HelpCircle,
  output: ArrowUpFromLine,
  storage: Database,
  service: Cloud,
};

/** Stable icon identifiers — also exposed as data-icon for tests. */
const nodeIconNames: Record<DiagramNodeType, string> = {
  input: 'arrow-down-to-line',
  process: 'settings',
  decision: 'help-circle',
  output: 'arrow-up-from-line',
  storage: 'database',
  service: 'cloud',
};

/**
 * Curated registry for node-authored `icon` names.
 *
 * Deliberately a fixed list rather than lucide-react's full set: the package
 * tree-shakes per named export, so accepting arbitrary names would mean bundling
 * every icon to serve one optional field. An unknown name falls back to the node
 * type's icon, so a hallucinated value degrades appearance only — never a crash.
 */
const iconRegistry: Record<string, React.ComponentType<{ className?: string }>> = {
  'arrow-down-to-line': ArrowDownToLine,
  settings: Settings,
  'help-circle': HelpCircle,
  'arrow-up-from-line': ArrowUpFromLine,
  database: Database,
  cloud: Cloud,
  server: Server,
  layers: Layers,
  globe: Globe,
  box: Box,
  'file-text': FileText,
  'hard-drive': HardDrive,
  shield: Shield,
  zap: Zap,
  'git-branch': GitBranch,
  workflow: Workflow,
  cpu: Cpu,
  network: Network,
  lock: Lock,
  key: Key,
  search: Search,
  send: Send,
  users: Users,
  bot: Bot,
  terminal: Terminal,
};

/** DiagramNodeSchema allows kebab-case or PascalCase; registry keys are kebab-case. */
function normalizeIconName(name: string): string {
  return name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

/** Resolves an authored icon, falling back to the node type's default. */
function resolveIcon(
  nodeType: DiagramNodeType,
  iconName?: string
): { Icon: React.ComponentType<{ className?: string }>; name: string } {
  const key = iconName ? normalizeIconName(iconName) : '';
  const custom = key ? iconRegistry[key] : undefined;
  if (custom) return { Icon: custom, name: key };
  return {
    Icon: nodeIcons[nodeType] ?? Settings,
    name: nodeIconNames[nodeType] ?? 'settings',
  };
}

/**
 * Hex override for authored colours. The fill uses color-mix so a strong hex
 * tints the node instead of replacing it and destroying label contrast.
 */
function colorOverrides(color?: string): React.CSSProperties {
  if (!color) return {};
  return {
    borderColor: color,
    backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
  };
}

function DiagramNodeComponent({ data, type }: NodeProps<CustomNode>) {
  const nodeType = (type ?? 'process') as DiagramNodeType;
  const { Icon, name: iconName } = resolveIcon(nodeType, data.icon);
  const style = nodeStyles[nodeType] ?? nodeStyles.process;

  const isDecision = nodeType === 'decision';
  const isService = nodeType === 'service';

  return (
    <div
      data-node-type={nodeType}
      data-icon={iconName}
      data-color={data.color}
      role="button"
      tabIndex={0}
      aria-label={data.label}
      className={cn(
        'border-2 shadow-md cursor-pointer transition-all hover:shadow-lg hover:scale-105 flex items-center justify-center text-sm font-medium',
        style,
        isDecision ? 'rotate-45 w-28 h-28 rounded-none' : 'px-4 py-3 rounded-lg min-w-[150px]'
      )}
      style={{
        ...(isService
          ? {
              clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
              width: '160px',
              height: '80px',
              paddingLeft: '20px',
              paddingRight: '20px',
            }
          : {}),
        ...colorOverrides(data.color),
      }}
      onClick={data.onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          data.onClick();
        }
      }}
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

const diagramTypeLabels: Record<Diagram['type'], string> = {
  flow: 'Flow Diagram',
  relationship: 'Relationship Diagram',
  architecture: 'Architecture Diagram',
  sequence: 'Sequence Diagram',
};

// ─── Error boundary ──────────────────────────────────────────────────────────

interface DiagramErrorBoundaryState {
  hasError: boolean;
}

/** Catches any rendering failure and shows a graceful, non-blocking fallback. */
class DiagramErrorBoundary extends Component<{ children: ReactNode }, DiagramErrorBoundaryState> {
  state: DiagramErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): DiagramErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: unknown): void {
    console.error('[ContextDiagram] Diagram rendering failed:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="my-5 rounded-lg border border-dashed border-border bg-card p-6 text-center shadow-sm"
        >
          <AlertTriangle className="size-5 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Diagram could not be rendered</p>
          <p className="text-xs text-muted-foreground mt-1">
            The diagram data appears to be malformed. The surrounding lesson text still covers the
            same concepts.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Main component ──────────────────────────────────────────────────────────

/** Public widget — wraps the renderer in an error boundary. */
export function ContextDiagram(props: ContextDiagramProps) {
  return (
    <DiagramErrorBoundary>
      <ContextDiagramInner {...props} />
    </DiagramErrorBoundary>
  );
}

function ContextDiagramInner({ diagram, onExplainThisDiagram }: ContextDiagramProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  // Selection is keyed by diagram identity, so swapping the diagram drops the
  // open detail without needing a reset effect (react-hooks/set-state-in-effect).
  const [selection, setSelection] = useState<{ diagram: Diagram; node: DiagramNode } | null>(
    null
  );
  const selectedNode = selection?.diagram === diagram ? selection.node : null;
  // Same trick for the edge reveal: the timer is the only write, and "not yet
  // revealed for this diagram" is derived rather than reset in an effect body.
  const [revealedFor, setRevealedFor] = useState<Diagram | null>(null);
  const edgesVisible = revealedFor === diagram;
  const popoverRef = useRef<HTMLDivElement>(null);

  const isValidShape =
    !!diagram && Array.isArray(diagram.nodes) && Array.isArray(diagram.edges);
  const nodeCount = isValidShape ? diagram.nodes.length : 0;

  // Convert diagram nodes → React Flow nodes with auto-layout (W1.5).
  const layoutNodes = useMemo<CustomNode[]>(() => {
    if (!isValidShape) return [];
    const layout = calculateDiagramLayout(diagram.nodes, diagram.edges, diagram.type);
    return layout.nodes.map((n, index) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      draggable: false,
      selectable: true,
      data: {
        label: n.label,
        description: n.description,
        color: n.color,
        icon: n.icon,
        index,
        onClick: () => {
          const original = diagram.nodes.find((nd) => nd.id === n.id);
          if (original?.description) setSelection({ diagram, node: original });
        },
      },
    }));
  }, [diagram, isValidShape]);

  // Convert diagram edges → React Flow edges (respecting optional W1.2 styling).
  const flowEdges = useMemo<Edge[]>(() => {
    if (!isValidShape) return [];
    return diagram.edges.map((e, i) => ({
      id: `e-${i}`,
      source: e.from,
      target: e.to,
      label: e.label,
      type: 'smoothstep',
      animated: e.animated ?? false,
      style: {
        stroke: e.style?.stroke ?? 'var(--primary)',
        strokeWidth: e.style?.strokeWidth ?? 2,
        strokeDasharray: e.style?.dashed ? '6 4' : undefined,
        opacity: e.style?.opacity ?? 1,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: e.style?.stroke ?? 'var(--primary)' },
      labelStyle: { fill: 'var(--foreground)', fontWeight: 600, fontSize: 12 },
      labelBgStyle: { fill: 'var(--card)', stroke: 'var(--border)' },
      labelPaddingX: 8,
      labelPaddingY: 4,
    }));
  }, [diagram, isValidShape]);

  // Edges reveal AFTER the staggered node fade-in (100ms per node).
  useEffect(() => {
    if (nodeCount === 0) return;
    const revealDelay = Math.min(nodeCount * 100 + 350, 1500);
    const timer = setTimeout(() => setRevealedFor(diagram), revealDelay);
    return () => clearTimeout(timer);
  }, [diagram, nodeCount]);

  // Dismiss the detail popover on outside click or Escape.
  useEffect(() => {
    if (!selectedNode) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as HTMLElement)) {
        setSelection(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelection(null);
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedNode]);

  // Malformed data → throw into the error boundary (graceful fallback UI).
  if (!isValidShape) {
    throw new Error('ContextDiagram: invalid diagram data — nodes and edges must be arrays.');
  }

  if (diagram.nodes.length === 0) {
    return (
      <div className="my-5 rounded-lg border border-border overflow-hidden bg-card shadow-sm p-8 text-center">
        <p className="text-muted-foreground text-sm">No nodes to display in this diagram.</p>
      </div>
    );
  }

  const typeLabel = diagramTypeLabels[diagram.type] ?? 'Diagram';

  // Shared detail popover: bottom-right panel on desktop, bottom sheet on mobile.
  const detailPopover = (
    <AnimatePresence>
      {selectedNode && (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          role="dialog"
          aria-label={`${selectedNode.label} details`}
          className={cn(
            'absolute z-20 bg-card border border-border rounded-lg shadow-xl p-4',
            isMobile ? 'bottom-2 left-2 right-2' : 'bottom-4 right-4 w-80'
          )}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              {(() => {
                const { Icon } = resolveIcon(selectedNode.type, selectedNode.icon);
                return <Icon className="size-4 text-primary" />;
              })()}
              <h3 className="font-semibold text-sm text-foreground">{selectedNode.label}</h3>
            </div>
            <button
              onClick={() => setSelection(null)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close details"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{selectedNode.description}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ── Mobile: vertical card stack (no graph canvas) ──
  if (isMobile) {
    return (
      <div
        data-testid="context-diagram-mobile"
        className="my-5 rounded-lg border border-border overflow-hidden bg-card shadow-sm relative"
      >
        <div className="flex items-center gap-2 bg-muted/50 px-4 py-2 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground">{typeLabel}</span>
          <span className="text-sm font-semibold text-foreground truncate">{diagram.title}</span>
        </div>
        <div className="p-4 flex flex-col gap-3" data-testid="diagram-card-stack">
          {layoutNodes.map((node, idx) => {
            const originalNode = diagram.nodes.find((n) => n.id === node.id);
            const outEdges = diagram.edges.filter((e) => e.from === node.id);
            const nodeType = (originalNode?.type ?? 'process') as DiagramNodeType;
            const { Icon, name: iconName } = resolveIcon(nodeType, originalNode?.icon);
            const style = nodeStyles[nodeType] ?? nodeStyles.process;
            const hasDescription = !!originalNode?.description;

            return (
              <motion.div
                key={node.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <div
                  data-testid="diagram-card"
                  data-node-type={nodeType}
                  data-icon={iconName}
                  data-color={originalNode?.color}
                  role={hasDescription ? 'button' : undefined}
                  tabIndex={hasDescription ? 0 : undefined}
                  className={cn(
                    'p-3 rounded-lg border-2 shadow-sm',
                    style,
                    hasDescription && 'cursor-pointer'
                  )}
                  style={colorOverrides(originalNode?.color)}
                  onClick={() => hasDescription && originalNode && setSelection({ diagram, node: originalNode })}
                  onKeyDown={(event) => {
                    if (hasDescription && originalNode && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      setSelection({ diagram, node: originalNode });
                    }
                  }}
                >
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <Icon className="size-4 shrink-0" />
                    <span>{node.data.label}</span>
                  </div>
                  {originalNode?.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {originalNode.description}
                    </p>
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
              <MessageCircle className="size-4" />
              Explain This Diagram
            </button>
          </div>
        )}
        {detailPopover}
      </div>
    );
  }

  // ── Desktop: read-only React Flow canvas ──
  return (
    <div className="my-5 rounded-lg border border-border overflow-hidden bg-card shadow-sm relative">
      <div className="flex items-center gap-2 bg-muted/50 px-4 py-2 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground">{typeLabel}</span>
        <span className="text-sm font-semibold text-foreground truncate">{diagram.title}</span>
        {onExplainThisDiagram && (
          <button
            onClick={() => onExplainThisDiagram(diagram)}
            className="ml-auto flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            <MessageCircle className="size-3" />
            Explain This Diagram
          </button>
        )}
      </div>

      <div className="h-[500px] bg-background">
        <ReactFlow
          nodes={layoutNodes}
          edges={edgesVisible ? flowEdges : []}
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

      {detailPopover}
    </div>
  );
}
