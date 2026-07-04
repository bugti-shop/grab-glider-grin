/**
 * Fresh Reminder Scheduler
 * Clean implementation using @capacitor/local-notifications
 * Handles scheduling/cancelling reminders for tasks and notes
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';

// Track scheduled urgent reminders for resume-check
const pendingUrgentReminders = new Map<string, { taskText: string; reminderTime: Date }>();

// Generate a stable numeric ID from a string ID
const hashStringToId = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash) % 2147483647;
};

// In-app urgent reminder timers (fires overlay directly, no notification tap needed)
const urgentTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Web reminder timers (for non-native platforms)
const webReminderTimers = new Map<string, ReturnType<typeof setTimeout>>();

const scheduleWebReminderTimer = async (
  id: string,
  type: 'task' | 'note',
  title: string,
  reminderTime: Date,
  isUrgent?: boolean
) => {
  // Clear existing timer
  cancelWebReminderTimer(id);

  const delay = reminderTime.getTime() - Date.now();
  if (delay <= 0) return;

  const timer = setTimeout(async () => {
    webReminderTimers.delete(id);
    console.log(`[Reminder] Web timer fired for ${type}:`, title);

    // Add to in-app notification store
    try {
      const { addNotification } = await import('@/utils/notificationStore');
      await addNotification({
        type: type === 'task' ? 'reminder' : 'note',
        title: isUrgent ? '🚨 Urgent Reminder' : type === 'task' ? '📋 Task Reminder' : '📝 Note Reminder',
        message: title,
        icon: isUrgent ? 'alert-triangle' : type === 'task' ? 'clock' : 'file-text',
        actionPath: type === 'task' ? '/todo/today' : '/notes',
      });
    } catch (e) {
      console.warn('[Reminder] Failed to add in-app notification:', e);
    }

    // Send web browser notification
    try {
      const { sendWebNotification, requestNotificationPermission } = await import('@/utils/webNotifications');
      await requestNotificationPermission();
      sendWebNotification(
        isUrgent ? '🚨 Urgent Reminder' : type === 'task' ? '📋 Task Reminder' : '📝 Note Reminder',
        { body: title, tag: `${type}-reminder-${id}`, requireInteraction: isUrgent }
      );
    } catch (e) {
      console.warn('[Reminder] Failed to send web notification:', e);
    }
  }, delay);

  webReminderTimers.set(id, timer);
  console.log(`[Reminder] Web timer set for ${type}:`, title, 'in', Math.round(delay / 1000), 'seconds');
};

const cancelWebReminderTimer = (id: string) => {
  const existing = webReminderTimers.get(id);
  if (existing) {
    clearTimeout(existing);
    webReminderTimers.delete(id);
  }
};

const scheduleUrgentInAppTimer = (taskId: string, taskText: string, reminderTime: Date) => {
  // Clear any existing timer for this task
  cancelUrgentInAppTimer(taskId);
  
  const delay = reminderTime.getTime() - Date.now();
  if (delay <= 0) return;
  
  const timer = setTimeout(() => {
    urgentTimers.delete(taskId);
    console.log('[Reminder] Urgent in-app timer fired for:', taskText);
    window.dispatchEvent(new CustomEvent('urgentReminderTriggered', {
      detail: {
        id: taskId,
        taskName: taskText,
        triggeredAt: new Date(),
        reminderTime: reminderTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
    }));
  }, delay);
  
  urgentTimers.set(taskId, timer);
  console.log('[Reminder] Urgent in-app timer set for', taskText, 'in', Math.round(delay / 1000), 'seconds');
};

const cancelUrgentInAppTimer = (taskId: string) => {
  const existing = urgentTimers.get(taskId);
  if (existing) {
    clearTimeout(existing);
    urgentTimers.delete(taskId);
  }
};

/**
 * Request notification permission (call once on app start)
 */
export const requestReminderPermission = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    // Request web notification permission
    try {
      const { requestNotificationPermission } = await import('@/utils/webNotifications');
      const result = await requestNotificationPermission();
      return result === 'granted';
    } catch {
      return false;
    }
  }
  
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === 'granted') return true;
    
    const result = await LocalNotifications.requestPermissions();
    return result.display === 'granted';
  } catch (e) {
    console.warn('[Reminder] Permission request failed:', e);
    return false;
  }
};

/**
 * Schedule a task reminder
 */
export const scheduleTaskReminder = async (
  taskId: string,
  taskText: string,
  reminderTime: Date,
  isUrgent?: boolean
): Promise<void> => {
  const now = new Date();
  if (reminderTime <= now) {
    console.log('[Reminder] Skipping past reminder for task:', taskText);
    return;
  }

  // For urgent reminders, ALWAYS set an in-app timer so it shows full-screen automatically
  if (isUrgent) {
    scheduleUrgentInAppTimer(taskId, taskText, reminderTime);
  }

  if (!Capacitor.isNativePlatform()) {
    // Schedule web timer for browser notifications + in-app notification
    scheduleWebReminderTimer(taskId, 'task', taskText, reminderTime, isUrgent);
    return;
  }

  const notifId = hashStringToId(`task-${taskId}`);

  try {
    await cancelTaskReminder(taskId);
    // Re-set the in-app timer since cancelTaskReminder clears it
    if (isUrgent) {
      scheduleUrgentInAppTimer(taskId, taskText, reminderTime);
    }

    // Track for resume-check
    if (isUrgent) {
      pendingUrgentReminders.set(taskId, { taskText, reminderTime });
    }

    const notificationConfig: any = {
      id: notifId,
      title: isUrgent ? '🚨 URGENT Task Reminder' : '📋 Task Reminder',
      body: taskText,
      schedule: { at: reminderTime, allowWhileIdle: true },
      channelId: isUrgent ? 'urgent-task-reminders' : 'task-reminders',
      extra: { type: 'task', taskId, isUrgent: isUrgent ? 'true' : 'false' },
    };

    // Android: fullScreenIntent wakes screen & shows app even from background
    if (Capacitor.getPlatform() === 'android' && isUrgent) {
      notificationConfig.fullScreenIntent = true;
    }

    await LocalNotifications.schedule({ notifications: [notificationConfig] });

    console.log('[Reminder] Scheduled task reminder:', taskText, 'at', reminderTime.toLocaleString(), isUrgent ? '(URGENT)' : '');
  } catch (e) {
    console.error('[Reminder] Failed to schedule task reminder:', e);
  }
};

/**
 * Cancel a task reminder
 */
export const cancelTaskReminder = async (taskId: string): Promise<void> => {
  // Always cancel the in-app urgent timer and web timer
  cancelUrgentInAppTimer(taskId);
  cancelWebReminderTimer(taskId);
  pendingUrgentReminders.delete(taskId);

  if (!Capacitor.isNativePlatform()) return;

  const notifId = hashStringToId(`task-${taskId}`);
  try {
    await LocalNotifications.cancel({ notifications: [{ id: notifId }] });
  } catch (e) {
    console.warn('[Reminder] Cancel task reminder failed:', e);
  }
};

/**
 * Schedule a note reminder
 */
export const scheduleNoteReminder = async (
  noteId: string,
  noteTitle: string,
  reminderTime: Date
): Promise<void> => {
  if (!Capacitor.isNativePlatform()) {
    const now = new Date();
    if (reminderTime <= now) {
      console.log('[Reminder] Skipping past reminder for note:', noteTitle);
      return;
    }
    scheduleWebReminderTimer(noteId, 'note', noteTitle || 'You have a note reminder', reminderTime);
    return;
  }

  const now = new Date();
  if (reminderTime <= now) {
    console.log('[Reminder] Skipping past reminder for note:', noteTitle);
    return;
  }

  const notifId = hashStringToId(`note-${noteId}`);

  try {
    await cancelNoteReminder(noteId);

    await LocalNotifications.schedule({
      notifications: [{
        id: notifId,
        title: '📝 Note Reminder',
        body: noteTitle || 'You have a note reminder',
        schedule: { at: reminderTime, allowWhileIdle: true },
        channelId: 'note-reminders',
        extra: { type: 'note', noteId },
      }],
    });

    console.log('[Reminder] Scheduled note reminder:', noteTitle, 'at', reminderTime.toLocaleString());
  } catch (e) {
    console.error('[Reminder] Failed to schedule note reminder:', e);
  }
};

/**
 * Cancel a note reminder
 */
export const cancelNoteReminder = async (noteId: string): Promise<void> => {
  cancelWebReminderTimer(noteId);
  
  if (!Capacitor.isNativePlatform()) return;

  const notifId = hashStringToId(`note-${noteId}`);
  try {
    await LocalNotifications.cancel({ notifications: [{ id: notifId }] });
  } catch (e) {
    console.warn('[Reminder] Cancel note reminder failed:', e);
  }
};

// ========== Extra reminders (independent of dueDate / reminderTime) ==========

export type ExtraReminderRecurring = 'none' | 'hourly' | 'daily' | 'weekly' | 'monthly';

const extraTimers = new Map<string, ReturnType<typeof setTimeout>>();
const extraReminderKey = (taskId: string) => `extra-${taskId}`;
const extraItemKey = (taskId: string, itemId: string) => `extra-${taskId}-${itemId}`;

/**
 * Advance a date to the next occurrence for the given recurrence pattern.
 * Does NOT compare against `now`; the caller is expected to loop until the
 * result lies in the future.
 */
const advanceOnce = (d: Date, recurring: ExtraReminderRecurring): Date => {
  const next = new Date(d);
  if (recurring === 'hourly') next.setHours(next.getHours() + 1);
  else if (recurring === 'daily') next.setDate(next.getDate() + 1);
  else if (recurring === 'weekly') next.setDate(next.getDate() + 7);
  else if (recurring === 'monthly') next.setMonth(next.getMonth() + 1);
  return next;
};

/**
 * Compute the next occurrence of an extra reminder.
 * For 'none' returns null when in the past. For recurring, rolls forward
 * until the resulting date is in the future. When `daysOfWeek` is provided
 * the next occurrence is additionally rolled forward one day at a time until
 * it lands on an allowed weekday.
 */
export const computeNextExtraReminder = (
  from: Date,
  recurring: ExtraReminderRecurring,
  now: Date = new Date(),
  daysOfWeek?: number[]
): Date | null => {
  let next = new Date(from);
  if (recurring === 'none') {
    return next.getTime() > now.getTime() ? next : null;
  }
  const allowedDays = daysOfWeek && daysOfWeek.length > 0 && daysOfWeek.length < 7
    ? new Set(daysOfWeek)
    : null;
  // Safety cap to avoid runaway loops.
  let guard = 0;
  while (guard < 10000) {
    const inFuture = next.getTime() > now.getTime();
    const dayOk = !allowedDays || allowedDays.has(next.getDay());
    if (inFuture && dayOk) return next;
    next = advanceOnce(next, recurring);
    guard++;
  }
  return null;
};


const persistExtraReminderTime = async (taskId: string, newTime: Date | null) => {
  try {
    const { loadTodoItems, saveTodoItems } = await import('@/utils/todoItemsStorage');
    const items = await loadTodoItems();
    let changed = false;
    const updated = items.map((it) => {
      if (it.id !== taskId) return it;
      if (newTime) {
        changed = true;
        return { ...it, extraReminderTime: newTime };
      }
      // clear one-shot
      if (it.extraReminderTime || it.extraReminderRecurring) {
        changed = true;
        const { extraReminderTime, extraReminderRecurring, extraReminderNotificationId, ...rest } = it;
        return rest as typeof it;
      }
      return it;
    });
    if (changed) {
      await saveTodoItems(updated);
      window.dispatchEvent(new CustomEvent('todoItemsUpdated'));
    }
  } catch (e) {
    console.warn('[Reminder] Failed to persist extra reminder update:', e);
  }
};

const fireExtraReminderEffects = async (
  taskId: string,
  taskText: string,
  reminderTime: Date
) => {
  try {
    const { addNotification } = await import('@/utils/notificationStore');
    await addNotification({
      type: 'reminder',
      title: '⏰ Extra Reminder',
      message: taskText,
      icon: 'bell',
      actionPath: '/todo/today',
    });
  } catch (e) {
    console.warn('[Reminder] Failed to add extra reminder notification:', e);
  }
  try {
    const { sendWebNotification, requestNotificationPermission } = await import('@/utils/webNotifications');
    await requestNotificationPermission();
    sendWebNotification('⏰ Extra Reminder', {
      body: taskText,
      tag: `extra-reminder-${taskId}`,
    });
  } catch (e) {
    console.warn('[Reminder] Failed to send extra reminder web notification:', e);
  }
};

const scheduleExtraWebTimer = (
  taskId: string,
  taskText: string,
  reminderTime: Date,
  recurring: ExtraReminderRecurring
) => {
  const key = extraReminderKey(taskId);
  const existing = extraTimers.get(key);
  if (existing) clearTimeout(existing);

  const delay = reminderTime.getTime() - Date.now();
  if (delay <= 0) return;

  const timer = setTimeout(async () => {
    extraTimers.delete(key);
    await fireExtraReminderEffects(taskId, taskText, reminderTime);

    if (recurring !== 'none') {
      // Re-schedule for the next occurrence and persist the new time.
      const next = computeNextExtraReminder(reminderTime, recurring);
      if (next) {
        await persistExtraReminderTime(taskId, next);
        scheduleExtraWebTimer(taskId, taskText, next, recurring);
      }
    } else {
      // One-shot fired — clear stored time so UI shows it cleanly.
      await persistExtraReminderTime(taskId, null);
    }
  }, delay);

  extraTimers.set(key, timer);
};

/**
 * Schedule an extra reminder (independent from dueDate / reminderTime).
 * Returns the actual scheduled time (recurring patterns may roll forward
 * if the chosen time is already in the past).
 */
export const scheduleExtraReminder = async (
  taskId: string,
  taskText: string,
  desiredTime: Date,
  recurring: ExtraReminderRecurring = 'none'
): Promise<Date | null> => {
  await cancelExtraReminder(taskId);

  const next = computeNextExtraReminder(desiredTime, recurring);
  if (!next) return null;

  if (!Capacitor.isNativePlatform()) {
    scheduleExtraWebTimer(taskId, taskText, next, recurring);
    return next;
  }

  // Web timer still drives recurring re-scheduling on native too,
  // since native scheduled notifications don't re-write the task field.
  scheduleExtraWebTimer(taskId, taskText, next, recurring);

  const notifId = hashStringToId(`extra-${taskId}`);
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: notifId,
        title: '⏰ Extra Reminder',
        body: taskText,
        schedule: { at: next, allowWhileIdle: true },
        channelId: 'task-reminders',
        extra: { type: 'extra-reminder', taskId },
      }],
    });
  } catch (e) {
    console.warn('[Reminder] Failed to schedule native extra reminder:', e);
  }
  return next;
};

/**
 * Cancel an extra reminder for a task.
 */
export const cancelExtraReminder = async (taskId: string): Promise<void> => {
  const key = extraReminderKey(taskId);
  const t = extraTimers.get(key);
  if (t) {
    clearTimeout(t);
    extraTimers.delete(key);
  }
  if (!Capacitor.isNativePlatform()) return;
  const notifId = hashStringToId(`extra-${taskId}`);
  try {
    await LocalNotifications.cancel({ notifications: [{ id: notifId }] });
  } catch (e) {
    console.warn('[Reminder] Cancel extra reminder failed:', e);
  }
};

// ---------- Multi-item extra reminders (Pro) ----------

const scheduleExtraItemWebTimer = (
  taskId: string,
  taskText: string,
  itemId: string,
  reminderTime: Date,
  recurring: ExtraReminderRecurring,
  daysOfWeek?: number[]
) => {
  const key = extraItemKey(taskId, itemId);
  const existing = extraTimers.get(key);
  if (existing) clearTimeout(existing);
  const delay = reminderTime.getTime() - Date.now();
  if (delay <= 0) return;
  const timer = setTimeout(async () => {
    extraTimers.delete(key);
    await fireExtraReminderEffects(taskId, taskText, reminderTime);
    if (recurring !== 'none') {
      const seed = advanceOnce(reminderTime, recurring);
      const next = computeNextExtraReminder(seed, recurring, new Date(), daysOfWeek);
      if (next) {
        scheduleExtraItemWebTimer(taskId, taskText, itemId, next, recurring, daysOfWeek);
      }
    }
  }, delay);
  extraTimers.set(key, timer);
};

/**
 * Schedule a list of extra reminders for a single task. Cancels all previous
 * item-level timers/notifications for the task first. The legacy single
 * `scheduleExtraReminder` remains for backward compatibility with the first
 * item (mirrored into legacy task fields).
 */
export const scheduleExtraRemindersList = async (
  taskId: string,
  taskText: string,
  items: Array<{ id: string; time: Date; recurring: ExtraReminderRecurring; daysOfWeek?: number[] }>
): Promise<void> => {
  await cancelAllExtraReminders(taskId);
  for (const it of items) {
    const first = computeNextExtraReminder(new Date(it.time), it.recurring, new Date(), it.daysOfWeek);
    if (!first) continue;
    scheduleExtraItemWebTimer(taskId, taskText, it.id, first, it.recurring, it.daysOfWeek);
    if (Capacitor.isNativePlatform()) {
      const notifId = hashStringToId(extraItemKey(taskId, it.id));
      try {
        await LocalNotifications.schedule({
          notifications: [{
            id: notifId,
            title: '⏰ Extra Reminder',
            body: taskText,
            schedule: { at: first, allowWhileIdle: true },
            channelId: 'task-reminders',
            extra: { type: 'extra-reminder', taskId, itemId: it.id },
          }],
        });
      } catch (e) {
        console.warn('[Reminder] Failed to schedule native extra reminder item:', e);
      }
    }
  }
};

/**
 * Cancel every scheduled extra reminder (legacy + multi-item) for a task.
 */
export const cancelAllExtraReminders = async (taskId: string): Promise<void> => {
  await cancelExtraReminder(taskId);
  const prefix = `extra-${taskId}-`;
  const toCancelIds: number[] = [];
  for (const key of Array.from(extraTimers.keys())) {
    if (!key.startsWith(prefix)) continue;
    const t = extraTimers.get(key);
    if (t) clearTimeout(t);
    extraTimers.delete(key);
    toCancelIds.push(hashStringToId(key));
  }
  if (Capacitor.isNativePlatform() && toCancelIds.length > 0) {
    try {
      await LocalNotifications.cancel({ notifications: toCancelIds.map((id) => ({ id })) });
    } catch (e) {
      console.warn('[Reminder] Cancel multi extra reminders failed:', e);
    }
  }
};

const restoreExtraReminderTimers = async (): Promise<void> => {
  try {
    const { loadTodoItems } = await import('@/utils/todoItemsStorage');
    const items = await loadTodoItems();
    let restored = 0;
    for (const item of items) {
      if (!item.extraReminderTime || item.completed) continue;
      const recurring = (item.extraReminderRecurring || 'none') as ExtraReminderRecurring;
      const scheduled = await scheduleExtraReminder(
        item.id,
        item.text,
        new Date(item.extraReminderTime),
        recurring
      );
      if (scheduled) restored++;
    }
    if (restored > 0) {
      console.log(`[Reminder] Restored ${restored} extra reminder(s)`);
    }
  } catch (e) {
    console.warn('[Reminder] Failed to restore extra reminders:', e);
  }
};


/**
 * Create notification channels (call once on app init, Android only)
 */
export const createReminderChannels = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  if (Capacitor.getPlatform() !== 'android') return;

  try {
    await LocalNotifications.createChannel({
      id: 'task-reminders',
      name: 'Task Reminders',
      description: 'Reminders for your tasks',
      importance: 4, // HIGH
      visibility: 1, // PUBLIC
      vibration: true,
      sound: 'default',
    });

    await LocalNotifications.createChannel({
      id: 'urgent-task-reminders',
      name: 'Urgent Task Reminders',
      description: 'Urgent full-screen reminders for critical tasks',
      importance: 5, // MAX
      visibility: 1, // PUBLIC
      vibration: true,
      sound: 'default',
    });

    await LocalNotifications.createChannel({
      id: 'note-reminders',
      name: 'Note Reminders',
      description: 'Reminders for your notes',
      importance: 4,
      visibility: 1,
      vibration: true,
      sound: 'default',
    });

    console.log('[Reminder] Notification channels created');
  } catch (e) {
    console.warn('[Reminder] Channel creation failed:', e);
  }
};

/**
 * Initialize the reminder system (call once on app start)
 */
export const initializeReminders = async (): Promise<void> => {
  // Always restore urgent in-app timers (works on both web and native)
  restoreUrgentTimers().catch(console.warn);
  // Restore web reminder timers for all tasks with reminders
  restoreWebReminderTimers().catch(console.warn);
  // Restore extra (independent) reminders + their recurring chain
  restoreExtraReminderTimers().catch(console.warn);

  if (!Capacitor.isNativePlatform()) {
    // Request web notification permission after a short delay
    setTimeout(() => requestReminderPermission(), 2000);
    return;
  }

  await createReminderChannels();
  
  // Listen for notification received events to trigger urgent overlay IMMEDIATELY (full-screen)
  LocalNotifications.addListener('localNotificationReceived', (notification) => {
    if (notification.extra?.isUrgent === 'true') {
      window.dispatchEvent(new CustomEvent('urgentReminderTriggered', {
        detail: {
          id: notification.extra.taskId,
          taskName: notification.body || 'Urgent Task',
          triggeredAt: new Date(),
        }
      }));
    }
  });

  // Also listen for notification action (when user taps the notification)
  LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    if (action.notification.extra?.isUrgent === 'true') {
      window.dispatchEvent(new CustomEvent('urgentReminderTriggered', {
        detail: {
          id: action.notification.extra.taskId,
          taskName: action.notification.body || 'Urgent Task',
          triggeredAt: new Date(),
        }
      }));
    }
  });

  // Listen for app resume — check if any urgent reminders were missed while in background
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      checkMissedUrgentReminders();
      // Also restore any timers that were killed while backgrounded
      restoreUrgentTimers().catch(console.warn);
    }
  });

  // Request permission after a short delay
  setTimeout(async () => {
    await requestReminderPermission();
  }, 1500);
};

/**
 * Restore urgent in-app timers from stored tasks
 * Called on app start and app resume to ensure timers survive app restarts
 */
/**
 * Restore web reminder timers for all tasks with future reminders
 * Called on app start to ensure timers survive page refreshes
 */
const restoreWebReminderTimers = async (): Promise<void> => {
  if (Capacitor.isNativePlatform()) return;
  
  try {
    const { loadTodoItems } = await import('@/utils/todoItemsStorage');
    const items = await loadTodoItems();
    const now = new Date();
    let restored = 0;

    for (const item of items) {
      if (item.reminderTime && !item.completed) {
        const reminderDate = new Date(item.reminderTime);
        if (reminderDate > now) {
          scheduleWebReminderTimer(item.id, 'task', item.text, reminderDate, item.isUrgent);
          restored++;
        }
      }
    }

    if (restored > 0) {
      console.log(`[Reminder] Restored ${restored} web reminder timer(s)`);
    }
  } catch (e) {
    console.warn('[Reminder] Failed to restore web timers:', e);
  }
};

const restoreUrgentTimers = async (): Promise<void> => {
  try {
    const { loadTodoItems } = await import('@/utils/todoItemsStorage');
    const items = await loadTodoItems();
    const now = new Date();
    let restored = 0;

    for (const item of items) {
      if (item.isUrgent && item.reminderTime && !item.completed) {
        const reminderDate = new Date(item.reminderTime);
        if (reminderDate > now) {
          scheduleUrgentInAppTimer(item.id, item.text, reminderDate);
          // Also track for resume-check
          pendingUrgentReminders.set(item.id, { taskText: item.text, reminderTime: reminderDate });
          restored++;
        }
      }
    }

    if (restored > 0) {
      console.log(`[Reminder] Restored ${restored} urgent in-app timer(s)`);
    }
  } catch (e) {
    console.warn('[Reminder] Failed to restore urgent timers:', e);
  }
};

/**
 * Check if any urgent reminders fired while app was in background
 * If so, trigger the full-screen overlay immediately on resume
 */
const checkMissedUrgentReminders = () => {
  const now = Date.now();
  for (const [taskId, { taskText, reminderTime }] of pendingUrgentReminders) {
    if (reminderTime.getTime() <= now) {
      console.log('[Reminder] Missed urgent reminder detected on resume:', taskText);
      pendingUrgentReminders.delete(taskId);
      // Fire the full-screen overlay immediately
      window.dispatchEvent(new CustomEvent('urgentReminderTriggered', {
        detail: {
          id: taskId,
          taskName: taskText,
          triggeredAt: new Date(),
          reminderTime: reminderTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
      }));
      break; // Show one at a time
    }
  }
};
