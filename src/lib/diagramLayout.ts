/**
 * Auto-layout algorithms for context diagrams (W1.5).
 *
 * AI-generated diagrams never include coordinates — this module positions
 * nodes automatically so every diagram type reads cleanly:
 *
 *   - flow:         left-to-right columns in topological (dependency) order
 *   - relationship: radial — most-connected node at the center
 *   - architecture: vertical layers grouped by node type
 *   - sequence:     vertical timeline (time flows top → bottom) with actor lanes
 *
 * ── Determinism & tiebreaking rules (same input → same output, always) ──
 * 1. Topological sort (Kahn): among "ready" nodes, the smallest ID goes first.
 * 2. Flow columns: nodes within a column are sorted by ID.
 * 3. Relationship hub: highest degree wins; ties → smallest ID. Satellites are
 *    ordered by degree (desc), then ID (asc) — equally-connected nodes end up
 *    adjacent on the circle.
 * 4. Architecture layers: fixed order input → process/service → decision →
 *    storage → output; nodes within a layer sorted by ID.
 * 5. Sequence: BFS from the smallest-ID root; children visited in edge-array
 *    order; actor lanes assigned by sorted actor ID; non-actor nodes join the
 *    lane of their first adjacent actor (edge-array order).
 * 6. Disconnected components: ordered by their smallest node ID and stacked
 *    vertically with a fixed gap.
 *
 * All coordinates are normalized so the bounding box starts at (0, 0).
 */

import type { DiagramNode, DiagramEdge, DiagramType } from '@/engine/generatorSchema';

export interface LayoutNode {
  id: string;
  label: string;
  type: DiagramNode['type'];
  description?: string;
  /** Validated hex colour from the W1.2 schema, carried through for the renderer. */
  color?: string;
  /** Authored Lucide icon name (kebab-case or PascalCase); renderer resolves it. */
  icon?: string;
  position: { x: number; y: number };
}

export interface LayoutResult {
  nodes: LayoutNode[];
  width: number;
  height: number;
}

// ─── Spacing constants ───────────────────────────────────────────────────────

/** Nominal node bounding box used for overlap-free spacing. */
export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 60;

/** Flow: horizontal gap between columns (edge-to-edge). */
const FLOW_COLUMN_GAP = 200;
/** Flow: vertical gap between stacked nodes in one column. */
const FLOW_ROW_GAP = 100;
/** Architecture: vertical pitch between layers (inputs y=0, processes y=200, ...). */
const ARCH_LAYER_PITCH = 200;
/** Architecture: horizontal gap between nodes within a layer. */
const ARCH_COLUMN_GAP = 150;
/** Sequence: vertical gap between timeline rows (additive to node height). */
const SEQUENCE_ROW_GAP = 90;
/** Sequence: horizontal pitch between actor lanes. */
const SEQUENCE_LANE_GAP = 120;
/** Vertical gap between disconnected subgraphs. */
const COMPONENT_GAP = 300;
/** Relationship: minimum circle radius (also the 2-node distance). */
const RELATIONSHIP_MIN_RADIUS = 220;
/** Relationship: extra clearance added to the chord between satellites. */
const RELATIONSHIP_CHORD_PADDING = 40;
/** Two-node diagrams: explicit gap required by the spec. */
const TWO_NODE_GAP = 200;
/** Dense diagrams (>8 nodes): compress gaps slightly, keep readability. */
const DENSE_SCALE = 0.85;

/**
 * Height a node actually occupies on screen, which is NOT NODE_HEIGHT for two
 * of the six types. ContextDiagram renders a decision node as a 112px square
 * rotated 45° (Tailwind `w-28 h-28 rotate-45`), whose axis-aligned bounding box
 * is 112·√2 ≈ 158px because a CSS transform leaves layout size untouched, and a
 * service node as a fixed 160×80 hexagon. Spacing computed from NODE_HEIGHT=60
 * alone therefore overlaps consecutive rows by 8px (sequence) or 13px (dense
 * flow) whenever a decision node is involved.
 *
 * Must stay in step with the node markup in
 * src/components/universal/ContextDiagram.tsx.
 */
const DECISION_VISUAL_HEIGHT = Math.ceil(112 * Math.SQRT2);
const SERVICE_VISUAL_HEIGHT = 80;

function nodeVisualHeight(type: DiagramNode['type']): number {
  if (type === 'decision') return DECISION_VISUAL_HEIGHT;
  if (type === 'service') return SERVICE_VISUAL_HEIGHT;
  return NODE_HEIGHT;
}

/** Vertical pitch needed so the tallest node in a row set cannot collide. */
function tallestNode(nodes: DiagramNode[]): number {
  return nodes.reduce((height, node) => Math.max(height, nodeVisualHeight(node.type)), NODE_HEIGHT);
}

// ─── Public helpers ──────────────────────────────────────────────────────────

/**
 * Locale-independent ID ordering, used for every determinism tiebreaker here.
 *
 * String.prototype.localeCompare without an explicit locale depends on the
 * runtime's default locale and ICU build, and collates case and punctuation
 * differently from code-point order ("b" sorts before "A"). The same diagram
 * could then land in a different node order in Node than in a browser, which
 * breaks the reproducibility requirement, so comparisons stay code-point based.
 */
function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Counts incoming + outgoing edges for a node (a self-loop counts twice).
 * Edges referencing other nodes are ignored for this node.
 */
export function getNodeDegree(nodeId: string, edges: DiagramEdge[]): number {
  let degree = 0;
  for (const edge of edges) {
    if (edge.from === nodeId) degree++;
    if (edge.to === nodeId) degree++;
  }
  return degree;
}

/**
 * Kahn's algorithm topological sort — deterministic.
 *
 * Tiebreaking: whenever multiple nodes have in-degree 0, the smallest ID
 * (lexicographic) is emitted first. Cycles are handled gracefully: nodes that
 * can never reach in-degree 0 are appended at the end in ID order, so the
 * result ALWAYS contains every node exactly once (layout must never crash,
 * even though the W1.2 validator rejects cyclic flows upstream).
 *
 * Assumes unique node IDs (enforced by DiagramSchema). Dangling edges are
 * ignored defensively.
 */
export function topologicalSort(nodes: DiagramNode[], edges: DiagramEdge[]): DiagramNode[] {
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  }
  for (const edge of edges) {
    if (!adjacency.has(edge.from) || !inDegree.has(edge.to)) continue;
    adjacency.get(edge.from)!.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const ready = nodes
    .filter((n) => inDegree.get(n.id) === 0)
    .map((n) => n.id)
    .sort((a, b) => compareIds(a, b));

  const orderedIds: string[] = [];
  const placed = new Set<string>();
  while (ready.length > 0) {
    const id = ready.shift()!;
    orderedIds.push(id);
    placed.add(id);
    for (const neighbor of adjacency.get(id) ?? []) {
      const next = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, next);
      if (next === 0) {
        ready.push(neighbor);
        ready.sort((a, b) => compareIds(a, b));
      }
    }
  }

  // Cycle fallback: append unreachable nodes in ID order (deterministic).
  const remaining = nodes
    .filter((n) => !placed.has(n.id))
    .map((n) => n.id)
    .sort((a, b) => compareIds(a, b));
  orderedIds.push(...remaining);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  return orderedIds.map((id) => byId.get(id)!);
}

/**
 * Finds connected components treating edges as UNDIRECTED (BFS).
 * Deterministic: seeds are visited in sorted-ID order, so components are
 * ordered by their smallest node ID. Assumes unique node IDs; dangling
 * edges are ignored defensively.
 */
export function findConnectedComponents(nodes: DiagramNode[], edges: DiagramEdge[]): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges) {
    if (!adjacency.has(edge.from) || !adjacency.has(edge.to)) continue;
    adjacency.get(edge.from)!.push(edge.to);
    adjacency.get(edge.to)!.push(edge.from);
  }

  const visited = new Set<string>();
  const components: string[][] = [];
  const sortedNodes = [...nodes].sort((a, b) => compareIds(a.id, b.id));

  for (const node of sortedNodes) {
    if (visited.has(node.id)) continue;
    const component: string[] = [];
    const queue = [node.id];
    visited.add(node.id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }
  return components;
}

/**
 * Evenly spaces nodes around a horizontal center (mutates `position.x`).
 * `spacing` is the center-to-center pitch — pass NODE_WIDTH + gap to keep
 * bounding boxes apart. Nodes keep their existing y and array order.
 */
export function distributeHorizontally(
  nodes: LayoutNode[],
  centerX: number,
  spacing: number
): void {
  const totalWidth = (nodes.length - 1) * spacing;
  const startX = centerX - totalWidth / 2;
  nodes.forEach((node, index) => {
    node.position.x = startX + index * spacing;
  });
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Routes to the layout strategy for the diagram type. Handles edge cases:
 * empty input, single node (centered at origin), disconnected subgraphs
 * (laid out separately, stacked vertically with a 300px gap).
 */
export function calculateDiagramLayout(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  type: DiagramType
): LayoutResult {
  if (nodes.length === 0) {
    return { nodes: [], width: 0, height: 0 };
  }

  if (nodes.length === 1) {
    return {
      nodes: [toLayoutNode(nodes[0], 0, 0)],
      width: NODE_WIDTH,
      height: nodeVisualHeight(nodes[0].type),
    };
  }

  const components = findConnectedComponents(nodes, edges);
  if (components.length > 1) {
    return layoutDisconnectedComponents(nodes, edges, components, type);
  }

  switch (type) {
    case 'flow':
      return layoutFlow(nodes, edges);
    case 'relationship':
      return layoutRelationship(nodes, edges);
    case 'architecture':
      return layoutArchitecture(nodes);
    case 'sequence':
      return layoutSequence(nodes, edges);
    default:
      return layoutFlow(nodes, edges);
  }
}

// ─── Flow: left-to-right columns in dependency order ────────────────────────

function layoutFlow(nodes: DiagramNode[], edges: DiagramEdge[]): LayoutResult {
  const scale = nodes.length > 8 ? DENSE_SCALE : 1;
  const columnPitch = NODE_WIDTH + FLOW_COLUMN_GAP * scale;
  const rowPitch = tallestNode(nodes) + FLOW_ROW_GAP * scale;

  const ordered = topologicalSort(nodes, edges);

  // Longest-path depth from any start node → column index. Computed in
  // topological order so every predecessor is finalized before its successors.
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges) {
    if (adjacency.has(edge.from) && adjacency.has(edge.to)) {
      adjacency.get(edge.from)!.push(edge.to);
    }
  }
  const depth = new Map<string, number>(ordered.map((n) => [n.id, 0]));
  for (const node of ordered) {
    for (const neighbor of adjacency.get(node.id) ?? []) {
      depth.set(neighbor, Math.max(depth.get(neighbor) ?? 0, (depth.get(node.id) ?? 0) + 1));
    }
  }

  // Group by column; sort columns by depth and nodes within a column by ID.
  const columns = new Map<number, DiagramNode[]>();
  for (const node of ordered) {
    const col = depth.get(node.id) ?? 0;
    if (!columns.has(col)) columns.set(col, []);
    columns.get(col)!.push(node);
  }
  const sortedColumns = [...columns.entries()].sort((a, b) => a[0] - b[0]);

  const layoutNodes: LayoutNode[] = [];
  for (const [col, columnNodes] of sortedColumns) {
    columnNodes.sort((a, b) => compareIds(a.id, b.id));
    const x = col * columnPitch;
    // Center each column vertically around y = 0 (multiple start/end nodes
    // are distributed vertically automatically).
    const startY = -((columnNodes.length - 1) * rowPitch) / 2;
    columnNodes.forEach((node, row) => {
      layoutNodes.push(toLayoutNode(node, x, startY + row * rowPitch));
    });
  }

  return normalizePositions(layoutNodes);
}

// ─── Relationship: radial, hub at the center ────────────────────────────────

function layoutRelationship(nodes: DiagramNode[], edges: DiagramEdge[]): LayoutResult {
  const scale = nodes.length > 8 ? DENSE_SCALE : 1;
  const degrees = new Map(nodes.map((n) => [n.id, getNodeDegree(n.id, edges)]));
  const byDegreeThenId = (a: DiagramNode, b: DiagramNode): number =>
    (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0) || compareIds(a.id, b.id);

  // Hub: highest degree; ties → smallest ID (deterministic).
  const hub = [...nodes].sort(byDegreeThenId)[0];
  const satellites = nodes.filter((n) => n.id !== hub.id).sort(byDegreeThenId);
  const count = satellites.length;

  // Radius grows with node count so adjacent satellites never overlap.
  // React Flow reads `position` as a box ANCHOR, and two boxes overlap only if
  // they are inside their extents on BOTH axes: |dx| < W and |dy| < H implies
  // chord² = dx²+dy² < 2W², so a chord of at least √2 × the widest node rules
  // overlap out at every angle (the worst case is a pair ~45° apart). A plain
  // NODE_WIDTH + padding chord — as this used to compute — still lets diagonal
  // neighbours collide. The minimum radius also clears the hub.
  const requiredChord =
    Math.ceil(NODE_WIDTH * Math.SQRT2) + RELATIONSHIP_CHORD_PADDING * scale;
  const radius =
    count <= 1
      ? RELATIONSHIP_MIN_RADIUS
      : Math.max(
          RELATIONSHIP_MIN_RADIUS,
          Math.ceil(requiredChord / 2 / Math.sin(Math.PI / count))
        );

  const layoutNodes: LayoutNode[] = [toLayoutNode(hub, 0, 0)];
  satellites.forEach((node, index) => {
    const angle = (2 * Math.PI * index) / count;
    layoutNodes.push(
      toLayoutNode(node, radius * Math.cos(angle), radius * Math.sin(angle))
    );
  });

  return normalizePositions(layoutNodes);
}

// ─── Architecture: vertical layers grouped by type ──────────────────────────

function layoutArchitecture(nodes: DiagramNode[]): LayoutResult {
  const scale = nodes.length > 8 ? DENSE_SCALE : 1;
  const layerPitch = ARCH_LAYER_PITCH * scale;
  const columnPitch = NODE_WIDTH + ARCH_COLUMN_GAP * scale;

  // Fixed layer order (top → bottom). Services share the process layer;
  // storage sits below processes; outputs at the bottom.
  const layers: DiagramNode[][] = [
    nodes.filter((n) => n.type === 'input'),
    nodes.filter((n) => n.type === 'process' || n.type === 'service'),
    nodes.filter((n) => n.type === 'decision'),
    nodes.filter((n) => n.type === 'storage'),
    nodes.filter((n) => n.type === 'output'),
  ];

  const layoutNodes: LayoutNode[] = [];
  let y = 0;
  for (const layer of layers) {
    if (layer.length === 0) continue;
    layer.sort((a, b) => compareIds(a.id, b.id));
    const row = layer.map((node) => toLayoutNode(node, 0, y));
    distributeHorizontally(row, 0, columnPitch);
    layoutNodes.push(...row);
    y += layerPitch;
  }

  return normalizePositions(layoutNodes);
}

// ─── Sequence: vertical timeline with actor lanes ───────────────────────────

function layoutSequence(nodes: DiagramNode[], edges: DiagramEdge[]): LayoutResult {
  const scale = nodes.length > 8 ? DENSE_SCALE : 1;
  const rowPitch =
    (tallestNode(nodes) + (nodes.length === 2 ? TWO_NODE_GAP : SEQUENCE_ROW_GAP)) * scale;
  const lanePitch = NODE_WIDTH + SEQUENCE_LANE_GAP * scale;

  // Temporal order: BFS from the roots — time ALWAYS flows top → bottom,
  // regardless of node type (each node gets its own row).
  const ordered = orderNodesBySequence(nodes, edges);

  // Lanes: actors (process/service) get their own lane, ordered by ID.
  const actors = nodes
    .filter((n) => n.type === 'process' || n.type === 'service')
    .sort((a, b) => compareIds(a.id, b.id));
  const laneOf = new Map<string, number>();
  actors.forEach((actor, index) => laneOf.set(actor.id, index));

  // Non-actor nodes join the lane of their first adjacent already-laned node
  // (edge-array order → deterministic). With no actors at all, everything
  // shares lane 0 (a plain vertical stack).
  for (const node of ordered) {
    if (laneOf.has(node.id)) continue;
    let lane = 0;
    for (const edge of edges) {
      if (edge.from === node.id && laneOf.has(edge.to)) {
        lane = laneOf.get(edge.to)!;
        break;
      }
      if (edge.to === node.id && laneOf.has(edge.from)) {
        lane = laneOf.get(edge.from)!;
        break;
      }
    }
    laneOf.set(node.id, lane);
  }

  const layoutNodes = ordered.map((node, index) =>
    toLayoutNode(node, (laneOf.get(node.id) ?? 0) * lanePitch, index * rowPitch)
  );

  return normalizePositions(layoutNodes);
}

/**
 * BFS temporal ordering for sequence diagrams. Roots (no incoming edges) are
 * seeded in sorted-ID order; children are visited in edge-array order. With
 * no roots (cycle), the smallest-ID node seeds the traversal. Unvisited nodes
 * are appended in ID order — every node appears exactly once.
 */
function orderNodesBySequence(nodes: DiagramNode[], edges: DiagramEdge[]): DiagramNode[] {
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    outEdges.set(node.id, []);
  }
  for (const edge of edges) {
    if (!inDegree.has(edge.to) || !outEdges.has(edge.from)) continue;
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    outEdges.get(edge.from)!.push(edge.to);
  }

  let roots = nodes
    .filter((n) => (inDegree.get(n.id) ?? 0) === 0)
    .map((n) => n.id)
    .sort((a, b) => compareIds(a, b));
  if (roots.length === 0 && nodes.length > 0) {
    roots = [[...nodes].sort((a, b) => compareIds(a.id, b.id))[0].id];
  }

  const orderedIds: string[] = [];
  const visited = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    orderedIds.push(id);
    for (const childId of outEdges.get(id) ?? []) {
      if (!visited.has(childId)) queue.push(childId);
    }
  }
  const leftovers = nodes
    .filter((n) => !visited.has(n.id))
    .map((n) => n.id)
    .sort((a, b) => compareIds(a, b));
  orderedIds.push(...leftovers);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  return orderedIds.map((id) => byId.get(id)!);
}

// ─── Disconnected subgraphs: layout separately, stack vertically ────────────

function layoutDisconnectedComponents(
  allNodes: DiagramNode[],
  edges: DiagramEdge[],
  components: string[][],
  type: DiagramType
): LayoutResult {
  // Components arrive ordered by smallest node ID (findConnectedComponents).
  const allLayoutNodes: LayoutNode[] = [];
  let currentY = 0;

  for (const component of components) {
    const memberIds = new Set(component);
    const componentNodes = allNodes.filter((n) => memberIds.has(n.id));
    const componentEdges = edges.filter((e) => memberIds.has(e.from) && memberIds.has(e.to));

    let result: LayoutResult;
    switch (type) {
      case 'relationship':
        result = layoutRelationship(componentNodes, componentEdges);
        break;
      case 'architecture':
        result = layoutArchitecture(componentNodes);
        break;
      case 'sequence':
        result = layoutSequence(componentNodes, componentEdges);
        break;
      case 'flow':
      default:
        result = layoutFlow(componentNodes, componentEdges);
        break;
    }

    for (const node of result.nodes) {
      allLayoutNodes.push({
        ...node,
        position: { x: node.position.x, y: node.position.y + currentY },
      });
    }
    // result.height already includes NODE_HEIGHT → exactly COMPONENT_GAP of
    // clear space between the bounding boxes of consecutive components.
    currentY += result.height + COMPONENT_GAP;
  }

  return normalizePositions(allLayoutNodes);
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function toLayoutNode(node: DiagramNode, x: number, y: number): LayoutNode {
  return {
    id: node.id,
    label: node.label,
    type: node.type,
    description: node.description,
    color: node.color,
    icon: node.icon,
    position: { x, y },
  };
}

/**
 * Shifts all positions so the bounding box starts at (0, 0), rounds to 2
 * decimals (stable output despite trig floats) and computes overall size.
 */
function normalizePositions(nodes: LayoutNode[]): LayoutResult {
  if (nodes.length === 0) {
    return { nodes: [], width: 0, height: 0 };
  }

  const minX = Math.min(...nodes.map((n) => n.position.x));
  const minY = Math.min(...nodes.map((n) => n.position.y));

  for (const node of nodes) {
    node.position.x = Math.round((node.position.x - minX) * 100) / 100;
    node.position.y = Math.round((node.position.y - minY) * 100) / 100;
  }

  const maxX = Math.max(...nodes.map((n) => n.position.x));
  const maxY = Math.max(...nodes.map((n) => n.position.y));
  const tallest = nodes.reduce(
    (height, node) => Math.max(height, nodeVisualHeight(node.type)),
    NODE_HEIGHT
  );

  return {
    nodes,
    width: maxX + NODE_WIDTH,
    height: maxY + tallest,
  };
}
