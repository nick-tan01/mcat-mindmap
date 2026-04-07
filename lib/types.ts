// ─── Domains ──────────────────────────────────────────────────────────────────

export type MCATDomain =
  | 'Social Psychology'
  | 'Cognition'
  | 'Biology'
  | 'Biochemistry'
  | 'Behavioral Science'
  | 'Sociology'
  | 'Research Methods'
  | 'Other';

// ─── Node ─────────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;                        // e.g. "node_001" — unique, stable, never reassigned
  label: string;                     // Concept name, e.g. "Fundamental Attribution Error"
  definition: string;                // Full definition (1–3 sentences)
  domain: MCATDomain;
  aliases: string[];                 // Alt names, abbreviations, common misspellings
  sourceSnippet: string;             // Verbatim excerpt from source text (max 150 chars)
  origin: 'ai-generated' | 'user-edited';
  ai_confidence: number;             // 0.0–1.0, set at parse time, NEVER mutated afterward
  mastery: 'unreviewed' | 'learning' | 'reviewing' | 'mastered';
  quiz: SM2State;                    // SM-2 scheduling data
  // D3 simulation positions — assigned by D3, NOT stored in localStorage
  x?: number;
  y?: number;
  fx?: number | null;                // Fixed x (when user drags a node)
  fy?: number | null;                // Fixed y (when user drags a node)
}

// ─── Edge ─────────────────────────────────────────────────────────────────────

export type EdgeType =
  | 'contrasts_with'
  | 'is_a_type_of'
  | 'commonly_confused_with'
  | 'mechanism_overlap'
  | 'real_world_example_of'
  | 'causes'
  | 'part_of';

export interface GraphEdge {
  id: string;                        // e.g. "edge_001"
  source: string;                    // Node id
  target: string;                    // Node id
  type: EdgeType;
  label: string;                     // Human-readable label: "contrasts with"
  origin: 'ai-generated' | 'user-edited';
}

// ─── Graph (root data structure) ─────────────────────────────────────────────

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  createdAt: string;                 // ISO timestamp
  lastModifiedAt: string;            // ISO timestamp
}

// ─── SM-2 ─────────────────────────────────────────────────────────────────────

export interface SM2State {
  easinessFactor: number;            // EF, starts at 2.5
  interval: number;                  // Days until next review, starts at 1
  repetitions: number;               // Consecutive correct recalls
  nextReviewDate: string | null;     // ISO date string, null = not yet reviewed
  lastReviewDate: string | null;
}

// ─── App-level types ──────────────────────────────────────────────────────────

export type AppView = 'map' | 'flashcards' | 'quiz';

export type ParsePhase =
  | 'idle'
  | 'parsing-nodes'
  | 'confirm-nodes'
  | 'parsing-edges'
  | 'complete';

export interface ParseDelta {
  newNodes: GraphNode[];
  updatedNodes: Array<{ id: string; updates: Partial<GraphNode> }>;
  newEdges: GraphEdge[];
}
