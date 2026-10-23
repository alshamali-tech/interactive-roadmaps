import { useId, useMemo } from 'react';
import { Layout, AlertTriangle } from 'lucide-react';
import type { DiagramProps } from '@/curriculum/schema';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DiagramNode {
  id: string;
  label: string;
  type: 'start' | 'end' | 'process' | 'decision';
}

interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

interface NodePosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─── Parser ─────────────────────────────────────────────────────────────────

/**
 * Parses a Mermaid-like flowchart syntax into nodes and edges.
 *
 * Supported syntax:
 * - `NodeA --> NodeB` — edge from A to B
 * - `NodeA -->|Label| NodeB` — edge with a label
 * - `{Decision?}` — diamond-shaped decision node
 * - `Start`, `End` — rounded terminal nodes
 * - Any other text — rectangular process node
 * - Multiple lines are merged into a single graph
 *
 * @example
 * ```
 * Start --> Check Temperature --> {> 30?} -->|Yes| Print Hot --> End
 * Check Temperature --> {> 15?} -->|Yes| Print Nice --> End
 * ```
 */
function parseDiagram(source: string): {
  nodes: Map<string, DiagramNode>;
  edges: DiagramEdge[];
} {
  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];

  const lines = source
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const parseNode = (raw: string): DiagramNode => {
    const trimmed = raw.trim();
    // Decision node: {text}
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return { id: trimmed, label: trimmed.slice(1, -1), type: 'decision' };
    }
    // Terminal nodes
    if (trimmed.toLowerCase() === 'start') {
      return { id: '__start__', label: 'Start', type: 'start' };
    }
    if (trimmed.toLowerCase() === 'end') {
      return { id: '__end__', label: 'End', type: 'end' };
    }
    // Process node
    return { id: trimmed, label: trimmed, type: 'process' };
  };

  for (const line of lines) {
    // Tokenize by splitting on arrow patterns, keeping delimiters
    // Matches: -->|label| or -->
    const parts = line.split(/(-->\|[^|]*\||-->)/);

    // parts[0] is the first node, then alternating: arrow, node, arrow, node...
    for (let i = 0; i < parts.length - 2; i += 2) {
      const fromRaw = parts[i].trim();
      const arrowRaw = parts[i + 1];
      const toRaw = parts[i + 2].trim();

      if (!fromRaw || !toRaw) continue;

      // Extract edge label from arrow: -->|label|
      const labelMatch = arrowRaw.match(/^-->\|([^|]+)\|$/);
      const edgeLabel = labelMatch ? labelMatch[1].trim() : undefined;

      const fromNode = parseNode(fromRaw);
      const toNode = parseNode(toRaw);

      if (!nodes.has(fromNode.id)) nodes.set(fromNode.id, fromNode);
      if (!nodes.has(toNode.id)) nodes.set(toNode.id, toNode);

      edges.push({ from: fromNode.id, to: toNode.id, label: edgeLabel });
    }
  }

  return { nodes, edges };
}

// ─── Layout Engine ──────────────────────────────────────────────────────────

/**
 * Computes a layered (Sugiyama-style) layout for the diagram.
 *
 * 1. Assigns each node to a layer via longest-path from root nodes
 * 2. Sorts nodes within each layer by average parent x-position (crossing reduction)
 * 3. Computes final (x, y) positions
 */
function computeLayout(
  nodes: Map<string, DiagramNode>,
  edges: DiagramEdge[]
): {
  positions: Map<string, NodePosition>;
  svgWidth: number;
  svgHeight: number;
  offsetX: number;
  offsetY: number;
} {
  const nodeWidth = 150;
  const nodeHeight = 42;
  const decisionHeight = 54;
  const layerSpacing = 100;
  const nodeGap = 28;

  // Build reverse adjacency (child → parents)
  const parents = new Map<string, string[]>();
  for (const [id] of nodes) parents.set(id, []);
  for (const edge of edges) {
    if (parents.has(edge.to) && !parents.get(edge.to)!.includes(edge.from)) {
      parents.get(edge.to)!.push(edge.from);
    }
  }

  // Assign layers using longest-path from roots (memoized DFS)
  const layers = new Map<string, number>();
  const visiting = new Set<string>();

  function getLayer(id: string): number {
    if (layers.has(id)) return layers.get(id)!;
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);

    const parentList = parents.get(id) || [];
    if (parentList.length === 0) {
      layers.set(id, 0);
      visiting.delete(id);
      return 0;
    }

    const maxParentLayer = Math.max(...parentList.map((p) => getLayer(p)));
    const layer = maxParentLayer + 1;
    layers.set(id, layer);
    visiting.delete(id);
    return layer;
  }

  for (const [id] of nodes) getLayer(id);

  // Group nodes by layer
  const layerGroups = new Map<number, string[]>();
  for (const [id, layer] of layers) {
    if (!layerGroups.has(layer)) layerGroups.set(layer, []);
    layerGroups.get(layer)!.push(id);
  }

  // First pass: assign initial positions (insertion order)
  const positions = new Map<string, NodePosition>();

  const sortedLayers = Array.from(layerGroups.keys()).sort((a, b) => a - b);

  for (const layer of sortedLayers) {
    const nodeIds = layerGroups.get(layer)!;
    const totalWidth =
      nodeIds.length * nodeWidth + (nodeIds.length - 1) * nodeGap;
    const startX = -totalWidth / 2;

    nodeIds.forEach((id, index) => {
      const node = nodes.get(id)!;
      const h = node.type === 'decision' ? decisionHeight : nodeHeight;
      positions.set(id, {
        x: startX + index * (nodeWidth + nodeGap) + nodeWidth / 2,
        y: layer * layerSpacing + h / 2,
        w: nodeWidth,
        h,
      });
    });
  }

  // Second pass: sort nodes within each layer by average parent x (crossing reduction)
  for (const layer of sortedLayers) {
    if (layer === 0) continue;
    const nodeIds = layerGroups.get(layer)!;

    nodeIds.sort((a, b) => {
      const parentsA = edges.filter((e) => e.to === a).map((e) => e.from);
      const parentsB = edges.filter((e) => e.to === b).map((e) => e.from);

      const avgXA =
        parentsA.length > 0
          ? parentsA.reduce(
              (sum, p) => sum + (positions.get(p)?.x ?? 0),
              0
            ) / parentsA.length
          : 0;
      const avgXB =
        parentsB.length > 0
          ? parentsB.reduce(
              (sum, p) => sum + (positions.get(p)?.x ?? 0),
              0
            ) / parentsB.length
          : 0;

      return avgXA - avgXB;
    });

    // Recompute x positions after sorting
    const totalWidth =
      nodeIds.length * nodeWidth + (nodeIds.length - 1) * nodeGap;
    const startX = -totalWidth / 2;
    nodeIds.forEach((id, index) => {
      const pos = positions.get(id)!;
      pos.x = startX + index * (nodeWidth + nodeGap) + nodeWidth / 2;
    });
  }

  // Compute SVG bounding box
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [, pos] of positions) {
    minX = Math.min(minX, pos.x - pos.w / 2);
    maxX = Math.max(maxX, pos.x + pos.w / 2);
    maxY = Math.max(maxY, pos.y + pos.h / 2);
  }

  const padding = 40;
  const svgWidth = maxX - minX + padding * 2;
  const svgHeight = maxY + padding * 2;
  const offsetX = -minX + padding;
  const offsetY = padding;

  return { positions, svgWidth, svgHeight, offsetX, offsetY };
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * Diagram widget — renders a Mermaid-like flowchart as SVG.
 *
 * Supports:
 * - Process nodes (rectangles)
 * - Decision nodes (diamonds, `{text}`)
 * - Terminal nodes (rounded rectangles, `Start`/`End`)
 * - Labeled edges (`-->|label|`)
 * - Automatic layered layout with crossing reduction
 */
export function DiagramWidget({ source, caption, diagramType }: DiagramProps) {
  // Sanitize useId output for SVG id attribute (must be alphanumeric)
  const markerId = useId().replace(/[^a-zA-Z0-9]/g, '');

  const result = useMemo(() => {
    try {
      const parsed = parseDiagram(source);
      if (parsed.nodes.size === 0) return null;
      const layout = computeLayout(parsed.nodes, parsed.edges);
      return { ...parsed, ...layout };
    } catch {
      return null;
    }
  }, [source]);

  // Fallback for unparseable diagrams
  if (!result) {
    return (
      <div className="my-5 rounded-lg border border-border overflow-hidden bg-card">
        <div className="flex items-center gap-2 bg-muted/50 px-4 py-2 border-b border-border">
          <Layout className="size-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Diagram</span>
          <span className="text-xs text-muted-foreground ml-auto capitalize">
            {diagramType}
          </span>
        </div>
        <div className="p-4 bg-muted/20 flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="size-4 shrink-0" />
          Unable to parse diagram source.
        </div>
      </div>
    );
  }

  const { nodes, edges, positions, svgWidth, svgHeight, offsetX, offsetY } =
    result;

  return (
    <div className="my-5 rounded-lg border border-border overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 bg-muted/50 px-4 py-2 border-b border-border">
        <Layout className="size-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Diagram</span>
        <span className="text-xs text-muted-foreground ml-auto capitalize">
          {diagramType}
        </span>
      </div>

      {/* SVG Canvas */}
      <div className="p-4 bg-white overflow-x-auto">
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="mx-auto block"
          role="img"
          aria-label={caption ?? 'Flowchart diagram'}
        >
          <defs>
            <marker
              id={`arrow-${markerId}`}
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#6b7280" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((edge, i) => {
            const fromPos = positions.get(edge.from);
            const toPos = positions.get(edge.to);
            if (!fromPos || !toPos) return null;

            const x1 = fromPos.x + offsetX;
            const y1 = fromPos.y + fromPos.h / 2 + offsetY;
            const x2 = toPos.x + offsetX;
            const y2 = toPos.y - toPos.h / 2 + offsetY;

            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            // Compute label width based on text length
            const labelWidth = edge.label
              ? Math.max(24, edge.label.length * 6 + 12)
              : 0;

            return (
              <g key={`edge-${i}`}>
                {/* Edge line */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#9ca3af"
                  strokeWidth="1.5"
                  markerEnd={`url(#arrow-${markerId})`}
                />
                {/* Edge label */}
                {edge.label && (
                  <>
                    <rect
                      x={midX - labelWidth / 2}
                      y={midY - 9}
                      width={labelWidth}
                      height={18}
                      rx="4"
                      fill="white"
                      stroke="#d1d5db"
                      strokeWidth="1"
                    />
                    <text
                      x={midX}
                      y={midY}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="10"
                      fill="#374151"
                      fontWeight="600"
                      fontFamily="system-ui, sans-serif"
                    >
                      {edge.label}
                    </text>
                  </>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {Array.from(nodes.entries()).map(([id, node]) => {
            const pos = positions.get(id);
            if (!pos) return null;

            const cx = pos.x + offsetX;
            const cy = pos.y + offsetY;

            if (node.type === 'decision') {
              const halfW = pos.w / 2;
              const halfH = pos.h / 2;
              return (
                <g key={id}>
                  <polygon
                    points={`${cx},${cy - halfH} ${cx + halfW},${cy} ${cx},${cy + halfH} ${cx - halfW},${cy}`}
                    fill="#fef3c7"
                    stroke="#d97706"
                    strokeWidth="2"
                  />
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="11"
                    fill="#92400e"
                    fontWeight="600"
                    fontFamily="system-ui, sans-serif"
                  >
                    {node.label}
                  </text>
                </g>
              );
            }

            if (node.type === 'start' || node.type === 'end') {
              const isStart = node.type === 'start';
              return (
                <g key={id}>
                  <rect
                    x={cx - pos.w / 2}
                    y={cy - pos.h / 2}
                    width={pos.w}
                    height={pos.h}
                    rx={pos.h / 2}
                    fill={isStart ? '#dbeafe' : '#fee2e2'}
                    stroke={isStart ? '#2563eb' : '#dc2626'}
                    strokeWidth="2"
                  />
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="12"
                    fontWeight="700"
                    fill={isStart ? '#1e40af' : '#991b1b'}
                    fontFamily="system-ui, sans-serif"
                  >
                    {node.label}
                  </text>
                </g>
              );
            }

            // Process node
            return (
              <g key={id}>
                <rect
                  x={cx - pos.w / 2}
                  y={cy - pos.h / 2}
                  width={pos.w}
                  height={pos.h}
                  rx="6"
                  fill="#f0fdf4"
                  stroke="#16a34a"
                  strokeWidth="2"
                />
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="11.5"
                  fill="#166534"
                  fontWeight="500"
                  fontFamily="system-ui, sans-serif"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Caption */}
      {caption && (
        <div className="px-4 py-2 border-t border-border bg-muted/20">
          <p className="text-xs text-muted-foreground italic text-center">
            {caption}
          </p>
        </div>
      )}
    </div>
  );
}
