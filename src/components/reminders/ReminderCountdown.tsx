import { useEffect, useState } from 'react';
import { getNextReminderFire, formatReminderCountdown, type ReminderRecurring } from '@/utils/reminders/nextFire';

interface Props {
  time: Date | string | number;
  recurring: ReminderRecurring;
  daysOfWeek?: number[];
}

const userTimeZone =
  typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: userTimeZone,
  timeZoneName: 'short',
});

/**
 * Live-updating "next fire + countdown" label for a reminder.
 * - Formats the fire time in the user's locale + timezone.
 * - Announces changes politely to screen readers via aria-live.
 */
export const ReminderCountdown = ({ time, recurring, daysOfWeek }: Props) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const next = getNextReminderFire(time, recurring, daysOfWeek, now);
    const diff = next ? next.getTime() - Date.now() : Infinity;
    const interval = diff < 60_000 ? 1000 : 30_000;
    const id = window.setInterval(() => setNow(new Date()), interval);
    return () => window.clearInterval(id);
  }, [time, recurring, daysOfWeek, now]);

  const next = getNextReminderFire(time, recurring, daysOfWeek, now);

  if (!next) {
    return (
      <span
        className="text-[11px] text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        No upcoming fire time
      </span>
    );
  }

  const formatted = dateFormatter.format(next);
  const countdown = formatReminderCountdown(next, now);
  const iso = next.toISOString();
  const srLabel = `Next reminder ${formatted}, in ${countdown}`;

  return (
    <span
      className="text-[11px] text-muted-foreground"
      role="status"
      aria-live="polite"
      aria-label={srLabel}
    >
      <span aria-hidden="true">
        <time dateTime={iso}>Next: {formatted}</time> · in {countdown}
      </span>
    </span>
  );
};
