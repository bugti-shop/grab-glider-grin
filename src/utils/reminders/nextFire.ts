/**
 * Compute the next fire time for a reminder given its base time and recurrence.
 * Supports: none, hourly, daily, weekly (with daysOfWeek), monthly.
 */
export type ReminderRecurring = 'none' | 'hourly' | 'daily' | 'weekly' | 'monthly' | string;

export function getNextReminderFire(
  base: Date | string | number,
  recurring: ReminderRecurring,
  daysOfWeek?: number[],
  now: Date = new Date()
): Date | null {
  const baseDate = new Date(base);
  if (isNaN(baseDate.getTime())) return null;
  const nowMs = now.getTime();

  if (!recurring || recurring === 'none') {
    return baseDate.getTime() > nowMs ? baseDate : null;
  }

  const hh = baseDate.getHours();
  const mm = baseDate.getMinutes();
  const cursor = new Date(now);

  switch (recurring) {
    case 'hourly': {
      const next = new Date(now);
      next.setSeconds(0, 0);
      next.setMinutes(mm);
      if (next.getTime() <= nowMs) next.setHours(next.getHours() + 1);
      return next;
    }
    case 'daily': {
      // Iterate up to 8 days to satisfy optional daysOfWeek filter.
      for (let i = 0; i < 8; i++) {
        const candidate = new Date(cursor);
        candidate.setDate(candidate.getDate() + i);
        candidate.setHours(hh, mm, 0, 0);
        if (candidate.getTime() <= nowMs) continue;
        if (daysOfWeek && daysOfWeek.length > 0 && !daysOfWeek.includes(candidate.getDay())) continue;
        return candidate;
      }
      return null;
    }
    case 'weekly': {
      const days = daysOfWeek && daysOfWeek.length > 0 ? daysOfWeek : [baseDate.getDay()];
      for (let i = 0; i < 14; i++) {
        const candidate = new Date(cursor);
        candidate.setDate(candidate.getDate() + i);
        candidate.setHours(hh, mm, 0, 0);
        if (candidate.getTime() <= nowMs) continue;
        if (!days.includes(candidate.getDay())) continue;
        return candidate;
      }
      return null;
    }
    case 'monthly': {
      const day = baseDate.getDate();
      for (let i = 0; i < 3; i++) {
        const candidate = new Date(now.getFullYear(), now.getMonth() + i, day, hh, mm, 0, 0);
        if (candidate.getTime() > nowMs) return candidate;
      }
      return null;
    }
    default:
      return baseDate.getTime() > nowMs ? baseDate : null;
  }
}

/**
 * Format a duration between now and target as a compact countdown, e.g. "2d 3h", "45m", "in 12s".
 */
export function formatReminderCountdown(target: Date, now: Date = new Date()): string {
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return 'now';
  const s = Math.floor(diff / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}
