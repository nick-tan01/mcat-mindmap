'use client';

import { useState, useMemo, useEffect } from 'react';
import { GraphNode, MCATDomain, SM2State } from '@/lib/types';
import { DOMAIN_COLORS } from '@/lib/colors';
import { updateSM2, isDueToday } from '@/lib/sm2';

type Quality = 0 | 2 | 3 | 5;

interface QuizModeProps {
  nodes: GraphNode[];
  onClose: () => void;
  onMasteryUpdate: (nodeId: string, newState: SM2State, newMastery: GraphNode['mastery']) => void;
}

interface QuizQuestion {
  node: GraphNode;
  options: string[];
  correctIndex: number;
}

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestions(sourceNodes: GraphNode[], allNodes: GraphNode[], randomize: boolean): QuizQuestion[] {
  let ordered: GraphNode[];

  if (randomize) {
    ordered = fisherYates(sourceNodes);
  } else {
    // Default: overdue first, then by interval ascending
    ordered = [...sourceNodes].sort((a, b) => {
      const aDue = isDueToday(a.quiz);
      const bDue = isDueToday(b.quiz);
      if (aDue && !bDue) return -1;
      if (!aDue && bDue) return 1;
      return a.quiz.interval - b.quiz.interval;
    });
  }

  return ordered.map(node => {
    // 3 distractors — prefer same domain, fall back to other domains
    const sameDomain = allNodes.filter(n => n.id !== node.id && n.domain === node.domain);
    const otherDomain = allNodes.filter(n => n.id !== node.id && n.domain !== node.domain);
    const pool = fisherYates([...sameDomain, ...otherDomain]).slice(0, 3);

    const options = fisherYates([...pool.map(n => n.label), node.label]);
    const correctIndex = options.indexOf(node.label);

    return { node, options, correctIndex };
  });
}

export default function QuizMode({ nodes, onClose, onMasteryUpdate }: QuizModeProps) {
  const [isShuffled, setIsShuffled] = useState(false);
  const [shuffleKey, setShuffleKey] = useState(0);
  const [domainFilter, setDomainFilter] = useState<MCATDomain | null>(null);

  // All domains that actually have nodes
  const availableDomains = useMemo(
    () => Array.from(new Set(nodes.map(n => n.domain))) as MCATDomain[],
    [nodes]
  );

  const questions = useMemo(() => {
    const source = domainFilter ? nodes.filter(n => n.domain === domainFilter) : nodes;
    void shuffleKey; // included in deps to force re-build on re-shuffle
    return buildQuestions(source, nodes, isShuffled);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, domainFilter, isShuffled, shuffleKey]);

  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);

  // Reset quiz state whenever question set changes
  useEffect(() => {
    setQIndex(0);
    setSelected(null);
    setQuality(null);
    setCorrect(0);
    setDone(false);
  }, [questions]);

  const q = questions[qIndex];

  const handleSelect = (idx: number) => {
    if (selected !== null) return;
    setSelected(idx);
  };

  const handleQuality = (qual: Quality) => {
    setQuality(qual);
    const { newState, newMastery } = updateSM2(questions[qIndex].node.quiz, qual);
    onMasteryUpdate(questions[qIndex].node.id, newState, newMastery);
    if (selected === questions[qIndex].correctIndex) setCorrect(c => c + 1);
  };

  const handleNext = () => {
    if (qIndex + 1 >= questions.length) {
      setDone(true);
    } else {
      setQIndex(i => i + 1);
      setSelected(null);
      setQuality(null);
    }
  };

  const handleShuffleClick = () => {
    if (!isShuffled) {
      setIsShuffled(true);
      setShuffleKey(k => k + 1);
    } else {
      setShuffleKey(k => k + 1); // re-shuffle
    }
  };

  const dueTomorrow = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return nodes.filter(n => {
      if (!n.quiz.nextReviewDate) return false;
      const d = new Date(n.quiz.nextReviewDate);
      return d.toDateString() === tomorrow.toDateString();
    }).length;
  }, [nodes]);

  if (done) {
    const pct = Math.round((correct / questions.length) * 100);
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center z-50"
        style={{ background: '#0f0f13' }}
      >
        <div
          className="rounded-2xl p-10 text-center max-w-md w-full mx-4"
          style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}
        >
          <div className="text-5xl font-bold mb-2" style={{ color: '#6366f1' }}>
            {pct}%
          </div>
          <div className="text-xl font-semibold mb-4" style={{ color: '#e8e8f0' }}>
            Quiz Complete
          </div>
          <div className="text-sm mb-1" style={{ color: '#8888a8' }}>
            {correct} / {questions.length} correct
          </div>
          <div className="text-sm mb-6" style={{ color: '#8888a8' }}>
            {dueTomorrow} concept{dueTomorrow !== 1 ? 's' : ''} due tomorrow
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg font-semibold text-sm"
            style={{ background: '#6366f1', color: '#fff' }}
          >
            Back to Map
          </button>
        </div>
      </div>
    );
  }

  if (!q) return null;

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
        {/* Row 1: progress + exit */}
        <div className="flex items-center gap-4">
          <div className="text-sm shrink-0" style={{ color: '#8888a8' }}>
            Question {qIndex + 1} / {questions.length}
          </div>
          <div
            className="h-1.5 flex-1 rounded-full"
            style={{ background: '#2a2a38' }}
          >
            <div
              className="h-1.5 rounded-full transition-all"
              style={{
                width: `${((qIndex + 1) / questions.length) * 100}%`,
                background: '#6366f1',
              }}
            />
          </div>
          <button
            onClick={onClose}
            className="text-sm hover:opacity-80 shrink-0"
            style={{ color: '#8888a8' }}
          >
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

          {/* Divider */}
          <div style={{ width: 1, height: 16, background: '#2a2a38', margin: '0 4px' }} />

          {/* Shuffle */}
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

      {/* Question */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-xl px-4">
        <div
          className="w-full rounded-2xl p-6 mb-6"
          style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}
        >
          <div className="text-xs font-semibold uppercase mb-2" style={{ color: '#8888a8' }}>
            Which concept matches this definition?
          </div>
          <p className="text-base leading-relaxed" style={{ color: '#e8e8f0' }}>
            {q.node.definition}
          </p>
          <div className="mt-2">
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: DOMAIN_COLORS[q.node.domain] + '25',
                color: DOMAIN_COLORS[q.node.domain],
              }}
            >
              {q.node.domain}
            </span>
          </div>
        </div>

        {/* Options */}
        <div className="w-full grid grid-cols-1 gap-2 mb-6">
          {q.options.map((opt, idx) => {
            let style: React.CSSProperties = {
              background: '#1a1a24',
              color: '#e8e8f0',
              border: '1px solid #2a2a38',
            };
            if (selected !== null) {
              if (idx === q.correctIndex) {
                style = { background: '#10b98120', color: '#10b981', border: '1px solid #10b98150' };
              } else if (idx === selected && selected !== q.correctIndex) {
                style = { background: '#ef444420', color: '#ef4444', border: '1px solid #ef444450' };
              } else {
                style = { background: '#1a1a24', color: '#8888a8', border: '1px solid #2a2a38', opacity: 0.5 };
              }
            }
            return (
              <button
                key={idx}
                onClick={() => handleSelect(idx)}
                className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all"
                style={style}
                disabled={selected !== null}
              >
                {opt}
              </button>
            );
          })}
        </div>

        {/* Self-assessment */}
        {selected !== null && quality === null && (
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
                  onClick={() => handleQuality(item.q)}
                  className="py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
                  style={{ background: '#6366f125', color: '#6366f1', border: '1px solid #6366f150' }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {quality !== null && (
          <button
            onClick={handleNext}
            className="px-6 py-2.5 rounded-lg font-semibold text-sm animate-fade-in"
            style={{ background: '#6366f1', color: '#fff' }}
          >
            {qIndex + 1 >= questions.length ? 'See Results' : 'Next Question →'}
          </button>
        )}
      </div>
    </div>
  );
}
