/**
 * Countdown reminder scheduler.
 * Mirrors habitReminders.ts pattern — uses @capacitor/local-notifications on
 * native, and falls back to in-app + web notifications on web.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import {
  CountdownEvent,
  ReminderOffset,
  getNextOccurrence,
  loadCountdowns,
} from './countdownStorage';

const webTimers = new Map<string, ReturnType<typeof setTimeout>[]>();

const hashStringToId = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 2147483647;
};

const reminderKey = (eventId: string, offset: ReminderOffset) =>
  hashStringToId(`countdown-${eventId}-${offset}`);

const cancelWebTimers = (id: string) => {
  const arr = webTimers.get(id);
  if (arr) {
    arr.forEach((t) => clearTimeout(t));
    webTimers.delete(id);
  }
};

const fireWebNotification = async (event: CountdownEvent, daysOut: number) => {
  const label =
    daysOut === 0 ? 'Today' : daysOut === 1 ? 'Tomorrow' : `In ${daysOut} days`;
  try {
    const { addNotification } = await import('@/utils/notificationStore');
    await addNotification({
      type: 'reminder',
      title: `⏳ ${event.name}`,
      message: label,
      icon: 'bell',
      actionPath: '/todo/countdown',
    });
  } catch {}
  try {
    const { sendWebNotification, requestNotificationPermission } = await import(
      '@/utils/webNotifications'
    );
    await requestNotificationPermission();
    sendWebNotification(`⏳ ${event.name}`, {
      body: label,
      tag: `countdown-${event.id}-${daysOut}`,
    });
  } catch {}
};

/** Compute the fire-time Date for a given reminder offset. */
const computeFireTime = (event: CountdownEvent, offset: ReminderOffset): Date => {
  const target = getNextOccurrence(event);
  const fire = new Date(target);
  fire.setDate(fire.getDate() - offset);
  const [h, m] = (event.reminderTime || '09:00').split(':').map(Number);
  fire.setHours(h || 9, m || 0, 0, 0);
  return fire;
};

export const cancelCountdownReminders = async (eventId: string): Promise<void> => {
  cancelWebTimers(eventId);
  if (!Capacitor.isNativePlatform()) return;
  // Cancel all known offsets (covers any previously-scheduled value).
  const offsets: ReminderOffset[] = [0, 1, 2, 3, 7, 14, 30];
  try {
    await LocalNotifications.cancel({
      notifications: offsets.map((o) => ({ id: reminderKey(eventId, o) })),
    });
  } catch {}
};

export const scheduleCountdownReminders = async (
  event: CountdownEvent
): Promise<void> => {
  await cancelCountdownReminders(event.id);
  if (event.completed) return;
  const offsets = event.reminderOffsets ?? [];
  if (offsets.length === 0) return;

  const now = Date.now();

  if (!Capacitor.isNativePlatform()) {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const offset of offsets) {
      const fire = computeFireTime(event, offset);
      const delay = fire.getTime() - now;
      if (delay <= 0) continue;
      // Cap setTimeout at ~24.8 days; longer reminders rely on app reopen-restore.
      if (delay > 2_000_000_000) continue;
      const t = setTimeout(() => {
        void fireWebNotification(event, offset);
      }, delay);
      timers.push(t);
    }
    if (timers.length) webTimers.set(event.id, timers);
    return;
  }

  const toSchedule = offsets
    .map((offset) => {
      const at = computeFireTime(event, offset);
      if (at.getTime() <= now) return null;
      const label =
        offset === 0
          ? 'Today'
          : offset === 1
          ? 'Tomorrow'
          : `In ${offset} days`;
      return {
        id: reminderKey(event.id, offset),
        title: `⏳ ${event.name}`,
        body: label,
        schedule: { at, allowWhileIdle: true },
        channelId: 'task-reminders',
        extra: { type: 'countdown', countdownId: event.id, offset },
      };
    })
    .filter(Boolean) as Parameters<
      typeof LocalNotifications.schedule
    >[0]['notifications'];

  if (toSchedule.length === 0) return;

  try {
    await LocalNotifications.schedule({ notifications: toSchedule });
  } catch (e) {
    console.warn('[CountdownReminder] schedule failed:', e);
  }
};

/** Reschedule everything (call on app start, after edits, after marking done). */
export const restoreCountdownReminders = async (): Promise<void> => {
  try {
    const list = await loadCountdowns();
    let restored = 0;
    for (const c of list) {
      if (c.completed) continue;
      if (!c.reminderOffsets || c.reminderOffsets.length === 0) continue;
      await scheduleCountdownReminders(c);
      restored++;
    }
    if (restored)
      console.log(`[CountdownReminder] Restored ${restored} countdown reminder(s)`);
  } catch (e) {
    console.warn('[CountdownReminder] restore failed:', e);
  }
};
