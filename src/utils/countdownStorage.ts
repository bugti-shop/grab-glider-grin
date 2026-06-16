import { getSetting, setSetting } from './settingsStorage';
import { genId } from './genId';

export type CountdownType = 'countdown' | 'anniversary' | 'birthday' | 'holiday';
export type CountdownRepeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

/** Offsets in days BEFORE the target date that a reminder should fire.
 *  0 means "on the day". */
export type ReminderOffset = 0 | 1 | 2 | 3 | 7 | 14 | 30;

export interface CountdownEvent {
  id: string;
  name: string;
  date: string; // ISO yyyy-mm-dd of the original target
  type: CountdownType;
  repeat: CountdownRepeat;
  notes?: string;
  /** Optional time-of-day for reminders ("HH:mm"); defaults to 09:00. */
  reminderTime?: string;
  /** Days-before-target offsets. Empty array = no reminders. */
  reminderOffsets?: ReminderOffset[];
  /** Whether the event is marked done (one-off events only). */
  completed?: boolean;
  /** If set, snooze the event/reminders until this date (yyyy-mm-dd). */
  snoozedUntil?: string;
  /** Show age delta in detail card (birthday/anniversary). */
  showAge?: boolean;
  /** When to show in Smart List. */
  smartListMode?: 'always' | 'on-day';
  /** Selected detail-card style id. */
  styleId?: string;
  /** Selected detail-card color id. */
  colorId?: string;
  createdAt: number;
  updatedAt?: number;
}


const KEY = 'countdownEvents';

export const loadCountdowns = async (): Promise<CountdownEvent[]> => {
  const list = await getSetting<CountdownEvent[]>(KEY, []);
  // Return a fresh array reference so React state updates always re-render,
  // even though the warm-cache may hand back the same underlying list.
  return Array.isArray(list) ? list.slice() : [];
};

export const saveCountdowns = async (list: CountdownEvent[]) => {
  // Store a fresh copy so the warm-cache reference differs from any
  // previously-handed-out reference held in component state.
  await setSetting(KEY, list.slice());
  try {
    window.dispatchEvent(new CustomEvent('countdownsUpdated'));
  } catch {}
};

export const upsertCountdown = async (
  item: Omit<CountdownEvent, 'id' | 'createdAt'> & { id?: string }
): Promise<CountdownEvent> => {
  const list = await loadCountdowns();
  if (item.id) {
    const idx = list.findIndex((c) => c.id === item.id);
    if (idx >= 0) {
      const updated: CountdownEvent = {
        ...list[idx],
        ...item,
        id: item.id,
        updatedAt: Date.now(),
      };
      list[idx] = updated;
      await saveCountdowns(list);
      return updated;
    }
  }
  const created: CountdownEvent = {
    id: genId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    name: item.name,
    date: item.date,
    type: item.type,
    repeat: item.repeat,
    notes: item.notes,
    reminderTime: item.reminderTime,
    reminderOffsets: item.reminderOffsets ?? [0],
    completed: item.completed ?? false,
    snoozedUntil: item.snoozedUntil,
    showAge: item.showAge,
    smartListMode: item.smartListMode,
    styleId: item.styleId,
    colorId: item.colorId,
  };
  list.unshift(created);
  await saveCountdowns(list);
  return created;
};


export const deleteCountdown = async (id: string) => {
  const list = await loadCountdowns();
  await saveCountdowns(list.filter((c) => c.id !== id));
};

export const markCountdownDone = async (id: string, done = true) => {
  const list = await loadCountdowns();
  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return;
  list[idx] = { ...list[idx], completed: done, updatedAt: Date.now() };
  await saveCountdowns(list);
};

export const snoozeCountdown = async (id: string, days: number) => {
  const list = await loadCountdowns();
  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return;
  const until = new Date();
  until.setDate(until.getDate() + days);
  const iso = until.toISOString().slice(0, 10);
  list[idx] = { ...list[idx], snoozedUntil: iso, updatedAt: Date.now() };
  await saveCountdowns(list);
};

const parseISO = (iso: string) => new Date(iso + 'T00:00:00');

/** Auto-calculates the next occurrence respecting repeat rules.
 *  For repeating events, rolls forward past today.
 *  For one-off events, returns the original date even if past. */
export const getNextOccurrence = (
  event: Pick<CountdownEvent, 'date' | 'repeat' | 'snoozedUntil'>,
  from: Date = new Date()
): Date => {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const base = parseISO(event.date);

  // Honor snooze: never return a date earlier than snoozedUntil
  const snoozeFloor = event.snoozedUntil ? parseISO(event.snoozedUntil) : null;

  let next = new Date(base);

  if (event.repeat === 'none') {
    if (snoozeFloor && snoozeFloor > next) return snoozeFloor;
    return next;
  }

  if (event.repeat === 'daily') {
    if (next < today) next = new Date(today);
  } else if (event.repeat === 'weekly') {
    if (next < today) {
      const diffDays = Math.floor((today.getTime() - base.getTime()) / 86400000);
      const weeks = Math.ceil(diffDays / 7);
      next.setDate(base.getDate() + weeks * 7);
    }
  } else if (event.repeat === 'monthly') {
    while (next < today) next.setMonth(next.getMonth() + 1);
  } else if (event.repeat === 'yearly') {
    while (next < today) next.setFullYear(next.getFullYear() + 1);
  }

  if (snoozeFloor && snoozeFloor > next) return snoozeFloor;
  return next;
};

/** Days until next occurrence (negative = days since for non-repeating past events). */
export const getDaysUntil = (
  event: Pick<CountdownEvent, 'date' | 'repeat' | 'snoozedUntil'>,
  from: Date = new Date()
): number => {
  const todayMid = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const target = getNextOccurrence(event, from);
  const targetMid = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((targetMid.getTime() - todayMid.getTime()) / 86400000);
};

/** Count of active (non-completed) countdowns whose next occurrence is within `windowDays`. */
export const countUpcomingWithin = async (windowDays = 7): Promise<number> => {
  const list = await loadCountdowns();
  return list.filter((c) => {
    if (c.completed) return false;
    const d = getDaysUntil(c);
    return d >= 0 && d <= windowDays;
  }).length;
};
