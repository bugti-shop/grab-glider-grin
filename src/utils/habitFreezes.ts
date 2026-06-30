/**
 * Per-habit Streak Freezes
 * ------------------------
 * Default: each habit gets 2 free "freeze" passes per calendar month.
 * When a scheduled day is missed, a freeze is auto-consumed so the
 * current streak stays intact. Quota resets on the 1st of every month.
 *
 * Behavior keeps the existing `currentStreak` cache on the Habit truthy
 * — we just recompute it with frozen days treated as completed.
 */
import { Habit } from '@/types/habit';
import { addDays, format, parseISO, startOfDay, subDays } from 'date-fns';
import { isHabitDueOnDate } from './habitScheduler';

export const DEFAULT_FREEZES_PER_MONTH = 2;
/** How far back we'll look for missed scheduled days to freeze. */
const FREEZE_LOOKBACK_DAYS = 45;

export interface HabitFreezeState {
  /** Quota for the current cycle. Defaults to 2. */
  freezesPerMonth: number;
  /** Freezes consumed in `freezeMonth`. */
  freezesUsedThisMonth: number;
  /** "YYYY-MM" the quota counter belongs to. */
  freezeMonth: string;
  /** Dates (YYYY-MM-DD) historically protected by a freeze. */
  frozenDates: string[];
}

export const getFreezeState = (h: Habit): HabitFreezeState => {
  const currentMonth = format(new Date(), 'yyyy-MM');
  const raw = (h as any).freezeState as HabitFreezeState | undefined;
  if (!raw) {
    return {
      freezesPerMonth: DEFAULT_FREEZES_PER_MONTH,
      freezesUsedThisMonth: 0,
      freezeMonth: currentMonth,
      frozenDates: [],
    };
  }
  if (raw.freezeMonth !== currentMonth) {
    // New month → reset usage, keep historical frozenDates so streak math
    // remains stable across months.
    return {
      freezesPerMonth: raw.freezesPerMonth ?? DEFAULT_FREEZES_PER_MONTH,
      freezesUsedThisMonth: 0,
      freezeMonth: currentMonth,
      frozenDates: raw.frozenDates ?? [],
    };
  }
  return {
    freezesPerMonth: raw.freezesPerMonth ?? DEFAULT_FREEZES_PER_MONTH,
    freezesUsedThisMonth: raw.freezesUsedThisMonth ?? 0,
    freezeMonth: raw.freezeMonth,
    frozenDates: raw.frozenDates ?? [],
  };
};

const isAmountComplete = (h: Habit, key: string): boolean => {
  const rec = h.completions.find((c) => c.date === key);
  if (!rec) return false;
  if (rec.completed) return true;
  if (h.goalType === 'amount' && (h.goalAmount ?? 0) > 0) {
    return (rec.amount ?? 0) >= (h.goalAmount ?? 1);
  }
  return false;
};

/**
 * Recomputes streak with freezes applied. Auto-consumes freezes for any
 * missed scheduled days within the current month (up to the monthly quota).
 * Returns a new Habit with updated `currentStreak`, `bestStreak`, and
 * `freezeState` — does NOT persist; caller must save.
 */
export const applyStreakFreezes = (habit: Habit): Habit => {
  const today = startOfDay(new Date());
  const todayKey = format(today, 'yyyy-MM-dd');
  let state = getFreezeState(habit);
  const frozen = new Set(state.frozenDates);
  const createdAt = habit.createdAt ? startOfDay(parseISO(habit.createdAt)) : today;

  // Walk back from yesterday → consume freezes for any missed scheduled day.
  // Only freezes inside the current month count against the monthly quota.
  for (let i = 1; i <= FREEZE_LOOKBACK_DAYS; i++) {
    const d = subDays(today, i);
    if (d < createdAt) break;
    if (!isHabitDueOnDate(habit, d)) continue;
    const k = format(d, 'yyyy-MM-dd');
    if (isAmountComplete(habit, k)) continue;
    if (frozen.has(k)) continue;

    const sameMonth = format(d, 'yyyy-MM') === state.freezeMonth;
    if (!sameMonth) break; // older miss → streak already broken historically
    if (state.freezesUsedThisMonth >= state.freezesPerMonth) break;

    frozen.add(k);
    state = {
      ...state,
      freezesUsedThisMonth: state.freezesUsedThisMonth + 1,
      frozenDates: Array.from(frozen),
    };
  }

  // Recompute streak: completed OR frozen counts as "kept".
  const kept = (key: string, d: Date) => isAmountComplete(habit, key) || frozen.has(key);

  let current = 0;
  let cursor = today;
  if (!kept(todayKey, today)) cursor = subDays(today, 1);

  for (let i = 0; i < 730; i++) {
    const d = i === 0 ? cursor : subDays(cursor, i);
    if (d < createdAt) break;
    if (!isHabitDueOnDate(habit, d)) continue;
    const k = format(d, 'yyyy-MM-dd');
    if (kept(k, d)) current++;
    else break;
  }

  const best = Math.max(current, habit.bestStreak || 0);
  return {
    ...habit,
    currentStreak: current,
    bestStreak: best,
    freezeState: state,
  } as Habit;
};

/** Remaining freezes for the current month. */
export const freezesRemaining = (h: Habit): number => {
  const s = getFreezeState(h);
  return Math.max(0, s.freezesPerMonth - s.freezesUsedThisMonth);
};
