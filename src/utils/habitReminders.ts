/**
 * Habit Reminder Scheduler
 * Schedules multiple daily local notifications per habit, optionally restricted
 * to specific weekdays. Falls back to in-page web timers on non-native.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Habit, HabitReminder, normalizeHabit } from '@/types/habit';
import { loadHabits } from '@/utils/habitStorage';

const hashStringToId = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 2147483647;
};

/** Map of timerKey → setTimeout handle, so we can cancel per habit. */
const webTimers = new Map<string, ReturnType<typeof setTimeout>>();
const timerKey = (habitId: string, idx: number, day: number) => `${habitId}#${idx}#${day}`;

/** Get the effective reminders array, normalizing legacy single `reminder`. */
const getReminders = (h: Habit): HabitReminder[] => {
  const n = normalizeHabit(h);
  return (n.reminders ?? []).filter((r) => r.enabled && !!r.time);
};

const fireHabitWebNotification = async (habit: Habit) => {
  try {
    const { addNotification } = await import('@/utils/notificationStore');
    await addNotification({
      type: 'reminder',
      title: `${habit.emoji || '✅'} Habit Reminder`,
      message: habit.name,
      icon: 'bell',
      actionPath: `/todo/habits/${habit.id}`,
    });
  } catch {}
  try {
    const { sendWebNotification, requestNotificationPermission } = await import('@/utils/webNotifications');
    await requestNotificationPermission();
    sendWebNotification(`${habit.emoji || '✅'} Habit Reminder`, {
      body: habit.name,
      tag: `habit-${habit.id}`,
    });
  } catch {}
};

/** Compute next occurrence of HH:mm in local time, after `from`. */
export const nextOccurrence = (timeHHmm: string, from: Date = new Date()): Date => {
  const [h, m] = timeHHmm.split(':').map(Number);
  const next = new Date(from);
  next.setHours(h || 0, m || 0, 0, 0);
  if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
  return next;
};

/** Next occurrence restricted to allowed weekdays (0=Sun..6=Sat). */
const nextOccurrenceOnDays = (timeHHmm: string, days: number[] | undefined, from: Date = new Date()): Date => {
  const allowed = days && days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6];
  let candidate = nextOccurrence(timeHHmm, from);
  for (let i = 0; i < 8; i++) {
    if (allowed.includes(candidate.getDay())) return candidate;
    candidate = new Date(candidate.getTime() + 86400000);
    candidate.setHours(...timeHHmm.split(':').map(Number) as [number, number], 0, 0);
  }
  return candidate;
};

const cancelWebTimersForHabit = (habitId: string) => {
  for (const [key, t] of webTimers) {
    if (key.startsWith(`${habitId}#`)) {
      clearTimeout(t);
      webTimers.delete(key);
    }
  }
};

const scheduleWebReminder = (habit: Habit, r: HabitReminder, idx: number) => {
  const fire = (when: Date) => {
    const key = timerKey(habit.id, idx, when.getDay());
    const old = webTimers.get(key);
    if (old) clearTimeout(old);
    const delay = when.getTime() - Date.now();
    if (delay <= 0) return;
    const t = setTimeout(async () => {
      webTimers.delete(key);
      await fireHabitWebNotification(habit);
      // Re-arm next valid day for this reminder.
      const next = nextOccurrenceOnDays(r.time, r.days, new Date(when.getTime() + 60_000));
      fire(next);
    }, delay);
    webTimers.set(key, t);
  };
  fire(nextOccurrenceOnDays(r.time, r.days));
};

export const scheduleHabitReminder = async (habit: Habit): Promise<void> => {
  await cancelHabitReminder(habit.id);
  const reminders = getReminders(habit);
  if (reminders.length === 0) return;

  if (!Capacitor.isNativePlatform()) {
    reminders.forEach((r, i) => scheduleWebReminder(habit, r, i));
    return;
  }

  // Native: one notification per reminder per allowed weekday.
  // Capacitor LocalNotifications uses weekday 1=Sun..7=Sat.
  const notifications: any[] = [];
  reminders.forEach((r, idx) => {
    const [hh, mm] = r.time.split(':').map(Number);
    const days = r.days && r.days.length > 0 ? r.days : [0, 1, 2, 3, 4, 5, 6];
    days.forEach((d) => {
      const id = hashStringToId(`habit-${habit.id}-${idx}-${d}`);
      notifications.push({
        id,
        title: `${habit.emoji || '✅'} Habit Reminder`,
        body: habit.name,
        schedule: {
          on: { weekday: d + 1, hour: hh || 0, minute: mm || 0 },
          allowWhileIdle: true,
          repeats: true,
        },
        channelId: 'task-reminders',
        extra: { type: 'habit', habitId: habit.id },
      });
    });
  });
  if (notifications.length === 0) return;
  try {
    await LocalNotifications.schedule({ notifications });
  } catch (e) {
    console.warn('[HabitReminder] schedule failed:', e);
  }
};

export const cancelHabitReminder = async (habitId: string): Promise<void> => {
  cancelWebTimersForHabit(habitId);
  if (!Capacitor.isNativePlatform()) return;
  try {
    // Cancel up to 10 reminder slots × 7 days = 70 potential IDs.
    const ids: { id: number }[] = [];
    for (let idx = 0; idx < 10; idx++) {
      for (let d = 0; d < 7; d++) {
        ids.push({ id: hashStringToId(`habit-${habitId}-${idx}-${d}`) });
      }
    }
    // Also clear the legacy single-id from the previous implementation.
    ids.push({ id: hashStringToId(`habit-${habitId}`) });
    await LocalNotifications.cancel({ notifications: ids });
  } catch {}
};

/** Fire a test notification ~3s from now (does not affect daily schedule). */
export const testHabitReminder = async (
  habitName: string,
  emoji?: string,
  delayMs = 3000
): Promise<void> => {
  const fakeHabit = { id: `test-${Date.now()}`, name: habitName, emoji: emoji || '✅' } as Habit;
  if (!Capacitor.isNativePlatform()) {
    setTimeout(() => { fireHabitWebNotification(fakeHabit); }, delayMs);
    return;
  }
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: hashStringToId(`habit-test-${Date.now()}`),
        title: `${fakeHabit.emoji} Test Reminder`,
        body: habitName,
        schedule: { at: new Date(Date.now() + delayMs), allowWhileIdle: true },
        channelId: 'task-reminders',
        extra: { type: 'habit-test' },
      }],
    });
  } catch (e) {
    console.warn('[HabitReminder] test failed:', e);
  }
};

/** Restore all habit reminders on app start (called from main.tsx). */
export const restoreHabitReminders = async (): Promise<void> => {
  try {
    const habits = await loadHabits();
    let restored = 0;
    for (const h of habits) {
      if (h.isArchived) continue;
      if (getReminders(h).length > 0) {
        await scheduleHabitReminder(h);
        restored++;
      }
    }
    if (restored) console.log(`[HabitReminder] Restored ${restored} habit reminder(s)`);
  } catch (e) {
    console.warn('[HabitReminder] restore failed:', e);
  }
};
