'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { GraphNode, MCATDomain, SM2State } from '@/lib/types';
import { DOMAIN_COLORS } from '@/lib/colors';
import { updateSM2, isDueToday } from '@/lib/sm2';
import {
  generateHintScaffold,
  scrubTermFromDefinition,
  isAnswerCorrect,
} from '@/lib/graphUtils';

type Quality = 0 | 2 | 3 | 5;
type QuizType = 'fill' | 'mc';

interface QuizModeProps {
  nodes: GraphNode[];
  onClose: () => void;
  onMasteryUpdate: (nodeId: string, newState: SM2State, newMastery: GraphNode['mastery']) => void;
}

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(sourceNodes: GraphNode[], randomize: boolean): GraphNode[] {
  if (randomize) return fisherYates(sourceNodes);
  return [...sourceNodes].sort((a, b) => {
    const aDue = isDueToday(a.quiz);
    const bDue = isDueToday(b.quiz);
    if (aDue && !bDue) return -1;
    if (!aDue && bDue) return 1;
    return a.quiz.interval - b.quiz.interval;
  });
}

/** Build 4 shuffled MC options for a given node, drawing distractors from allNodes */
function buildMCOptions(node: GraphNode, allNodes: GraphNode[]): { options: string[]; correctIndex: number } {
  const sameDomain = allNodes.filter(n => n.id !== node.id && n.domain === node.domain);
  const otherDomain = allNodes.filter(n => n.id !== node.id && n.domain !== node.domain);
  const pool = fisherYates([...sameDomain, ...otherDomain]).slice(0, 3);
  const options = fisherYates([...pool.map(n => n.label), node.label]);
  return { options, correctIndex: options.indexOf(node.label) };
}

export default function QuizMode({ nodes, onClose, onMasteryUpdate }: QuizModeProps) {
  // ── Settings ────────────────────────────────────────────────────────────────
  const [quizType, setQuizType] = useState<QuizType>('fill');
  const [isShuffled, setIsShuffled] = useState(false);
  const [shuffleKey, setShuffleKey] = useState(0);
  const [domainFilter, setDomainFilter] = useState<MCATDomain | null>(null);

  const availableDomains = useMemo(
    () => Array.from(new Set(nodes.map(n => n.domain))) as MCATDomain[],
    [nodes]
  );

  const deck = useMemo(() => {
    const source = domainFilter ? nodes.filter(n => n.domain === domainFilter) : nodes;
    void shuffleKey;
    return buildDeck(source, isShuffled);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, domainFilter, isShuffled, shuffleKey]);

  // Stable signature: sorted node IDs + quizType.
  // Changes only when the *set* of cards changes (filter/domain/nodes added),
  // NOT when SM2 updates merely re-sort the deck. This prevents quiz state
  // from resetting every time onMasteryUpdate is called.
  const deckSignature = useMemo(
    () => quizType + ':' + deck.map(n => n.id).sort().join(','),
    [deck, quizType]
  );

  // ── Progress ─────────────────────────────────────────────────────────────────
  const [qIndex, setQIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [correct, setCorrect] = useState(0);

  // ── Fill-in-the-blank state ───────────────────────────────────────────────
  const [userInput, setUserInput] = useState('');
  const [hintRevealed, setHintRevealed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [retryMode, setRetryMode] = useState(false);

  // ── Multiple-choice state ─────────────────────────────────────────────────
  const [mcSelected, setMcSelected] = useState<number | null>(null);
  const [mcQuality, setMcQuality] = useState<Quality | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const node = deck[qIndex];

  // ── MC options — computed per card via useMemo, never starts empty ────────
  const { options: mcOptions, correctIndex: mcCorrectIndex } = useMemo(
    () => node ? buildMCOptions(node, nodes) : { options: [] as string[], correctIndex: 0 },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qIndex, quizType, node?.id]
  );

  // ── Reset all card state on deck or quiz-type change ─────────────────────
  const resetCard = () => {
    setUserInput('');
    setHintRevealed(false);
    setSubmitted(false);
    setWasCorrect(false);
    setRetryMode(false);
    setMcSelected(null);
    setMcQuality(null);
  };

  useEffect(() => {
    setQIndex(0);
    setDone(false);
    setCorrect(0);
    resetCard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckSignature]);

  // Focus fill input on new card
  useEffect(() => {
    if (quizType === 'fill' && !submitted && !done) inputRef.current?.focus();
  }, [qIndex, quizType, submitted, done, retryMode]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const advanceToNext = () => {
    if (qIndex + 1 >= deck.length) {
      setDone(true);
    } else {
      setQIndex(i => i + 1);
      resetCard();
    }
  };

  // ── Fill-in-the-blank handlers ────────────────────────────────────────────
  const handleFillSubmit = () => {
    if (!node || !userInput.trim()) return;
    const ok = isAnswerCorrect(userInput, node.label);
    setWasCorrect(ok);
    setSubmitted(true);
    // SM2 updates are deferred to the Next button handlers.
    // Calling onMasteryUpdate here causes the parent to update nodes state,
    // which recomputes the deck prop, triggers useEffect([deck]) → resetCard()
    // → submitted resets to false before feedback ever renders.
  };

  const handleFillQuality = (q: Quality) => {
    if (!node) return;
    const { newState, newMastery } = updateSM2(node.quiz, q);
    onMasteryUpdate(node.id, newState, newMastery);
    setCorrect(c => c + 1);
    advanceToNext();
  };

  const handleRetry = () => {
    setUserInput('');
    setRetryMode(true);
    setSubmitted(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ── Multiple-choice handlers ──────────────────────────────────────────────
  const handleMcSelect = (idx: number) => {
    if (mcSelected !== null) return;
    setMcSelected(idx);
  };

  const handleMcQuality = (q: Quality) => {
    if (!node) return;
    setMcQuality(q);
    const { newState, newMastery } = updateSM2(node.quiz, q);
    onMasteryUpdate(node.id, newState, newMastery);
    if (mcSelected === mcCorrectIndex) setCorrect(c => c + 1);
  };

  // ── Shuffle ───────────────────────────────────────────────────────────────
  const handleShuffleClick = () => {
    if (!isShuffled) { setIsShuffled(true); setShuffleKey(k => k + 1); }
    else { setShuffleKey(k => k + 1); }
  };

  const dueTomorrow = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return nodes.filter(n => {
      if (!n.quiz.nextReviewDate) return false;
      return new Date(n.quiz.nextReviewDate).toDateString() === tomorrow.toDateString();
    }).length;
  }, [nodes]);

  // ── Done screen ───────────────────────────────────────────────────────────
  if (done) {
    const pct = deck.length > 0 ? Math.round((correct / deck.length) * 100) : 0;
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center z-50" style={{ background: '#0f0f13' }}>
        <div className="rounded-2xl p-10 text-center max-w-md w-full mx-4" style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}>
          <div className="text-5xl font-bold mb-2" style={{ color: '#6366f1' }}>{pct}%</div>
          <div className="text-xl font-semibold mb-4" style={{ color: '#e8e8f0' }}>Quiz Complete</div>
          <div className="text-sm mb-1" style={{ color: '#8888a8' }}>{correct} / {deck.length} correct</div>
          <div className="text-sm mb-6" style={{ color: '#8888a8' }}>
            {dueTomorrow} concept{dueTomorrow !== 1 ? 's' : ''} due tomorrow
          </div>
          <button onClick={onClose} className="px-6 py-2.5 rounded-lg font-semibold text-sm" style={{ background: '#6366f1', color: '#fff' }}>
            Back to Map
          </button>
        </div>
      </div>
    );
  }

  if (!node) return null;

  const displayDefinition = scrubTermFromDefinition(node.definition, node.label);
  const hintScaffold = generateHintScaffold(node.label);

  return (
    <div className="fixed inset-0 flex flex-col items-center z-50" style={{ background: '#0f0f13' }}>
      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="w-full flex flex-col gap-2 px-6 py-3" style={{ borderBottom: '1px solid #2a2a38' }}>

        {/* Row 1: progress + quiz type toggle + exit */}
        <div className="flex items-center gap-4">
          <div className="text-sm shrink-0" style={{ color: '#8888a8' }}>
            Question {qIndex + 1} / {deck.length}
          </div>
          <div className="h-1.5 flex-1 rounded-full" style={{ background: '#2a2a38' }}>
            <div
              className="h-1.5 rounded-full transition-all"
              style={{ width: `${((qIndex + 1) / deck.length) * 100}%`, background: '#6366f1' }}
            />
          </div>

          {/* Quiz type toggle */}
          <div className="flex shrink-0 rounded-lg overflow-hidden" style={{ border: '1px solid #2a2a38' }}>
            {(['fill', 'mc'] as QuizType[]).map(type => (
              <button
                key={type}
                onClick={() => setQuizType(type)}
                className="px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  background: quizType === type ? '#6366f1' : '#1a1a24',
                  color: quizType === type ? '#fff' : '#8888a8',
                }}
              >
                {type === 'fill' ? '✏️ Fill in Blank' : '☑️ Multiple Choice'}
              </button>
            ))}
          </div>

          <button onClick={onClose} className="text-sm hover:opacity-80 shrink-0" style={{ color: '#8888a8' }}>
            ✕ Exit
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
          <div style={{ width: 1, height: 16, background: '#2a2a38', margin: '0 4px' }} />
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
              onClick={() => setIsShuffled(false)}
              className="px-2.5 py-0.5 rounded-full text-xs transition-colors"
              style={{ color: '#8888a8', border: '1px solid #2a2a38' }}
            >
              Reset Order
            </button>
          )}
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-xl px-4">

        {/* Definition card */}
        <div className="w-full rounded-2xl p-6 mb-5" style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}>
          <div className="text-xs font-semibold uppercase mb-2" style={{ color: '#8888a8' }}>
            {quizType === 'fill' ? 'What is this concept?' : 'Which concept matches this definition?'}
          </div>
          <p className="text-base leading-relaxed" style={{ color: '#e8e8f0' }}>
            {quizType === 'fill' ? displayDefinition : node.definition}
          </p>
          <div className="mt-3">
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: DOMAIN_COLORS[node.domain] + '25', color: DOMAIN_COLORS[node.domain] }}
            >
              {node.domain}
            </span>
          </div>
        </div>

        {/* ── FILL IN THE BLANK ─────────────────────────────────────────────── */}
        {quizType === 'fill' && (
          <>
            {/* Hint scaffold */}
            {hintRevealed && (
              <div className="w-full mb-4 px-1">
                <span className="text-xs font-semibold" style={{ color: '#8888a8' }}>Hint: </span>
                <span className="text-sm font-mono tracking-wide" style={{ color: '#6366f1' }}>{hintScaffold}</span>
              </div>
            )}

            {/* Input — always visible; color-coded after submit */}
            <div className="w-full mb-3">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={userInput}
                  onChange={e => { if (!submitted || retryMode) setUserInput(e.target.value); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (retryMode) advanceToNext();
                      else if (!submitted) handleFillSubmit();
                    }
                  }}
                  readOnly={submitted && !retryMode}
                  placeholder="type the concept name..."
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: submitted && !retryMode
                      ? wasCorrect ? '#10b98112' : '#ef444412'
                      : '#1a1a24',
                    border: submitted && !retryMode
                      ? wasCorrect ? '1.5px solid #10b98160' : '1.5px solid #ef444460'
                      : '1px solid #3a3a50',
                    color: '#e8e8f0',
                  }}
                />
                {submitted && !retryMode && (
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: wasCorrect ? '#10b98125' : '#ef444425',
                      color: wasCorrect ? '#10b981' : '#ef4444',
                    }}
                  >
                    {wasCorrect ? '✓ Correct' : '✗ Incorrect'}
                  </span>
                )}
              </div>

              {submitted && !retryMode && !wasCorrect && (
                <div className="mt-2 px-1 flex items-center gap-2">
                  <span className="text-xs" style={{ color: '#8888a8' }}>Answer:</span>
                  <span className="text-sm font-semibold" style={{ color: '#e8e8f0' }}>{node.label}</span>
                </div>
              )}
              {submitted && !retryMode && wasCorrect && hintRevealed && (
                <div className="mt-2 px-1">
                  <span className="text-xs" style={{ color: '#8888a8' }}>⚑ hint used — marked as recalled with difficulty</span>
                </div>
              )}
            </div>

            {/* Fill action buttons */}
            <div className="w-full flex items-center gap-3">
              {!submitted && !retryMode && (
                <>
                  {!hintRevealed && (
                    <button
                      onClick={() => setHintRevealed(true)}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium"
                      style={{ background: '#1a1a24', color: '#8888a8', border: '1px solid #2a2a38' }}
                    >
                      💡 Hint
                    </button>
                  )}
                  <button
                    onClick={handleFillSubmit}
                    disabled={!userInput.trim()}
                    className="ml-auto px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-30"
                    style={{ background: '#6366f1', color: '#fff' }}
                  >
                    Submit →
                  </button>
                </>
              )}

              {submitted && !wasCorrect && !retryMode && (
                <>
                  <button
                    onClick={handleRetry}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium"
                    style={{ background: '#1a1a24', color: '#e8e8f0', border: '1px solid #2a2a38' }}
                  >
                    ✏️ Try Again
                  </button>
                  <button
                    onClick={() => {
                      if (node) {
                        const { newState, newMastery } = updateSM2(node.quiz, 0);
                        onMasteryUpdate(node.id, newState, newMastery);
                      }
                      advanceToNext();
                    }}
                    className="ml-auto px-6 py-2.5 rounded-xl text-sm font-semibold"
                    style={{ background: '#6366f1', color: '#fff' }}
                  >
                    {qIndex + 1 >= deck.length ? 'See Results' : 'Next →'}
                  </button>
                </>
              )}

              {retryMode && (
                <button
                  onClick={advanceToNext}
                  disabled={!userInput.trim()}
                  className="ml-auto px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-30"
                  style={{ background: '#6366f1', color: '#fff' }}
                >
                  {qIndex + 1 >= deck.length ? 'See Results' : 'Next →'}
                </button>
              )}

              {submitted && wasCorrect && hintRevealed && (
                <button
                  onClick={() => {
                    if (node) {
                      const { newState, newMastery } = updateSM2(node.quiz, 3);
                      onMasteryUpdate(node.id, newState, newMastery);
                    }
                    setCorrect(c => c + 1);
                    advanceToNext();
                  }}
                  className="ml-auto px-6 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: '#6366f1', color: '#fff' }}
                >
                  {qIndex + 1 >= deck.length ? 'See Results' : 'Next →'}
                </button>
              )}
            </div>

            {/* Self-assessment — correct, no hint */}
            {submitted && wasCorrect && !hintRevealed && (
              <div className="w-full mt-5 animate-fade-in">
                <div className="text-sm font-semibold text-center mb-3" style={{ color: '#8888a8' }}>
                  How easily did you recall it?
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {([
                    { label: 'Not at all', q: 0 as Quality },
                    { label: 'Barely', q: 2 as Quality },
                    { label: 'With effort', q: 3 as Quality },
                    { label: 'Easily', q: 5 as Quality },
                  ]).map(item => (
                    <button
                      key={item.q}
                      onClick={() => handleFillQuality(item.q)}
                      className="py-2 rounded-lg text-xs font-semibold hover:opacity-90"
                      style={{ background: '#6366f125', color: '#6366f1', border: '1px solid #6366f150' }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── MULTIPLE CHOICE ───────────────────────────────────────────────── */}
        {quizType === 'mc' && (
          <>
            {/* Options */}
            <div className="w-full grid grid-cols-1 gap-2 mb-5">
              {mcOptions.map((opt, idx) => {
                let style: React.CSSProperties = {
                  background: '#1a1a24',
                  color: '#e8e8f0',
                  border: '1px solid #2a2a38',
                };
                if (mcSelected !== null) {
                  if (idx === mcCorrectIndex) {
                    style = { background: '#10b98120', color: '#10b981', border: '1px solid #10b98150' };
                  } else if (idx === mcSelected && mcSelected !== mcCorrectIndex) {
                    style = { background: '#ef444420', color: '#ef4444', border: '1px solid #ef444450' };
                  } else {
                    style = { background: '#1a1a24', color: '#8888a8', border: '1px solid #2a2a38', opacity: 0.45 };
                  }
                }
                return (
                  <button
                    key={idx}
                    onClick={() => handleMcSelect(idx)}
                    disabled={mcSelected !== null}
                    className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all"
                    style={style}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>

            {/* MC self-assessment */}
            {mcSelected !== null && mcQuality === null && (
              <div className="w-full animate-fade-in">
                <div className="text-sm font-semibold text-center mb-3" style={{ color: '#8888a8' }}>
                  How well did you recall?
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {([
                    { label: 'Not at all', q: 0 as Quality },
                    { label: 'Barely', q: 2 as Quality },
                    { label: 'With effort', q: 3 as Quality },
                    { label: 'Easily', q: 5 as Quality },
                  ]).map(item => (
                    <button
                      key={item.q}
                      onClick={() => handleMcQuality(item.q)}
                      className="py-2 rounded-lg text-xs font-semibold hover:opacity-90"
                      style={{ background: '#6366f125', color: '#6366f1', border: '1px solid #6366f150' }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mcQuality !== null && (
              <button
                onClick={advanceToNext}
                className="px-6 py-2.5 rounded-lg font-semibold text-sm animate-fade-in"
                style={{ background: '#6366f1', color: '#fff' }}
              >
                {qIndex + 1 >= deck.length ? 'See Results' : 'Next Question →'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
