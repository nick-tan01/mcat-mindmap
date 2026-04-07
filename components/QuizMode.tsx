'use client';

import { useState, useMemo } from 'react';
import { GraphNode, SM2State } from '@/lib/types';
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

function buildQuestions(nodes: GraphNode[]): QuizQuestion[] {
  // Sort: overdue first, then by interval ascending
  const sorted = [...nodes].sort((a, b) => {
    const aDue = isDueToday(a.quiz);
    const bDue = isDueToday(b.quiz);
    if (aDue && !bDue) return -1;
    if (!aDue && bDue) return 1;
    return a.quiz.interval - b.quiz.interval;
  });

  return sorted.map(node => {
    // 3 distractors from same domain
    const sameDomain = nodes.filter(n => n.id !== node.id && n.domain === node.domain);
    const otherDomain = nodes.filter(n => n.id !== node.id && n.domain !== node.domain);
    const pool = [...sameDomain, ...otherDomain];

    const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 3);
    const options = [...shuffled.map(n => n.label), node.label];
    const shuffledOptions = options.sort(() => Math.random() - 0.5);
    const correctIndex = shuffledOptions.indexOf(node.label);

    return { node, options: shuffledOptions, correctIndex };
  });
}

export default function QuizMode({ nodes, onClose, onMasteryUpdate }: QuizModeProps) {
  const questions = useMemo(() => buildQuestions(nodes), [nodes]);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);

  const q = questions[qIndex];

  const handleSelect = (idx: number) => {
    if (selected !== null) return;
    setSelected(idx);
  };

  const handleQuality = (q: Quality) => {
    setQuality(q);
    const { newState, newMastery } = updateSM2(questions[qIndex].node.quiz, q);
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
        className="w-full flex items-center justify-between px-6 py-3"
        style={{ borderBottom: '1px solid #2a2a38' }}
      >
        <div className="text-sm" style={{ color: '#8888a8' }}>
          Question {qIndex + 1} / {questions.length}
        </div>
        <div
          className="h-1.5 flex-1 mx-6 rounded-full"
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
          className="text-sm hover:opacity-80"
          style={{ color: '#8888a8' }}
        >
          ✕ Exit
        </button>
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
