'use client';

import { useState, useMemo, useEffect } from 'react';
import { GraphNode, MCATDomain, SM2State } from '@/lib/types';
import { DOMAIN_COLORS } from '@/lib/colors';
import { updateSM2, isDueToday } from '@/lib/sm2';

type DeckFilter = 'all' | 'due' | 'weak';

interface FlashcardModeProps {
  nodes: GraphNode[];
  initialNodeId?: string;
  onClose: () => void;
  onMasteryUpdate: (nodeId: string, newState: SM2State, newMastery: GraphNode['mastery']) => void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function FlashcardMode({
  nodes,
  initialNodeId,
  onClose,
  onMasteryUpdate,
}: FlashcardModeProps) {
  const [filter, setFilter] = useState<DeckFilter>('all');
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);
  const [shuffleKey, setShuffleKey] = useState(0);
  const [domainFilter, setDomainFilter] = useState<MCATDomain | null>(null);

  // All domains that actually have nodes
  const availableDomains = useMemo(
    () => Array.from(new Set(nodes.map(n => n.domain))) as MCATDomain[],
    [nodes]
  );

  // Reset index whenever the deck changes
  const resetDeck = () => { setIndex(0); setFlipped(false); };

  const deck = useMemo(() => {
    let filtered = nodes;

    // Domain filter
    if (domainFilter) filtered = filtered.filter(n => n.domain === domainFilter);

    // Deck filter
    if (filter === 'due') filtered = filtered.filter(n => isDueToday(n.quiz));
    if (filter === 'weak') filtered = filtered.filter(n => n.mastery === 'learning');

    // Shuffle or preserve order
    if (isShuffled) {
      // shuffleKey in deps forces a new random order each time user clicks Re-shuffle
      void shuffleKey;
      return shuffle(filtered);
    }

    // Default order: put initialNodeId first if set
    if (initialNodeId && !domainFilter) {
      const idx = filtered.findIndex(n => n.id === initialNodeId);
      if (idx !== -1) return [filtered[idx], ...filtered.filter((_, i) => i !== idx)];
    }

    return filtered;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, filter, domainFilter, isShuffled, shuffleKey, initialNodeId]);

  // Reset index when deck composition changes
  useEffect(() => { resetDeck(); }, [filter, domainFilter, isShuffled]);

  const current = deck[Math.min(index, deck.length - 1)];

  const goNext = () => {
    setFlipped(false);
    setTimeout(() => setIndex(i => Math.min(i + 1, deck.length - 1)), 100);
  };

  const goPrev = () => {
    setFlipped(false);
    setTimeout(() => setIndex(i => Math.max(i - 1, 0)), 100);
  };

  const handleKnew = () => {
    if (!current) return;
    const { newState, newMastery } = updateSM2(current.quiz, 5);
    onMasteryUpdate(current.id, newState, newMastery);
    goNext();
  };

  const handleDidntKnow = () => {
    if (!current) return;
    const { newState, newMastery } = updateSM2(current.quiz, 1);
    onMasteryUpdate(current.id, newState, newMastery);
    goNext();
  };

  const handleShuffleClick = () => {
    if (!isShuffled) {
      setIsShuffled(true);
      setShuffleKey(k => k + 1);
    } else {
      // Already shuffled — re-shuffle with a new order
      setShuffleKey(k => k + 1);
      setIndex(0);
      setFlipped(false);
    }
  };

  if (!current || deck.length === 0) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center z-50"
        style={{ background: '#0f0f13' }}
      >
        <div className="text-center">
          <div className="text-2xl mb-2" style={{ color: '#e8e8f0' }}>No cards in this deck</div>
          <div className="text-sm mb-6" style={{ color: '#8888a8' }}>
            Try a different filter or domain
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg text-sm font-semibold"
            style={{ background: '#6366f1', color: '#fff' }}
          >
            Back to Map
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 flex flex-col items-center z-50"
      style={{ background: '#0f0f13' }}
    >
      {/* Top bar */}
      <div
        className="w-full flex flex-col gap-2 px-6 py-3"
        style={{ borderBottom: '1px solid #2a2a38' }}
      >
        {/* Row 1: deck filters + counter + close */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {(['all', 'due', 'weak'] as DeckFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
                style={{
                  background: filter === f ? '#6366f1' : '#1a1a24',
                  color: filter === f ? '#fff' : '#8888a8',
                  border: '1px solid #2a2a38',
                }}
              >
                {f === 'all' ? 'All Cards' : f === 'due' ? 'Due Today' : 'Weak Cards'}
              </button>
            ))}
          </div>
          <div className="text-sm" style={{ color: '#8888a8' }}>
            Card {index + 1} / {deck.length}
          </div>
          <button
            onClick={onClose}
            className="text-sm hover:opacity-80"
            style={{ color: '#8888a8' }}
          >
            ✕ Close
          </button>
        </div>

        {/* Row 2: domain chips + shuffle */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setDomainFilter(null)}
            className="px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors"
            style={{
              background: domainFilter === null ? '#e8e8f025' : 'transparent',
              color: domainFilter === null ? '#e8e8f0' : '#8888a8',
              border: `1px solid ${domainFilter === null ? '#e8e8f050' : '#2a2a38'}`,
            }}
          >
            All Domains
          </button>
          {availableDomains.map(domain => {
            const color = DOMAIN_COLORS[domain];
            const active = domainFilter === domain;
            return (
              <button
                key={domain}
                onClick={() => setDomainFilter(active ? null : domain)}
                className="px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors"
                style={{
                  background: active ? color + '30' : 'transparent',
                  color: active ? color : '#8888a8',
                  border: `1px solid ${active ? color + '60' : '#2a2a38'}`,
                }}
              >
                {domain}
              </button>
            );
          })}

          {/* Divider */}
          <div style={{ width: 1, height: 16, background: '#2a2a38', margin: '0 4px' }} />

          {/* Shuffle button */}
          <button
            onClick={handleShuffleClick}
            className="px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors"
            style={{
              background: isShuffled ? '#6366f130' : 'transparent',
              color: isShuffled ? '#6366f1' : '#8888a8',
              border: `1px solid ${isShuffled ? '#6366f150' : '#2a2a38'}`,
            }}
          >
            {isShuffled ? '🔀 Re-shuffle' : '🔀 Shuffle'}
          </button>
          {isShuffled && (
            <button
              onClick={() => { setIsShuffled(false); resetDeck(); }}
              className="px-2.5 py-0.5 rounded-full text-xs transition-colors"
              style={{ color: '#8888a8', border: '1px solid #2a2a38' }}
            >
              Reset Order
            </button>
          )}
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 flex flex-col items-center justify-center w-full px-4">
        <div className="card-scene w-full max-w-lg" style={{ height: 340 }}>
          <div
            className={`card-inner cursor-pointer ${flipped ? 'flipped' : ''}`}
            onClick={() => setFlipped(f => !f)}
          >
            {/* Front */}
            <div
              className="card-face rounded-2xl flex flex-col items-center justify-center p-8"
              style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}
            >
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium mb-4"
                style={{
                  background: DOMAIN_COLORS[current.domain] + '30',
                  color: DOMAIN_COLORS[current.domain],
                }}
              >
                {current.domain}
              </span>
              <h2 className="text-2xl font-bold text-center" style={{ color: '#e8e8f0' }}>
                {current.label}
              </h2>
              <p className="text-xs mt-4" style={{ color: '#8888a8' }}>
                Click to reveal definition
              </p>
            </div>

            {/* Back */}
            <div
              className="card-face card-back rounded-2xl flex flex-col p-8 overflow-y-auto"
              style={{ background: '#1a1a24', border: '1px solid #6366f1' }}
            >
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium mb-3 self-start"
                style={{
                  background: DOMAIN_COLORS[current.domain] + '30',
                  color: DOMAIN_COLORS[current.domain],
                }}
              >
                {current.domain}
              </span>
              <p className="text-base leading-relaxed mb-3" style={{ color: '#e8e8f0' }}>
                {current.definition}
              </p>
              {current.sourceSnippet && (
                <p className="text-xs italic" style={{ color: '#8888a8' }}>
                  &ldquo;{current.sourceSnippet}&rdquo;
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 mt-6">
          <button
            onClick={goPrev}
            disabled={index === 0}
            className="px-4 py-2 rounded-lg text-sm disabled:opacity-30 hover:opacity-80"
            style={{ background: '#1a1a24', color: '#e8e8f0', border: '1px solid #2a2a38' }}
          >
            ← Prev
          </button>

          {flipped && (
            <>
              <button
                onClick={handleDidntKnow}
                className="px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90"
                style={{ background: '#ef444425', color: '#ef4444', border: '1px solid #ef444450' }}
              >
                I didn&apos;t know this
              </button>
              <button
                onClick={handleKnew}
                className="px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90"
                style={{ background: '#10b98125', color: '#10b981', border: '1px solid #10b98150' }}
              >
                I knew this
              </button>
            </>
          )}

          <button
            onClick={goNext}
            disabled={index === deck.length - 1}
            className="px-4 py-2 rounded-lg text-sm disabled:opacity-30 hover:opacity-80"
            style={{ background: '#1a1a24', color: '#e8e8f0', border: '1px solid #2a2a38' }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
