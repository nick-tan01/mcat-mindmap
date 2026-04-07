'use client';

import { useState } from 'react';
import { GraphNode } from '@/lib/types';
import { DOMAIN_COLORS } from '@/lib/colors';

interface ConfirmNodesProps {
  newNodes: GraphNode[];
  updatedNodes: Array<{ id: string; updates: Partial<GraphNode> }>;
  onConfirm: (confirmedNodes: GraphNode[]) => void;
  onCancel: () => void;
}

export default function ConfirmNodes({
  newNodes,
  updatedNodes,
  onConfirm,
  onCancel,
}: ConfirmNodesProps) {
  const [nodes, setNodes] = useState<GraphNode[]>(newNodes);
  const [expandedDefs, setExpandedDefs] = useState<Set<string>>(new Set());
  const [showEnrichments, setShowEnrichments] = useState(false);

  const deleteNode = (id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id));
  };

  const updateLabel = (id: string, label: string) => {
    setNodes(prev =>
      prev.map(n => (n.id === id ? { ...n, label, origin: 'user-edited' as const } : n))
    );
  };

  const toggleDef = (id: string) => {
    setExpandedDefs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div
      className="rounded-xl p-6 w-full max-w-2xl mx-auto animate-fade-in"
      style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}
    >
      <h2 className="text-xl font-bold mb-1" style={{ color: '#e8e8f0' }}>
        Review {nodes.length} New Concept{nodes.length !== 1 ? 's' : ''}
      </h2>
      <p className="text-sm mb-4" style={{ color: '#8888a8' }}>
        Delete or rename before mapping relationships.
      </p>

      <div className="flex flex-col gap-2 mb-4 max-h-80 overflow-y-auto pr-1">
        {nodes.length === 0 && (
          <p className="text-sm italic" style={{ color: '#8888a8' }}>
            All concepts deleted. Nothing to add.
          </p>
        )}
        {nodes.map(node => (
          <div
            key={node.id}
            className="rounded-lg p-3"
            style={{ background: '#0f0f13', border: '1px solid #2a2a38' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <input
                className="flex-1 text-sm font-medium bg-transparent border-b outline-none"
                style={{ color: '#e8e8f0', borderColor: '#2a2a38' }}
                value={node.label}
                onChange={e => updateLabel(node.id, e.target.value)}
              />
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: DOMAIN_COLORS[node.domain] + '30',
                  color: DOMAIN_COLORS[node.domain],
                }}
              >
                {node.domain}
              </span>
              <button
                onClick={() => toggleDef(node.id)}
                className="text-xs hover:opacity-80"
                style={{ color: '#8888a8' }}
              >
                {expandedDefs.has(node.id) ? '▲' : '▼'}
              </button>
              <button
                onClick={() => deleteNode(node.id)}
                className="text-sm hover:opacity-80"
                style={{ color: '#ef4444' }}
              >
                ×
              </button>
            </div>
            {expandedDefs.has(node.id) && (
              <p className="text-xs mt-2" style={{ color: '#8888a8' }}>
                {node.definition}
              </p>
            )}
          </div>
        ))}
      </div>

      {updatedNodes.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowEnrichments(v => !v)}
            className="text-sm hover:opacity-80"
            style={{ color: '#8888a8' }}
          >
            {showEnrichments ? '▲' : '▼'} Also enriching {updatedNodes.length} existing concept
            {updatedNodes.length !== 1 ? 's' : ''}
          </button>
          {showEnrichments && (
            <div className="mt-2 text-xs pl-2" style={{ color: '#8888a8' }}>
              {updatedNodes.map(u => (
                <div key={u.id} className="mb-1">
                  <span style={{ color: '#e8e8f0' }}>{u.id}</span>:{' '}
                  {Object.keys(u.updates).join(', ')} updated
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <button
          onClick={onCancel}
          className="text-sm hover:opacity-80"
          style={{ color: '#8888a8' }}
        >
          Cancel
        </button>
        <button
          onClick={() => onConfirm(nodes)}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: '#6366f1', color: '#fff' }}
          disabled={nodes.length === 0}
        >
          Confirm &amp; Map Relationships
        </button>
      </div>
    </div>
  );
}
