/**
 * Habit pause / vacation / sick-day helpers.
 *
 * A "pause" is an inclusive date range during which a habit is not due.
 * Paused days:
 *   - are hidden from the today list,
 *   - do NOT break the streak (they're treated as not-scheduled),
 *   - are excluded from weekly quota counts,
 *   - render as a subtle grey dot on the calendar with the pause label.
 */
import { addDays, format, parseISO, startOfDay } from 'date-fns';
import { Habit, HabitPauseRange, HabitPauseReason } from '@/types/habit';

const toKey = (d: Date) => format(d, 'yyyy-MM-dd');

const inRange = (dayKey: string, r: HabitPauseRange): boolean => {
  return dayKey >= r.start && dayKey <= r.end;
};

/** Is this habit paused on the given date? */
export const isHabitPausedOn = (habit: Habit, d: Date = new Date()): boolean => {
  const ranges = habit.pausedRanges;
  if (!ranges?.length) return false;
  const key = toKey(startOfDay(d));
  return ranges.some((r) => inRange(key, r));
};

/** Return the active pause range covering the date, or null. */
export const getActivePause = (
  habit: Habit,
  d: Date = new Date()
): HabitPauseRange | null => {
  const ranges = habit.pausedRanges;
  if (!ranges?.length) return null;
  const key = toKey(startOfDay(d));
  return ranges.find((r) => inRange(key, r)) ?? null;
};

/** Merge overlapping/adjacent same-reason ranges to keep the array tidy. */
const mergeRanges = (ranges: HabitPauseRange[]): HabitPauseRange[] => {
  if (ranges.length <= 1) return ranges;
  const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
  const out: HabitPauseRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && last.reason === r.reason && r.start <= toKey(addDays(parseISO(last.end), 1))) {
      last.end = r.end > last.end ? r.end : last.end;
      if (r.note && !last.note) last.note = r.note;
    } else {
      out.push({ ...r });
    }
  }
  return out;
};

/**
 * Add a pause range to the habit. `days` counted inclusive from `startDate`
 * (defaults to today). Returns a new Habit — caller persists via saveHabit.
 */
export const pauseHabit = (
  habit: Habit,
  opts: {
    days: number;
    reason?: HabitPauseReason;
    note?: string;
    startDate?: Date;
  }
): Habit => {
  const start = startOfDay(opts.startDate ?? new Date());
  const days = Math.max(1, Math.floor(opts.days));
  const end = addDays(start, days - 1);
  const range: HabitPauseRange = {
    start: toKey(start),
    end: toKey(end),
    reason: opts.reason ?? 'vacation',
    note: opts.note,
  };
  const next = mergeRanges([...(habit.pausedRanges ?? []), range]);
  return { ...habit, pausedRanges: next, updatedAt: new Date().toISOString() };
};

/**
 * End the pause that covers "now" (typically because the user came back
 * early). Truncates the range to end yesterday, or drops it if it hadn't
 * started yet. Returns a new Habit.
 */
export const endActivePause = (habit: Habit): Habit => {
  const today = toKey(startOfDay(new Date()));
  const ranges = habit.pausedRanges ?? [];
  const next: HabitPauseRange[] = [];
  for (const r of ranges) {
    if (today < r.start) {
      // future pause — keep as is
      next.push(r);
    } else if (today > r.end) {
      // past pause — keep as history
      next.push(r);
    } else {
      // active — truncate to yesterday
      const yKey = toKey(addDays(parseISO(today), -1));
      if (yKey >= r.start) next.push({ ...r, end: yKey });
      // else the pause started today with 1-day length → drop entirely
    }
  }
  return { ...habit, pausedRanges: next, updatedAt: new Date().toISOString() };
};

/** Human label for a pause range. */
export const pauseLabel = (r: HabitPauseRange): string => {
  const reason =
    r.reason === 'sick' ? 'Sick day' : r.reason === 'other' ? 'Paused' : 'Vacation';
  if (r.start === r.end) return `${reason} · ${r.start}`;
  return `${reason} · ${r.start} → ${r.end}`;
};
