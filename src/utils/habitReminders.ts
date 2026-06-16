/**
 * Habit Reminder Scheduler
 * Daily local notifications for habits with reminder.time = "HH:mm".
 * Falls back to in-page web notifications + timers on non-native.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Habit } from '@/types/habit';
import { loadHabits } from '@/utils/habitStorage';

const hashStringToId = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 2147483647;
};

const webTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

const scheduleWebDailyTimer = (habit: Habit, when: Date) => {
  cancelWebDailyTimer(habit.id);
  const delay = when.getTime() - Date.now();
  if (delay <= 0) return;
  const t = setTimeout(async () => {
    webTimers.delete(habit.id);
    await fireHabitWebNotification(habit);
    if (habit.reminder?.enabled && habit.reminder.time) {
      scheduleWebDailyTimer(habit, nextOccurrence(habit.reminder.time));
    }
  }, delay);
  webTimers.set(habit.id, t);
};

const cancelWebDailyTimer = (habitId: string) => {
  const t = webTimers.get(habitId);
  if (t) {
    clearTimeout(t);
    webTimers.delete(habitId);
  }
};

export const scheduleHabitReminder = async (habit: Habit): Promise<void> => {
  await cancelHabitReminder(habit.id);
  if (!habit.reminder?.enabled || !habit.reminder.time) return;
  const when = nextOccurrence(habit.reminder.time);

  if (!Capacitor.isNativePlatform()) {
    scheduleWebDailyTimer(habit, when);
    return;
  }
  const id = hashStringToId(`habit-${habit.id}`);
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id,
        title: `${habit.emoji || '✅'} Habit Reminder`,
        body: habit.name,
        schedule: { on: { hour: when.getHours(), minute: when.getMinutes() }, allowWhileIdle: true },
        channelId: 'task-reminders',
        extra: { type: 'habit', habitId: habit.id },
      }],
    });
  } catch (e) {
    console.warn('[HabitReminder] schedule failed:', e);
  }
};

export const cancelHabitReminder = async (habitId: string): Promise<void> => {
  cancelWebDailyTimer(habitId);
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: hashStringToId(`habit-${habitId}`) }] });
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
      if (h.reminder?.enabled && h.reminder.time) {
        await scheduleHabitReminder(h);
        restored++;
      }
    }
    if (restored) console.log(`[HabitReminder] Restored ${restored} habit reminder(s)`);
  } catch (e) {
    console.warn('[HabitReminder] restore failed:', e);
  }
};
