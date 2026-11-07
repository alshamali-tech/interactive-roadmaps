/**
 * Auto-layout algorithms for different diagram types
 * Positions nodes automatically since AI-generated diagrams don't include coordinates
 */

import type { DiagramNode, DiagramEdge, DiagramType } from '@/engine/generatorSchema';

export interface LayoutNode {
  id: string;
  label: string;
  type: DiagramNode['type'];
  description?: string;
  position: { x: number; y: number };
}

export interface LayoutResult {
  nodes: LayoutNode[];
  width: number;
  height: number;
}

// Spacing constants
const HORIZONTAL_GAP = 150;
const VERTICAL_GAP = 100;
const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;

/**
 * Main layout function — routes to appropriate algorithm based on diagram type
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
      nodes: [{ id: nodes[0].id, label: nodes[0].label, type: nodes[0].type, description: nodes[0].description, position: { x: 0, y: 0 } }],
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  }

  // Find connected components (handle disconnected subgraphs)
  const components = findConnectedComponents(nodes, edges);

  if (components.length === 1) {
    switch (type) {
      case 'flow':
        return layoutFlow(nodes, edges);
      case 'relationship':
        return layoutRelationship(nodes, edges);
      case 'architecture':
        return layoutArchitecture(nodes, edges);
      case 'sequence':
        return layoutSequence(nodes, edges);
      default:
        return layoutFlow(nodes, edges);
    }
  }

  // Multiple disconnected components — layout each separately and stack vertically
  return layoutDisconnectedComponents(nodes, edges, components, type);
}

/**
 * Flow diagram layout: Left-to-right horizontal using topological sort
 */
function layoutFlow(nodes: DiagramNode[], edges: DiagramEdge[]): LayoutResult {
  // Build adjacency list and in-degree map
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  nodes.forEach((node) => {
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  });

  edges.forEach((edge) => {
    adjacency.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  });

  // Topological sort using Kahn's algorithm
  const sorted: string[] = [];
  const queue: string[] = [];

  // Find all nodes with in-degree 0 (start nodes)
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) {
      queue.push(nodeId);
    }
  });

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    adjacency.get(current)?.forEach((neighbor) => {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    });
  }

  // If topological sort didn't include all nodes (cycles), add remaining nodes
  if (sorted.length < nodes.length) {
    const remaining = nodes.filter((n) => !sorted.includes(n.id));
    remaining.forEach((n) => sorted.push(n.id));
  }

  // Calculate depth (column) for each node using longest path from start
  const depth = new Map<string, number>();
  sorted.forEach((nodeId) => {
    depth.set(nodeId, 0);
  });

  sorted.forEach((nodeId) => {
    adjacency.get(nodeId)?.forEach((neighbor) => {
      const currentDepth = depth.get(neighbor) || 0;
      const newDepth = (depth.get(nodeId) || 0) + 1;
      depth.set(neighbor, Math.max(currentDepth, newDepth));
    });
  });

  // Group nodes by column
  const columns = new Map<number, string[]>();
  depth.forEach((d, nodeId) => {
    if (!columns.has(d)) {
      columns.set(d, []);
    }
    columns.get(d)!.push(nodeId);
  });

  // Sort columns by depth for deterministic output
  const sortedColumns = Array.from(columns.entries()).sort((a, b) => a[0] - b[0]);

  // Calculate positions
  const layoutNodes: LayoutNode[] = [];

  sortedColumns.forEach(([col, columnNodes]) => {
    // Sort node IDs within column for deterministic output
    columnNodes.sort();
    const x = col * (NODE_WIDTH + HORIZONTAL_GAP);

    // Center nodes vertically in each column
    const totalHeight = columnNodes.length * NODE_HEIGHT + (columnNodes.length - 1) * VERTICAL_GAP;
    const startY = -totalHeight / 2;

    columnNodes.forEach((nodeId, row) => {
      const y = startY + row * (NODE_HEIGHT + VERTICAL_GAP);
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        layoutNodes.push({
          id: node.id,
          label: node.label,
          type: node.type,
          description: node.description,
          position: { x, y },
        });
      }
    });
  });

  return normalizePositions(layoutNodes);
}

/**
 * Relationship diagram layout: Radial layout with most-connected node in center
 */
function layoutRelationship(nodes: DiagramNode[], edges: DiagramEdge[]): LayoutResult {
  // Count connections for each node
  const connections = new Map<string, number>();
  nodes.forEach((node) => connections.set(node.id, 0));

  edges.forEach((edge) => {
    connections.set(edge.from, (connections.get(edge.from) || 0) + 1);
    connections.set(edge.to, (connections.get(edge.to) || 0) + 1);
  });

  // Find the most connected node (use first node as tiebreaker for determinism)
  let centerNode = nodes[0].id;
  let maxConnections = 0;
  nodes.forEach((node) => {
    const count = connections.get(node.id) || 0;
    if (count > maxConnections) {
      maxConnections = count;
      centerNode = node.id;
    }
  });

  const layoutNodes: LayoutNode[] = [];
  const centerNodeData = nodes.find((n) => n.id === centerNode);
  if (centerNodeData) {
    layoutNodes.push({
      id: centerNodeData.id,
      label: centerNodeData.label,
      type: centerNodeData.type,
      description: centerNodeData.description,
      position: { x: 0, y: 0 },
    });
  }

  // Place other nodes in a circle around center
  const otherNodes = nodes.filter((n) => n.id !== centerNode);
  // Sort for deterministic output
  otherNodes.sort((a, b) => a.id.localeCompare(b.id));
  const radius = 200;

  otherNodes.forEach((node, index) => {
    const angle = (2 * Math.PI * index) / otherNodes.length;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    layoutNodes.push({
      id: node.id,
      label: node.label,
      type: node.type,
      description: node.description,
      position: { x, y },
    });
  });

  return normalizePositions(layoutNodes);
}

/**
 * Architecture diagram layout: Layered vertical with grouping by type
 */
function layoutArchitecture(nodes: DiagramNode[], _edges: DiagramEdge[]): LayoutResult {
  // Group nodes by type
  const layers = {
    inputs: nodes.filter((n) => n.type === 'input'),
    processes: nodes.filter((n) => n.type === 'process' || n.type === 'service' || n.type === 'storage'),
    decisions: nodes.filter((n) => n.type === 'decision'),
    outputs: nodes.filter((n) => n.type === 'output'),
  };

  // Order layers top to bottom
  const orderedLayers = [layers.inputs, layers.processes, layers.decisions, layers.outputs];

  const layoutNodes: LayoutNode[] = [];
  let y = 0;

  orderedLayers.forEach((layer) => {
    if (layer.length === 0) return;

    // Sort nodes within layer for deterministic output
    layer.sort((a, b) => a.id.localeCompare(b.id));

    // Center nodes horizontally in each layer
    const layerWidth = layer.length * NODE_WIDTH + (layer.length - 1) * HORIZONTAL_GAP;
    const startX = -layerWidth / 2 + NODE_WIDTH / 2;

    layer.forEach((node, index) => {
      const x = startX + index * (NODE_WIDTH + HORIZONTAL_GAP);
      layoutNodes.push({
        id: node.id,
        label: node.label,
        type: node.type,
        description: node.description,
        position: { x, y },
      });
    });

    y += NODE_HEIGHT + VERTICAL_GAP;
  });

  // Handle any remaining nodes (e.g., unknown types)
  const assignedIds = new Set(layoutNodes.map((n) => n.id));
  const remainingNodes = nodes.filter((n) => !assignedIds.has(n.id));
  if (remainingNodes.length > 0) {
    remainingNodes.sort((a, b) => a.id.localeCompare(b.id));
    const layerWidth = remainingNodes.length * NODE_WIDTH + (remainingNodes.length - 1) * HORIZONTAL_GAP;
    const startX = -layerWidth / 2 + NODE_WIDTH / 2;

    remainingNodes.forEach((node, index) => {
      const x = startX + index * (NODE_WIDTH + HORIZONTAL_GAP);
      layoutNodes.push({
        id: node.id,
        label: node.label,
        type: node.type,
        description: node.description,
        position: { x, y },
      });
    });
  }

  return normalizePositions(layoutNodes);
}

/**
 * Sequence diagram layout: Vertical timeline with horizontal lanes for actors
 */
function layoutSequence(nodes: DiagramNode[], edges: DiagramEdge[]): LayoutResult {
  // Identify "actors" (process or service nodes) and "messages" (other types)
  const actors = nodes.filter((n) => n.type === 'process' || n.type === 'service');
  const messages = nodes.filter((n) => n.type !== 'process' && n.type !== 'service');

  // If no clear actors, treat all nodes as sequential steps (top to bottom)
  if (actors.length === 0) {
    const layoutNodes: LayoutNode[] = [];
    let y = 0;

    // Sort by first appearance in edges for temporal order
    const orderedNodes = orderNodesBySequence(nodes, edges);

    orderedNodes.forEach((node) => {
      layoutNodes.push({
        id: node.id,
        label: node.label,
        type: node.type,
        description: node.description,
        position: { x: 0, y },
      });
      y += NODE_HEIGHT + VERTICAL_GAP;
    });

    return normalizePositions(layoutNodes);
  }

  // Create horizontal lanes for actors
  const laneWidth = NODE_WIDTH + HORIZONTAL_GAP * 2;
  const layoutNodes: LayoutNode[] = [];

  // Sort actors for deterministic lane assignment
  const sortedActors = [...actors].sort((a, b) => a.id.localeCompare(b.id));

  // Place actors at the top in horizontal lanes
  sortedActors.forEach((actor, index) => {
    const x = index * laneWidth;
    layoutNodes.push({
      id: actor.id,
      label: actor.label,
      type: actor.type,
      description: actor.description,
      position: { x, y: 0 },
    });
  });

  // Place messages vertically below actors
  let y = NODE_HEIGHT + VERTICAL_GAP * 2;

  // Sort messages for deterministic placement
  const sortedMessages = [...messages].sort((a, b) => a.id.localeCompare(b.id));

  sortedMessages.forEach((message) => {
    // Find which actor this message connects to
    const connectedEdge = edges.find((e) => e.from === message.id || e.to === message.id);
    let laneIndex = 0;

    if (connectedEdge) {
      const actorId = connectedEdge.from === message.id ? connectedEdge.to : connectedEdge.from;
      laneIndex = sortedActors.findIndex((a) => a.id === actorId);
      if (laneIndex === -1) laneIndex = 0;
    }

    const x = laneIndex * laneWidth;
    layoutNodes.push({
      id: message.id,
      label: message.label,
      type: message.type,
      description: message.description,
      position: { x, y },
    });
    y += NODE_HEIGHT + VERTICAL_GAP;
  });

  return normalizePositions(layoutNodes);
}

/**
 * Handle disconnected components by laying out each separately and stacking vertically
 */
function layoutDisconnectedComponents(
  allNodes: DiagramNode[],
  edges: DiagramEdge[],
  components: string[][],
  type: DiagramType
): LayoutResult {
  const allLayoutNodes: LayoutNode[] = [];
  let currentY = 0;

  // Sort components by the first node ID for deterministic ordering
  components.sort((a, b) => a[0].localeCompare(b[0]));

  components.forEach((component) => {
    const componentNodes = allNodes.filter((n) => component.includes(n.id));
    const componentEdges = edges.filter(
      (e) => component.includes(e.from) && component.includes(e.to)
    );

    let result: LayoutResult;
    switch (type) {
      case 'flow':
        result = layoutFlow(componentNodes, componentEdges);
        break;
      case 'relationship':
        result = layoutRelationship(componentNodes, componentEdges);
        break;
      case 'architecture':
        result = layoutArchitecture(componentNodes, componentEdges);
        break;
      case 'sequence':
        result = layoutSequence(componentNodes, componentEdges);
        break;
      default:
        result = layoutFlow(componentNodes, componentEdges);
    }

    // Offset this component vertically
    result.nodes.forEach((node) => {
      allLayoutNodes.push({
        ...node,
        position: { x: node.position.x, y: node.position.y + currentY },
      });
    });

    currentY += result.height + VERTICAL_GAP * 2;
  });

  return normalizePositions(allLayoutNodes);
}

/**
 * Order nodes by their sequence in the graph (topological sort for sequence diagrams)
 */
function orderNodesBySequence(nodes: DiagramNode[], edges: DiagramEdge[]): DiagramNode[] {
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();

  nodes.forEach((n) => {
    inDegree.set(n.id, 0);
    outEdges.set(n.id, []);
  });

  edges.forEach((e) => {
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
    outEdges.get(e.from)?.push(e.to);
  });

  // Find root nodes (no incoming edges)
  const roots = nodes.filter((n) => (inDegree.get(n.id) || 0) === 0);
  if (roots.length === 0 && nodes.length > 0) {
    roots.push(nodes[0]);
  }

  // BFS to get order
  const ordered: string[] = [];
  const visited = new Set<string>();
  const queue = roots.map((r) => r.id);

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    ordered.push(id);

    outEdges.get(id)?.forEach((childId) => {
      if (!visited.has(childId)) {
        queue.push(childId);
      }
    });
  }

  // Add any remaining unvisited nodes
  nodes.forEach((n) => {
    if (!visited.has(n.id)) {
      ordered.push(n.id);
    }
  });

  return ordered.map((id) => nodes.find((n) => n.id === id)!);
}

/**
 * Find connected components in the graph using BFS (treats edges as undirected)
 */
function findConnectedComponents(nodes: DiagramNode[], edges: DiagramEdge[]): string[][] {
  const adjacency = new Map<string, string[]>();
  nodes.forEach((node) => adjacency.set(node.id, []));

  // Build undirected adjacency
  edges.forEach((edge) => {
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  });

  const visited = new Set<string>();
  const components: string[][] = [];

  // Process nodes in sorted order for deterministic output
  const sortedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));

  sortedNodes.forEach((node) => {
    if (!visited.has(node.id)) {
      const component: string[] = [];
      const queue = [node.id];
      visited.add(node.id);

      while (queue.length > 0) {
        const current = queue.shift()!;
        component.push(current);

        adjacency.get(current)?.forEach((neighbor) => {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        });
      }

      components.push(component);
    }
  });

  return components;
}

/**
 * Normalize positions so all coordinates are positive (min at 0,0)
 * and compute the bounding box dimensions
 */
function normalizePositions(nodes: LayoutNode[]): LayoutResult {
  if (nodes.length === 0) {
    return { nodes: [], width: 0, height: 0 };
  }

  const minX = Math.min(...nodes.map((n) => n.position.x));
  const minY = Math.min(...nodes.map((n) => n.position.y));

  nodes.forEach((node) => {
    node.position.x -= minX;
    node.position.y -= minY;
  });

  const maxX = Math.max(...nodes.map((n) => n.position.x));
  const maxY = Math.max(...nodes.map((n) => n.position.y));

  return {
    nodes,
    width: maxX + NODE_WIDTH,
    height: maxY + NODE_HEIGHT,
  };
}
