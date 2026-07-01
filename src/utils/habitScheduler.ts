/**
 * Smart rescheduling for habits.
 *
 * When a user misses a day, naive cadence math keeps showing the habit as
 * "missed forever" or skips ahead to the original cadence regardless of the
 * gap. Smart rescheduling shifts the next expected check-in based on the
 * most recent activity so users can resume without their schedule fighting
 * them.
 *
 * Rules
 * -----
 * 1. daily            → always due.
 * 2. weekly + days[]  → due on listed weekdays. If the previous scheduled
 *                       weekday was missed and not yet "made up", surface a
 *                       one-day carry-over so today can clear yesterday.
 * 3. weekly + count   → already adaptive (quota-based); unchanged.
 * 4. interval (N)     → cadence anchors on the most recent completion (or
 *                       start date if none). Missing a day pushes the next
 *                       due date to lastCompletion + N, instead of locking
 *                       to the original startDate offset.
 */
import { Habit } from '@/types/habit';
import { isHabitPausedOn } from '@/utils/habitPause';
import { addDays, differenceInCalendarDays, format, parseISO, startOfDay, subDays } from 'date-fns';

const toKey = (d: Date) => format(d, 'yyyy-MM-dd');

const lastCompletionDate = (habit: Habit): Date | null => {
  const done = habit.completions
    .filter((c) => c.completed)
    .map((c) => parseISO(c.date).getTime());
  if (!done.length) return null;
  return new Date(Math.max(...done));
};

/** Days (>=0) since the last completion. null if never completed. */
export const daysSinceLastCompletion = (habit: Habit, ref: Date = new Date()): number | null => {
  const last = lastCompletionDate(habit);
  if (!last) return null;
  return differenceInCalendarDays(startOfDay(ref), startOfDay(last));
};

/**
 * The next date this habit is expected to be checked in, given smart shift.
 * Always >= today (never "stuck in the past").
 */
export const getNextDueDate = (habit: Habit, ref: Date = new Date()): Date => {
  const today = startOfDay(ref);

  if (habit.frequency === 'daily') return today;

  if (habit.frequency === 'weekly') {
    if (habit.weeklyDays?.length) {
      for (let i = 0; i < 14; i++) {
        const d = addDays(today, i);
        if (habit.weeklyDays.includes(d.getDay())) return d;
      }
      return today;
    }
    return today; // quota mode: always "today" until quota hits
  }

  if (habit.frequency === 'interval' && habit.intervalDays && habit.intervalDays >= 1) {
    const last = lastCompletionDate(habit);
    const anchor = last
      ? startOfDay(last)
      : habit.startDate
      ? startOfDay(parseISO(habit.startDate))
      : today;
    let next = addDays(anchor, habit.intervalDays);
    // If user already missed past the cadence, surface today as the next
    // opportunity instead of a stale past date.
    if (next < today) next = today;
    return next;
  }

  return today;
};

/**
 * Is the habit due to be checked in on `d` — with smart-shift rules.
 * Mirrors the legacy logic but folds in smart rescheduling.
 */
export const isHabitDueOnDate = (habit: Habit, d: Date): boolean => {
  const day = startOfDay(d);

  // Paused / vacation / sick day → not due (streak stays intact).
  if (isHabitPausedOn(habit, day)) return false;

  if (habit.frequency === 'daily') return true;

  if (habit.frequency === 'weekly') {
    if (habit.weeklyDays?.length) {
      if (habit.weeklyDays.includes(day.getDay())) return true;
      // Smart shift: if yesterday was a scheduled weekday but wasn't
      // completed, give the user one day of grace to make it up.
      const isToday = toKey(day) === toKey(new Date());
      if (isToday) {
        const yesterday = subDays(day, 1);
        if (habit.weeklyDays.includes(yesterday.getDay())) {
          const yKey = toKey(yesterday);
          const doneYesterday = habit.completions.some(
            (c) => c.date === yKey && c.completed,
          );
          if (!doneYesterday) return true;
        }
      }
      return false;
    }
    return true; // quota mode handled by caller
  }

  if (habit.frequency === 'interval' && habit.intervalDays && habit.intervalDays >= 1) {
    const last = lastCompletionDate(habit);
    if (!last) {
      // Never completed → due from startDate onwards on the cadence,
      // but allow today to count as a fresh start.
      if (!habit.startDate) return true;
      const start = startOfDay(parseISO(habit.startDate));
      if (day < start) return false;
      const diff = differenceInCalendarDays(day, start);
      return diff % habit.intervalDays === 0;
    }
    const lastStart = startOfDay(last);
    if (day <= lastStart) return toKey(day) === toKey(lastStart);
    const diff = differenceInCalendarDays(day, lastStart);
    return diff >= habit.intervalDays;
  }

  return true;
};

/** True if today's check-in is a "make-up" (was originally due yesterday). */
export const isMakeUpDay = (habit: Habit, d: Date = new Date()): boolean => {
  const day = startOfDay(d);
  if (habit.frequency === 'weekly' && habit.weeklyDays?.length) {
    if (habit.weeklyDays.includes(day.getDay())) return false;
    const yesterday = subDays(day, 1);
    if (!habit.weeklyDays.includes(yesterday.getDay())) return false;
    const yKey = toKey(yesterday);
    return !habit.completions.some((c) => c.date === yKey && c.completed);
  }
  if (habit.frequency === 'interval' && habit.intervalDays) {
    const last = lastCompletionDate(habit);
    if (!last) return false;
    const diff = differenceInCalendarDays(day, startOfDay(last));
    return diff > habit.intervalDays;
  }
  return false;
};
