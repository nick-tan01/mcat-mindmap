import { GraphNode, GraphEdge } from './types';

export function getHighestNodeId(nodes: GraphNode[]): number {
  if (nodes.length === 0) return 0;
  const nums = nodes
    .map(n => parseInt(n.id.replace('node_', ''), 10))
    .filter(n => !isNaN(n));
  return nums.length > 0 ? Math.max(...nums) : 0;
}

export function getHighestEdgeId(edges: GraphEdge[]): number {
  if (edges.length === 0) return 0;
  const nums = edges
    .map(e => parseInt(e.id.replace('edge_', ''), 10))
    .filter(n => !isNaN(n));
  return nums.length > 0 ? Math.max(...nums) : 0;
}

export function getRelatedEdges(nodeId: string, edges: GraphEdge[]): GraphEdge[] {
  return edges.filter(e => {
    const src = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id;
    const tgt = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id;
    return src === nodeId || tgt === nodeId;
  });
}

export function getNeighborId(edge: GraphEdge, nodeId: string): string {
  const src = typeof edge.source === 'string' ? edge.source : (edge.source as GraphNode).id;
  const tgt = typeof edge.target === 'string' ? edge.target : (edge.target as GraphNode).id;
  return src === nodeId ? tgt : src;
}

export function truncateLabel(label: string, maxLen = 18): string {
  if (label.length <= maxLen) return label;
  return label.slice(0, maxLen - 1) + '…';
}
