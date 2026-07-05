import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { getNextReminderFire, formatReminderCountdown, type ReminderRecurring } from '@/utils/reminders/nextFire';

interface Props {
  time: Date | string | number;
  recurring: ReminderRecurring;
  daysOfWeek?: number[];
}

/**
 * Live-updating "next fire + countdown" label for a reminder.
 * Ticks every second when under a minute away, every 30s otherwise.
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
    return <span className="text-[11px] text-muted-foreground">No upcoming fire</span>;
  }
  return (
    <span className="text-[11px] text-muted-foreground">
      Next: {format(next, 'MMM d, h:mm a')} · in {formatReminderCountdown(next, now)}
    </span>
  );
};
