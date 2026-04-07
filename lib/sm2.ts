export interface SM2State {
  easinessFactor: number;
  interval: number;
  repetitions: number;
  nextReviewDate: string | null;
  lastReviewDate: string | null;
}

export const DEFAULT_SM2: SM2State = {
  easinessFactor: 2.5,
  interval: 1,
  repetitions: 0,
  nextReviewDate: null,
  lastReviewDate: null,
};

/**
 * quality: 0 = complete blackout, 5 = perfect response
 */
export function updateSM2(
  state: SM2State,
  quality: 0 | 1 | 2 | 3 | 4 | 5
): { newState: SM2State; newMastery: 'learning' | 'reviewing' | 'mastered' } {
  const EF_MIN = 1.3;
  let { easinessFactor, interval, repetitions } = state;

  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easinessFactor);
    repetitions += 1;
  }

  easinessFactor = Math.max(
    EF_MIN,
    easinessFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
  );

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  const newMastery =
    repetitions === 0 ? 'learning'
    : repetitions < 3 ? 'reviewing'
    : 'mastered';

  return {
    newState: {
      easinessFactor,
      interval,
      repetitions,
      nextReviewDate: nextReview.toISOString(),
      lastReviewDate: new Date().toISOString(),
    },
    newMastery,
  };
}

export function isDueToday(state: SM2State): boolean {
  if (!state.nextReviewDate) return true;
  return new Date(state.nextReviewDate) <= new Date();
}
