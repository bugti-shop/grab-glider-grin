/**
 * Timezone-consistent day helpers.
 * All operations resolve dates in the user's IANA timezone (from the browser)
 * so labels like "Today", "Tomorrow", "Saturday" stay stable across DST shifts
 * and never drift when a task's dueDate was authored in another zone.
 */

import i18n from '@/i18n';

export const getUserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** YYYY-MM-DD key for a date evaluated in the given IANA timezone. */
export const zonedDayKey = (date: Date, timeZone: string = getUserTimeZone()): string => {
  // en-CA formats as YYYY-MM-DD, sidestepping locale month/day ordering.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const y = parts.find(p => p.type === 'year')?.value ?? '1970';
  const m = parts.find(p => p.type === 'month')?.value ?? '01';
  const d = parts.find(p => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
};

/** Two dates fall on the same calendar day in the user's timezone. */
export const isSameZonedDay = (a: Date, b: Date, timeZone?: string): boolean =>
  zonedDayKey(a, timeZone) === zonedDayKey(b, timeZone);

/**
 * Produce a Date whose local wall-clock time is midnight of `dayOffset` days
 * from "now" in the user's timezone. Suitable for prefilling due dates.
 */
export const startOfZonedDay = (dayOffset = 0, base: Date = new Date(), timeZone: string = getUserTimeZone()): Date => {
  const key = zonedDayKey(new Date(base.getTime() + dayOffset * 86_400_000), timeZone);
  // Interpret the day key as a local midnight; matches what the rest of the
  // app stores when a user picks a date without a time.
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
};

/**
 * Localized weekday label for a date in the user's timezone.
 * i === 0 → "Today", i === 1 → "Tomorrow", else long weekday name.
 */
export const zonedDayLabel = (
  date: Date,
  offsetFromToday: number,
  t: (key: string, fallback?: string) => string,
  timeZone: string = getUserTimeZone(),
): string => {
  if (offsetFromToday === 0) return t('grouping.today', 'Today');
  if (offsetFromToday === 1) return t('grouping.tomorrow', 'Tomorrow');
  const locale = i18n.language || 'en';
  try {
    return new Intl.DateTimeFormat(locale, { timeZone, weekday: 'long' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en', { timeZone, weekday: 'long' }).format(date);
  }
};
