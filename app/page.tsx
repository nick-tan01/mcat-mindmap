'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { GraphData, GraphNode, AppView, ParsePhase, ParseDelta, SM2State } from '@/lib/types';
import { saveGraph, loadGraph, exportGraphJSON, importGraphJSON } from '@/lib/storage';
import InputPanel from '@/components/InputPanel';
import NodePanel from '@/components/NodePanel';
import SearchBar from '@/components/SearchBar';
import FlashcardMode from '@/components/FlashcardMode';
import QuizMode from '@/components/QuizMode';
import { getRelatedEdges } from '@/lib/graphUtils';

// D3 requires client-side only
const MindMap = dynamic(() => import('@/components/MindMap'), { ssr: false });

export default function Home() {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [view, setView] = useState<AppView>('map');
  const [parsePhase, setParsePhase] = useState<ParsePhase>('idle');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);
  const [centerOnNodeId, setCenterOnNodeId] = useState<string | null>(null);
  const [showInputPanel, setShowInputPanel] = useState(true);
  const [flashcardInitId, setFlashcardInitId] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  // Load on mount
  useEffect(() => {
    const saved = loadGraph();
    if (saved) {
      setGraph(saved);
      setShowInputPanel(false);
    }
  }, []);

  // Auto-save debounced
  useEffect(() => {
    if (!graph) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        saveGraph(graph);
      } catch (e) {
        if (e instanceof Error && e.message === 'QUOTA_EXCEEDED') {
          setStorageError(true);
        }
      }
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [graph]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const applyDelta = useCallback((delta: ParseDelta) => {
    setGraph(prev => {
      if (!prev) {
        return {
          nodes: delta.newNodes,
          edges: delta.newEdges,
          createdAt: new Date().toISOString(),
          lastModifiedAt: new Date().toISOString(),
        };
      }
      const updatedNodes = prev.nodes.map(n => {
        const update = delta.updatedNodes.find(u => u.id === n.id);
        return update ? { ...n, ...update.updates } : n;
      });
      return {
        nodes: [...updatedNodes, ...delta.newNodes],
        edges: [...prev.edges, ...delta.newEdges],
        createdAt: prev.createdAt,
        lastModifiedAt: new Date().toISOString(),
      };
    });
    setParsePhase('complete');
    setShowInputPanel(false);
    if (delta.newNodes.length === 0) {
      showToast('No new concepts found in this text.');
    }
  }, [showToast]);

  const updateNodeMastery = useCallback(
    (nodeId: string, newSM2: SM2State, newMastery: GraphNode['mastery']) => {
      setGraph(prev => {
        if (!prev) return null;
        return {
          ...prev,
          nodes: prev.nodes.map(n =>
            n.id === nodeId ? { ...n, quiz: newSM2, mastery: newMastery } : n
          ),
          lastModifiedAt: new Date().toISOString(),
        };
      });
    },
    []
  );

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(prev => (prev === nodeId ? null : nodeId));
    setCenterOnNodeId(nodeId);
    setTimeout(() => setCenterOnNodeId(null), 800);
  }, []);

  const handleNodeJump = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setCenterOnNodeId(nodeId);
    setTimeout(() => setCenterOnNodeId(null), 800);
  }, []);

  const handleSearchSelect = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setCenterOnNodeId(nodeId);
    setTimeout(() => setCenterOnNodeId(null), 800);
  }, []);

  const handleExport = () => {
    if (graph) exportGraphJSON(graph);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importGraphJSON(file);
      setGraph(imported);
      setShowInputPanel(false);
      showToast('Map imported successfully!');
    } catch {
      showToast('Failed to import: invalid JSON file.');
    }
    e.target.value = '';
  };

  const handleStudyCard = useCallback((nodeId: string) => {
    setFlashcardInitId(nodeId);
    setView('flashcards');
  }, []);

  const selectedNode = graph?.nodes.find(n => n.id === selectedNodeId) ?? null;
  const relatedEdges = graph && selectedNodeId
    ? getRelatedEdges(selectedNodeId, graph.edges)
    : [];

  const hasGraph = !!graph && graph.nodes.length > 0;

  return (
    <div className="flex flex-col" style={{ height: '100vh', overflow: 'hidden', background: '#0f0f13' }}>
      {/* Toolbar */}
      <header
        className="flex items-center justify-between px-4 shrink-0"
        style={{
          height: 56,
          background: '#1a1a24',
          borderBottom: '1px solid #2a2a38',
          zIndex: 30,
        }}
      >
        {/* Left: wordmark */}
        <div className="font-bold text-base tracking-tight" style={{ color: '#e8e8f0' }}>
          MCAT MindMap
        </div>

        {/* Center: tabs */}
        <div className="flex gap-1">
          {(['map', 'flashcards', 'quiz'] as AppView[]).map(v => (
            <button
              key={v}
              onClick={() => { setView(v); if (v === 'flashcards') setFlashcardInitId(undefined); }}
              disabled={!hasGraph}
              className="px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors disabled:opacity-30"
              style={{
                background: view === v ? '#6366f1' : 'transparent',
                color: view === v ? '#fff' : '#8888a8',
              }}
            >
              {v === 'map' ? 'Map' : v === 'flashcards' ? 'Flashcards' : 'Quiz'}
            </button>
          ))}
        </div>

        {/* Right: search + actions */}
        <div className="flex items-center gap-2">
          {hasGraph && (
            <SearchBar
              nodes={graph!.nodes}
              onHighlight={setHighlightedNodeIds}
              onSelect={handleSearchSelect}
            />
          )}
          {hasGraph && (
            <button
              onClick={() => setShowInputPanel(true)}
              className="px-3 py-1.5 rounded-md text-sm font-medium transition-opacity hover:opacity-90"
              style={{ background: '#6366f125', color: '#6366f1', border: '1px solid #6366f150' }}
            >
              + Add Content
            </button>
          )}
          {hasGraph && (
            <button
              onClick={handleExport}
              title="Export JSON"
              className="p-1.5 rounded-md hover:opacity-80"
              style={{ color: '#8888a8' }}
            >
              ↓
            </button>
          )}
          <button
            onClick={() => importRef.current?.click()}
            title="Import JSON"
            className="p-1.5 rounded-md hover:opacity-80"
            style={{ color: '#8888a8' }}
          >
            ↑
          </button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 relative overflow-hidden">
        {/* Empty state */}
        {!hasGraph && view === 'map' && (
          <div className="absolute inset-0 flex items-center justify-center p-4 z-10">
            <InputPanel
              existingNodes={[]}
              onParseComplete={applyDelta}
              parsePhase={parsePhase}
              isFirstParse={true}
            />
          </div>
        )}

        {/* Map view */}
        {hasGraph && view === 'map' && (
          <>
            <MindMap
              graph={graph!}
              selectedNodeId={selectedNodeId}
              highlightedNodeIds={highlightedNodeIds}
              onNodeClick={handleNodeClick}
              onBackgroundClick={() => setSelectedNodeId(null)}
              centerOnNodeId={centerOnNodeId}
            />
            <NodePanel
              node={selectedNode}
              relatedEdges={relatedEdges}
              allNodes={graph!.nodes}
              onClose={() => setSelectedNodeId(null)}
              onNodeJump={handleNodeJump}
              onStudyCard={handleStudyCard}
            />
          </>
        )}

        {/* Flashcard mode */}
        {view === 'flashcards' && hasGraph && (
          <FlashcardMode
            nodes={graph!.nodes}
            initialNodeId={flashcardInitId}
            onClose={() => setView('map')}
            onMasteryUpdate={updateNodeMastery}
          />
        )}

        {/* Quiz mode */}
        {view === 'quiz' && hasGraph && (
          <QuizMode
            nodes={graph!.nodes}
            onClose={() => setView('map')}
            onMasteryUpdate={updateNodeMastery}
          />
        )}

        {/* Add Content modal overlay */}
        {showInputPanel && hasGraph && view === 'map' && (
          <div
            className="absolute inset-0 flex items-center justify-center p-4"
            style={{ backdropFilter: 'blur(4px)', background: '#0f0f1380', zIndex: 40 }}
            onClick={e => { if (e.target === e.currentTarget) setShowInputPanel(false); }}
          >
            <div className="w-full max-w-lg">
              <InputPanel
                existingNodes={graph!.nodes}
                onParseComplete={delta => {
                  applyDelta(delta);
                  setShowInputPanel(false);
                }}
                parsePhase={parsePhase}
                isFirstParse={false}
                onClose={() => setShowInputPanel(false)}
              />
            </div>
          </div>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-medium animate-fade-in z-50"
          style={{ background: '#1a1a24', border: '1px solid #2a2a38', color: '#e8e8f0' }}
        >
          {toast}
        </div>
      )}

      {/* Storage error modal */}
      {storageError && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: '#0f0f1380', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="rounded-xl p-6 max-w-sm mx-4 text-center"
            style={{ background: '#1a1a24', border: '1px solid #ef4444' }}
          >
            <div className="text-lg font-bold mb-2" style={{ color: '#ef4444' }}>
              Storage Full
            </div>
            <p className="text-sm mb-4" style={{ color: '#8888a8' }}>
              Your browser storage is full. Export your map as JSON to free up space.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleExport}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: '#6366f1', color: '#fff' }}
              >
                Export JSON
              </button>
              <button
                onClick={() => setStorageError(false)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ color: '#8888a8' }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
