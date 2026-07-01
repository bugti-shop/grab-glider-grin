/**
 * Deadline-aware helpers for filters, sorts, and dashboard summaries.
 * `deadline` is a *hard* commitment (must be done by), distinct from
 * `dueDate` (calendar due) and `scheduledDate` (when you'll work on it).
 */

import type { TodoItem } from '@/types/note';

const ms = (d: Date | string | undefined): number =>
  d ? new Date(d).getTime() : Number.POSITIVE_INFINITY;

/** Time remaining until deadline in ms (negative if overdue). */
export const timeUntilDeadline = (t: TodoItem, now: Date = new Date()): number | null =>
  t.deadline ? new Date(t.deadline).getTime() - now.getTime() : null;

export const hasDeadline = (t: TodoItem): boolean => !!t.deadline;

/** Deadline has passed and the task isn't complete. */
export const isDeadlineOverdue = (t: TodoItem, now: Date = new Date()): boolean =>
  !!t.deadline && !t.completed && new Date(t.deadline).getTime() < now.getTime();

/** Deadline is within the next N hours (default: 24h). */
export const isDeadlineImminent = (
  t: TodoItem,
  hours = 24,
  now: Date = new Date(),
): boolean => {
  if (!t.deadline || t.completed) return false;
  const delta = new Date(t.deadline).getTime() - now.getTime();
  return delta >= 0 && delta <= hours * 3_600_000;
};

/** Sort tasks by deadline ascending (no deadline → last). Stable-friendly. */
export const sortByDeadlineAsc = (a: TodoItem, b: TodoItem): number => {
  const diff = ms(a.deadline) - ms(b.deadline);
  if (diff !== 0) return diff;
  // Tiebreak by dueDate then scheduledDate so lists stay predictable.
  return ms(a.dueDate) - ms(b.dueDate) || ms(a.scheduledDate) - ms(b.scheduledDate);
};

export const sortByDeadlineDesc = (a: TodoItem, b: TodoItem): number =>
  -sortByDeadlineAsc(a, b);

export type DeadlineFilter = 'all' | 'has-deadline' | 'overdue' | 'today' | 'this-week' | 'no-deadline';

export const filterByDeadline = (
  tasks: TodoItem[],
  filter: DeadlineFilter,
  now: Date = new Date(),
): TodoItem[] => {
  if (filter === 'all') return tasks;
  if (filter === 'no-deadline') return tasks.filter(t => !t.deadline);
  if (filter === 'has-deadline') return tasks.filter(t => !!t.deadline);
  if (filter === 'overdue') return tasks.filter(t => isDeadlineOverdue(t, now));
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay); endOfDay.setDate(endOfDay.getDate() + 1);
  if (filter === 'today') {
    return tasks.filter(t => t.deadline && new Date(t.deadline) >= startOfDay && new Date(t.deadline) < endOfDay);
  }
  // 'this-week'
  const endOfWeek = new Date(startOfDay);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  return tasks.filter(t => t.deadline && new Date(t.deadline) >= startOfDay && new Date(t.deadline) < endOfWeek);
};

/** Dashboard-ready summary counts. */
export const summarizeDeadlines = (tasks: TodoItem[], now: Date = new Date()) => {
  let overdue = 0, imminent = 0, thisWeek = 0, total = 0;
  const week = 7 * 24 * 3_600_000;
  for (const t of tasks) {
    if (!t.deadline || t.completed) continue;
    total++;
    const delta = new Date(t.deadline).getTime() - now.getTime();
    if (delta < 0) overdue++;
    else if (delta <= 24 * 3_600_000) imminent++;
    else if (delta <= week) thisWeek++;
  }
  return { overdue, imminent, thisWeek, total };
};
