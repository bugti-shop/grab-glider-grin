/**
 * Persistent ongoing notification for background Focus sessions.
 *
 * Behavior:
 * - When the user chooses "Run in Background", we post an ongoing (non-dismissible)
 *   Android notification showing the remaining time. Tapping it reopens the app.
 * - A second notification is scheduled at the exact end time to alert completion.
 * - The ongoing notification is cancelled when the user exits, ends, or the
 *   session completes.
 *
 * Uses @capacitor/local-notifications with Android `ongoing: true` extra
 * (supported by the plugin's Android Notification.Builder pass-through).
 */
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor, registerPlugin } from '@capacitor/core';

const ONGOING_ID = 918273; // arbitrary stable id
const COMPLETE_ID = 918274;

const isNative = () => Capacitor.isNativePlatform();

const FocusTimerNative = registerPlugin<{
  start(opts: { taskTitle?: string; remainingSec: number; endAtMs?: number; running: boolean; soundUrl?: string; soundVolume?: number }): Promise<{ ok: boolean }>;
  stop(): Promise<{ ok: boolean }>;
}>('FocusTimerNative');

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${m}:${String(r).padStart(2, '0')}`;
};

export interface FocusOngoingOpts {
  taskTitle?: string;
  remainingSec: number;
  endAtMs?: number;   // when running
  running: boolean;
  soundUrl?: string;
  soundVolume?: number;
}

let lastPostedLabel = '';

export const showFocusOngoing = async (opts: FocusOngoingOpts) => {
  if (!isNative()) return;
  try {
    // Android real foreground service: survives closing the sheet/app and
    // keeps the timer in the notification shade until Exit/complete.
    try {
      await FocusTimerNative.start({
        taskTitle: opts.taskTitle,
        remainingSec: opts.remainingSec,
        endAtMs: opts.endAtMs,
        running: opts.running,
      });
      return;
    } catch {}

    // Ensure permission (usually already granted; harmless if not)
    try { await LocalNotifications.requestPermissions(); } catch {}

    const title = opts.running ? '🎯 Focus running' : '⏸ Focus paused';
    const body = `${fmt(opts.remainingSec)} remaining${opts.taskTitle ? ` · ${opts.taskTitle}` : ''}`;

    // Cancel/replace to avoid duplicate stacked notifications
    if (lastPostedLabel && lastPostedLabel !== body + title) {
      try { await LocalNotifications.cancel({ notifications: [{ id: ONGOING_ID }] }); } catch {}
    }

    await LocalNotifications.schedule({
      notifications: [{
        id: ONGOING_ID,
        title,
        body,
        smallIcon: 'ic_stat_notify',
        ongoing: true,
        autoCancel: false,
        // Fire immediately
        schedule: { at: new Date(Date.now() + 100) },
        extra: { focusOngoing: true },
      }],
    });
    lastPostedLabel = body + title;

    // Schedule the completion notification for the exact end time
    if (opts.running && opts.endAtMs && opts.endAtMs > Date.now()) {
      try {
        await LocalNotifications.schedule({
          notifications: [{
            id: COMPLETE_ID,
            title: '✅ Focus complete',
            body: `Great work!${opts.taskTitle ? ` · ${opts.taskTitle}` : ''}`,
            smallIcon: 'ic_stat_notify',
            schedule: { at: new Date(opts.endAtMs) },
          }],
        });
      } catch {}
    }
  } catch (err) {
    console.warn('[focusPersistentNotification] show failed', err);
  }
};

export const hideFocusOngoing = async () => {
  lastPostedLabel = '';
  if (!isNative()) return;
  try {
    try { await FocusTimerNative.stop(); } catch {}
    await LocalNotifications.cancel({
      notifications: [{ id: ONGOING_ID }, { id: COMPLETE_ID }],
    });
  } catch {}
};
