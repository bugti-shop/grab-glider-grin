// Per-habit milestone celebration logic.
// Fires the first time a habit reaches a given total-completion count
// OR a given current-streak length. Stored on `habit.unlockedMilestones`
// so each threshold only celebrates once per habit.

import { Habit } from '@/types/habit';
import { calculateStreak } from '@/utils/habitStorage';

export const MILESTONE_THRESHOLDS = [7, 14, 30, 66, 100, 180, 365] as const;

export interface MilestoneEvent {
  threshold: number;
  /** What triggered it: total completed days or current streak. */
  source: 'total' | 'streak';
}

/**
 * Compare `prev` vs `next` and return any milestones newly crossed.
 * Always returns an updated `unlockedMilestones` list to merge back in.
 */
export const checkMilestones = (
  prev: Habit | undefined,
  next: Habit
): { events: MilestoneEvent[]; unlocked: number[] } => {
  const already = new Set(next.unlockedMilestones ?? []);
  const totalNow = next.completions.filter((c) => c.completed).length;
  const totalPrev = prev?.completions.filter((c) => c.completed).length ?? 0;
  const streakNow = calculateStreak(next).current;
  const streakPrev = prev ? calculateStreak(prev).current : 0;

  const events: MilestoneEvent[] = [];
  for (const t of MILESTONE_THRESHOLDS) {
    if (already.has(t)) continue;
    if (totalNow >= t && totalPrev < t) {
      events.push({ threshold: t, source: 'total' });
      already.add(t);
      continue;
    }
    if (streakNow >= t && streakPrev < t) {
      events.push({ threshold: t, source: 'streak' });
      already.add(t);
    }
  }

  return { events, unlocked: Array.from(already).sort((a, b) => a - b) };
};

export const milestoneEmoji = (threshold: number): string => {
  if (threshold >= 365) return '👑';
  if (threshold >= 100) return '💎';
  if (threshold >= 30) return '🏆';
  return '⭐';
};
