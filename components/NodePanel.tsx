'use client';

import { GraphNode, GraphEdge } from '@/lib/types';
import { DOMAIN_COLORS } from '@/lib/colors';
import { getNeighborId } from '@/lib/graphUtils';

interface NodePanelProps {
  node: GraphNode | null;
  relatedEdges: GraphEdge[];
  allNodes: GraphNode[];
  onClose: () => void;
  onNodeJump: (nodeId: string) => void;
  onStudyCard: (nodeId: string) => void;
}

const EDGE_TYPE_LABELS: Record<string, string> = {
  contrasts_with: 'contrasts with',
  is_a_type_of: 'is a type of',
  commonly_confused_with: 'commonly confused with',
  mechanism_overlap: 'mechanism overlap',
  real_world_example_of: 'real world example of',
  causes: 'causes',
  part_of: 'part of',
};

const EDGE_TYPE_COLORS: Record<string, string> = {
  contrasts_with: '#ef4444',
  is_a_type_of: '#6366f1',
  commonly_confused_with: '#f59e0b',
  mechanism_overlap: '#8b5cf6',
  real_world_example_of: '#10b981',
  causes: '#06b6d4',
  part_of: '#64748b',
};

const MASTERY_LABELS: Record<string, string> = {
  unreviewed: 'Unreviewed',
  learning: 'Learning',
  reviewing: 'Reviewing',
  mastered: 'Mastered',
};

const MASTERY_COLORS: Record<string, string> = {
  unreviewed: '#8888a8',
  learning: '#ef4444',
  reviewing: '#f59e0b',
  mastered: '#10b981',
};

export default function NodePanel({
  node,
  relatedEdges,
  allNodes,
  onClose,
  onNodeJump,
  onStudyCard,
}: NodePanelProps) {
  if (!node) return null;

  const nodeMap = new Map(allNodes.map(n => [n.id, n]));
  const confusedEdges = relatedEdges.filter(e => e.type === 'commonly_confused_with');
  const confidence = Math.round(node.ai_confidence * 100);

  const lastReviewed = node.quiz.lastReviewDate
    ? new Date(node.quiz.lastReviewDate).toLocaleDateString()
    : 'Never';

  return (
    <div
      className="fixed right-0 top-14 h-[calc(100vh-56px)] flex flex-col overflow-y-auto"
      style={{
        width: 320,
        background: '#1a1a24',
        borderLeft: '1px solid #2a2a38',
        zIndex: 20,
      }}
    >
      {/* Header */}
      <div
        className="flex items-start justify-between p-4 sticky top-0"
        style={{ background: '#1a1a24', borderBottom: '1px solid #2a2a38' }}
      >
        <div>
          <h2
            className="text-lg font-bold leading-tight"
            style={{ color: DOMAIN_COLORS[node.domain] }}
          >
            {node.label}
          </h2>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block"
            style={{
              background: DOMAIN_COLORS[node.domain] + '25',
              color: DOMAIN_COLORS[node.domain],
            }}
          >
            {node.domain}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-xl hover:opacity-80 ml-2 mt-0.5"
          style={{ color: '#8888a8' }}
        >
          ×
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Confidence */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium" style={{ color: '#8888a8' }}>
              AI Confidence
            </span>
            <span className="text-xs" style={{ color: '#8888a8' }}>
              {confidence}%
            </span>
          </div>
          <div
            className="w-full rounded-full h-1.5"
            style={{ background: '#2a2a38' }}
          >
            <div
              className="h-1.5 rounded-full"
              style={{ width: `${confidence}%`, background: '#6366f1' }}
            />
          </div>
        </div>

        {/* Definition */}
        <div>
          <div className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: '#8888a8' }}>
            Definition
          </div>
          <p className="text-sm leading-relaxed" style={{ color: '#e8e8f0' }}>
            {node.definition}
          </p>
        </div>

        {/* Source Snippet */}
        {node.sourceSnippet && (
          <div>
            <div className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: '#8888a8' }}>
              Source
            </div>
            <p className="text-xs italic" style={{ color: '#8888a8' }}>
              &ldquo;{node.sourceSnippet}&rdquo;
            </p>
          </div>
        )}

        {/* Commonly Confused Warning */}
        {confusedEdges.length > 0 && (
          <div
            className="rounded-lg p-3 text-sm"
            style={{ background: '#f59e0b20', border: '1px solid #f59e0b50' }}
          >
            <div className="font-semibold mb-1" style={{ color: '#f59e0b' }}>
              ⚠ Commonly Confused With
            </div>
            {confusedEdges.map(e => {
              const neighborId = getNeighborId(e, node.id);
              const neighbor = nodeMap.get(neighborId);
              return (
                <button
                  key={e.id}
                  onClick={() => onNodeJump(neighborId)}
                  className="block text-left hover:opacity-80"
                  style={{ color: '#f59e0b' }}
                >
                  {neighbor?.label || neighborId}
                </button>
              );
            })}
          </div>
        )}

        {/* Relationships */}
        {relatedEdges.length > 0 && (
          <div>
            <div className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#8888a8' }}>
              Relationships ({relatedEdges.length})
            </div>
            <div className="flex flex-col gap-1.5">
              {relatedEdges.map(edge => {
                const neighborId = getNeighborId(edge, node.id);
                const neighbor = nodeMap.get(neighborId);
                const color = EDGE_TYPE_COLORS[edge.type] || '#8888a8';
                return (
                  <div key={edge.id} className="flex items-center gap-2 text-sm">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded font-medium shrink-0"
                      style={{ background: color + '25', color }}
                    >
                      {EDGE_TYPE_LABELS[edge.type] || edge.type}
                    </span>
                    <button
                      onClick={() => onNodeJump(neighborId)}
                      className="hover:opacity-80 text-left truncate"
                      style={{ color: '#e8e8f0' }}
                    >
                      {neighbor?.label || neighborId}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Mastery */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#8888a8' }}>
              Mastery
            </div>
            <span
              className="text-sm font-medium"
              style={{ color: MASTERY_COLORS[node.mastery] }}
            >
              {MASTERY_LABELS[node.mastery]}
            </span>
          </div>
          <div className="text-right">
            <div className="text-xs" style={{ color: '#8888a8' }}>Last reviewed</div>
            <div className="text-xs" style={{ color: '#e8e8f0' }}>{lastReviewed}</div>
          </div>
        </div>

        {/* Study button */}
        <button
          onClick={() => onStudyCard(node.id)}
          className="w-full py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: '#6366f1', color: '#fff' }}
        >
          Study this card
        </button>
      </div>
    </div>
  );
}
