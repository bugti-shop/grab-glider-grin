import { Capacitor, registerPlugin } from '@capacitor/core';

interface FlowistAlarmPlugin {
  schedule(options: { key: string; title: string; priority: string; when: number; repeatDays?: number }): Promise<void>;
  cancel(options: { key: string }): Promise<void>;
}
const alarm = registerPlugin<FlowistAlarmPlugin>('FlowistAlarm');

export const scheduleNativeAlarm = async (key: string, title: string, when: Date, priority = 'None', repeatDays = 0) => {
  if (Capacitor.getPlatform() !== 'android' || when.getTime() <= Date.now()) return;
  try {
    await alarm.schedule({ key, title, priority, when: when.getTime(), repeatDays });
  } catch (error) {
    // Leave the existing local notification scheduled if alarm access is unavailable.
    console.warn('[Alarm] Exact alarm unavailable; local notification remains active', error);
  }
};

export const cancelNativeAlarm = async (key: string) => {
  if (Capacitor.getPlatform() !== 'android') return;
  try { await alarm.cancel({ key }); } catch (error) { console.warn('[Alarm] Cancel failed', error); }
};
