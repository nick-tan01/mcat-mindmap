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

// ── Quiz generation-effect utilities ──────────────────────────────────────────

/**
 * Generates the hint scaffold for a concept term.
 * Each word: first letter + underscores for remaining characters.
 * No letter counts. No numbers. No parentheses.
 * Example: "Fundamental Attribution Error" → "F__________ A__________ E____"
 */
export function generateHintScaffold(term: string): string {
  return term
    .split(' ')
    .map(word => word[0] + '_'.repeat(Math.max(0, word.length - 1)))
    .join(' ');
}

/**
 * Strips the concept name from its own definition if it appears there,
 * replacing it with "______" so it doesn't give away the answer.
 */
export function scrubTermFromDefinition(definition: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');
  return definition.replace(regex, '______');
}

/**
 * Fuzzy match for answer evaluation.
 * Returns true if the student's answer is close enough to the correct term.
 * Tolerance: ≤1 for single-word terms, ≤2 for multi-word terms.
 */
export function isAnswerCorrect(input: string, label: string): boolean {
  const a = input.trim().toLowerCase();
  const b = label.trim().toLowerCase();
  if (a === b) return true;
  const tolerance = label.trim().split(' ').length > 1 ? 2 : 1;
  return levenshtein(a, b) <= tolerance;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[a.length][b.length];
}
