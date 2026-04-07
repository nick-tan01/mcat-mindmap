'use client';

import { useState } from 'react';
import { GraphNode, ParsePhase, ParseDelta } from '@/lib/types';
import ConfirmNodes from './ConfirmNodes';

interface InputPanelProps {
  existingNodes: GraphNode[];
  onParseComplete: (delta: ParseDelta) => void;
  parsePhase: ParsePhase;
  isFirstParse: boolean;
  onClose?: () => void;
}

export default function InputPanel({
  existingNodes,
  onParseComplete,
  parsePhase,
  isFirstParse,
  onClose,
}: InputPanelProps) {
  const [text, setText] = useState('');
  const [localPhase, setLocalPhase] = useState<ParsePhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pendingNewNodes, setPendingNewNodes] = useState<GraphNode[]>([]);
  const [pendingUpdatedNodes, setPendingUpdatedNodes] = useState<
    Array<{ id: string; updates: Partial<GraphNode> }>
  >([]);

  const isLoading = localPhase === 'parsing-nodes' || localPhase === 'parsing-edges';

  const handleSubmit = async () => {
    if (text.trim().length < 20) {
      setError('Please enter at least 20 characters of study text.');
      return;
    }
    setError(null);
    setLocalPhase('parsing-nodes');

    try {
      const res = await fetch('/api/parse-nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          existingNodes: existingNodes.map(n => ({
            id: n.id,
            label: n.label,
            aliases: n.aliases,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const { newNodes, updatedNodes } = await res.json();

      if (!newNodes || newNodes.length === 0) {
        setLocalPhase('idle');
        setError('No new concepts found in this text. Try pasting different content.');
        return;
      }

      setPendingNewNodes(newNodes);
      setPendingUpdatedNodes(updatedNodes || []);
      setLocalPhase('confirm-nodes');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setLocalPhase('idle');
    }
  };

  const handleConfirm = async (confirmedNodes: GraphNode[]) => {
    setLocalPhase('parsing-edges');
    setError(null);

    const allNodes = [
      ...existingNodes.map(n => ({
        id: n.id,
        label: n.label,
        definition: n.definition,
        domain: n.domain,
      })),
      ...confirmedNodes.map(n => ({
        id: n.id,
        label: n.label,
        definition: n.definition,
        domain: n.domain,
      })),
    ];

    try {
      const res = await fetch('/api/parse-edges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allNodes,
          existingEdges: [],
          focusNodeIds: confirmedNodes.map(n => n.id),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const { newEdges } = await res.json();

      setLocalPhase('complete');
      onParseComplete({
        newNodes: confirmedNodes,
        updatedNodes: pendingUpdatedNodes,
        newEdges: newEdges || [],
      });
      setText('');
      setLocalPhase('idle');
      if (onClose) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to map relationships. Try again.');
      setLocalPhase('confirm-nodes');
    }
  };

  const handleCancel = () => {
    setPendingNewNodes([]);
    setPendingUpdatedNodes([]);
    setLocalPhase('idle');
  };

  if (localPhase === 'confirm-nodes') {
    return (
      <ConfirmNodes
        newNodes={pendingNewNodes}
        updatedNodes={pendingUpdatedNodes}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <div
      className="rounded-xl p-6 w-full"
      style={{
        background: '#1a1a24',
        border: '1px solid #2a2a38',
        maxWidth: isFirstParse ? '640px' : '600px',
      }}
    >
      {isFirstParse ? (
        <div className="mb-4 text-center">
          <h1 className="text-2xl font-bold mb-1" style={{ color: '#e8e8f0' }}>
            MCAT MindMap
          </h1>
          <p className="text-sm" style={{ color: '#8888a8' }}>
            Paste study notes below. AI will extract concepts and build an interactive knowledge graph.
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold" style={{ color: '#e8e8f0' }}>
            Add Content to Map
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-lg hover:opacity-80"
              style={{ color: '#8888a8' }}
            >
              ×
            </button>
          )}
        </div>
      )}

      <div className="relative">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste your MCAT study notes, definitions, or any text here. The AI will extract concepts automatically."
          className="w-full rounded-lg p-3 text-sm resize-none outline-none"
          style={{
            minHeight: 180,
            background: '#0f0f13',
            border: '1px solid #2a2a38',
            color: '#e8e8f0',
          }}
          disabled={isLoading}
        />
        <span
          className="absolute bottom-2 right-3 text-xs"
          style={{ color: '#8888a8' }}
        >
          {text.length} chars
        </span>
      </div>

      {error && (
        <div className="mt-2 text-sm" style={{ color: '#ef4444' }}>
          {error}{' '}
          <button
            onClick={() => setError(null)}
            className="underline hover:opacity-80"
          >
            Try again
          </button>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={isLoading || text.trim().length < 20}
        className="mt-4 w-full py-2.5 rounded-lg font-semibold text-sm transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: '#6366f1', color: '#fff' }}
      >
        {localPhase === 'parsing-nodes' && (
          <>
            <Spinner />
            Extracting concepts...
          </>
        )}
        {localPhase === 'parsing-edges' && (
          <>
            <Spinner />
            Mapping relationships...
          </>
        )}
        {localPhase === 'idle' && (isFirstParse ? 'Build Mind Map' : 'Add to Map')}
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
