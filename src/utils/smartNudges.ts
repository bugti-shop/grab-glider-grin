/**
 * Smart Nudge System — Behavioral pattern-based notifications.
 * 
 * Tracks hourly/daily completion patterns and sends personalized nudges like:
 *   "You usually complete 3 tasks by now"
 *   "You're 2 tasks behind your average"
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { getSetting, setSetting } from './settingsStorage';
import { format } from 'date-fns';

// ─── Storage ───────────────────────────────────────────────
const NUDGE_DATA_KEY = 'flowist_smart_nudge_data';

export interface HourlyPattern {
  /** hour (0-23) → average completed tasks by that hour */
  avgByHour: Record<number, number>;
  /** day-level: total tasks each tracked day */
  dailyHistory: { date: string; total: number }[];
  /** today's running count */
  todayCount: number;
  todayDate: string;
}

const getDefault = (): HourlyPattern => ({
  avgByHour: {},
  dailyHistory: [],
  todayCount: 0,
  todayDate: format(new Date(), 'yyyy-MM-dd'),
});

export const loadNudgeData = async (): Promise<HourlyPattern> => {
  const data = await getSetting<HourlyPattern>(NUDGE_DATA_KEY, getDefault());
  const today = format(new Date(), 'yyyy-MM-dd');
  if (data.todayDate !== today) {
    // Archive yesterday
    if (data.todayDate && data.todayCount > 0) {
      data.dailyHistory.push({ date: data.todayDate, total: data.todayCount });
      // Keep last 30 days
      if (data.dailyHistory.length > 30) {
        data.dailyHistory = data.dailyHistory.slice(-30);
      }
    }
    data.todayCount = 0;
    data.todayDate = today;
    await setSetting(NUDGE_DATA_KEY, data);
  }
  return data;
};

/**
 * Record a task completion — updates hourly running average and today's count.
 */
export const recordNudgeCompletion = async (): Promise<void> => {
  const data = await loadNudgeData();
  const hour = new Date().getHours();

  data.todayCount += 1;

  // Update rolling average for this hour
  const prevAvg = data.avgByHour[hour] || 0;
  // Exponential moving average (alpha = 0.3)
  data.avgByHour[hour] = prevAvg * 0.7 + data.todayCount * 0.3;

  await setSetting(NUDGE_DATA_KEY, data);
};

/**
 * Get a contextual nudge message based on current behavior patterns.
 */
export const getNudgeMessage = async (): Promise<string | null> => {
  const data = await loadNudgeData();
  const hour = new Date().getHours();
  const avgByNow = Math.round(data.avgByHour[hour] || 0);

  if (avgByNow <= 0) return null;

  const diff = avgByNow - data.todayCount;

  if (diff > 0 && data.todayCount === 0) {
    return `You usually complete ${avgByNow} task${avgByNow > 1 ? 's' : ''} by now — get started! 🚀`;
  }
  if (diff > 0) {
    return `You're ${diff} task${diff > 1 ? 's' : ''} behind your average. Keep going! 💪`;
  }
  if (data.todayCount > avgByNow && avgByNow > 0) {
    return `You're ahead of your usual pace! Amazing work! 🔥`;
  }

  return null;
};

// ─── Native Nudge Notifications ────────────────────────────
const NUDGE_MORNING_ID = 998020;
const NUDGE_MIDDAY_ID = 998021;
const NUDGE_AFTERNOON_ID = 998022;
const NUDGE_CHANNEL = 'smart-nudges';

const createNudgeChannel = async (): Promise<void> => {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await LocalNotifications.createChannel({
      id: NUDGE_CHANNEL,
      name: 'Smart Nudges',
      description: 'Personalized productivity nudges based on your patterns',
      importance: 3,
      visibility: 1,
      vibration: false,
      sound: 'default',
    });
  } catch {}
};

/**
 * Schedule pattern-based nudge notifications for the day.
 * Sends 3 nudges at 9AM, 1PM, 5PM with contextual messages.
 */
export const scheduleSmartNudges = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await LocalNotifications.cancel({
      notifications: [
        { id: NUDGE_MORNING_ID },
        { id: NUDGE_MIDDAY_ID },
        { id: NUDGE_AFTERNOON_ID },
      ],
    });

    const data = await loadNudgeData();
    if (data.dailyHistory.length < 3) return; // Need enough data

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const notifications: any[] = [];

    const avgDaily = data.dailyHistory.reduce((s, d) => s + d.total, 0) / data.dailyHistory.length;

    // Morning nudge at 9AM
    const morning = new Date(today);
    morning.setHours(9, 0, 0, 0);
    if (now < morning) {
      const avgBy9 = Math.round(data.avgByHour[9] || 0);
      notifications.push({
        id: NUDGE_MORNING_ID,
        title: 'Good morning! ☀️',
        body: avgBy9 > 0
          ? `You usually have ${avgBy9} task${avgBy9 > 1 ? 's' : ''} done by now. Let's go!`
          : `Start your day strong! Your daily average is ${Math.round(avgDaily)} tasks.`,
        schedule: { at: morning, allowWhileIdle: true },
        channelId: NUDGE_CHANNEL,
        smallIcon: 'npd_notification_icon',
        iconColor: '#3B82F6',
        sound: 'default',
      });
    }

    // Midday nudge at 1PM
    const midday = new Date(today);
    midday.setHours(13, 0, 0, 0);
    if (now < midday) {
      const avgBy13 = Math.round(data.avgByHour[13] || 0);
      notifications.push({
        id: NUDGE_MIDDAY_ID,
        title: 'Midday check-in 📊',
        body: avgBy13 > 0
          ? `By 1 PM you usually have ${avgBy13} tasks done. How are you doing?`
          : `Halfway through the day — keep the momentum going!`,
        schedule: { at: midday, allowWhileIdle: true },
        channelId: NUDGE_CHANNEL,
        smallIcon: 'npd_notification_icon',
        iconColor: '#8B5CF6',
        sound: 'default',
      });
    }

    // Afternoon nudge at 5PM
    const afternoon = new Date(today);
    afternoon.setHours(17, 0, 0, 0);
    if (now < afternoon) {
      notifications.push({
        id: NUDGE_AFTERNOON_ID,
        title: 'Afternoon push! 💪',
        body: `Your daily average is ${Math.round(avgDaily)} tasks. Finish strong before evening!`,
        schedule: { at: afternoon, allowWhileIdle: true },
        channelId: NUDGE_CHANNEL,
        smallIcon: 'npd_notification_icon',
        iconColor: '#F97316',
        sound: 'default',
      });
    }

    if (notifications.length > 0) {
      await LocalNotifications.schedule({ notifications });
    }
  } catch (e) {
    console.warn('[SmartNudge] Schedule failed:', e);
  }
};

export const initializeSmartNudges = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  await createNudgeChannel();
  await scheduleSmartNudges();
};
