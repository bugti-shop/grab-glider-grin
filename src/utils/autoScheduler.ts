/**
 * Smart Auto-Scheduler
 * Distributes undated tasks across available days based on priority and estimated effort
 */

import { TodoItem } from '@/types/note';
import { addDays, startOfDay, format } from 'date-fns';

export interface ScheduleConfig {
  /** Maximum effort hours per day */
  maxHoursPerDay: number;
  /** How many days ahead to schedule */
  daysAhead: number;
  /** Default estimated hours if task has no estimate */
  defaultEstimateHours: number;
  /** Whether to skip weekends */
  skipWeekends: boolean;
  /** Start scheduling from this date */
  startDate: Date;
}

export interface ScheduledTask {
  task: TodoItem;
  scheduledDate: Date;
  estimatedHours: number;
}

export interface ScheduleDay {
  date: Date;
  dateStr: string;
  tasks: ScheduledTask[];
  totalHours: number;
  remainingHours: number;
}

export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  maxHoursPerDay: 6,
  daysAhead: 7,
  defaultEstimateHours: 1,
  skipWeekends: false,
  startDate: new Date(),
};

/** Priority weights for sorting (higher = scheduled first) */
const PRIORITY_WEIGHTS: Record<string, number> = {
  high: 4,
  medium: 3,
  low: 2,
  none: 1,
};

/**
 * Get priority weight for sorting
 */
const getPriorityWeight = (priority?: string): number => {
  return PRIORITY_WEIGHTS[priority || 'none'] || 1;
};

/**
 * Find undated, incomplete tasks eligible for scheduling
 */
export const getUndatedTasks = (tasks: TodoItem[]): TodoItem[] => {
  return tasks.filter(t => 
    !t.completed && 
    !t.dueDate && 
    t.text.trim().length > 0
  );
};

/**
 * Generate available schedule days
 */
const generateScheduleDays = (config: ScheduleConfig): ScheduleDay[] => {
  const days: ScheduleDay[] = [];
  let currentDate = startOfDay(config.startDate);

  for (let i = 0; i < config.daysAhead; i++) {
    const date = addDays(currentDate, i);
    const dayOfWeek = date.getDay();

    // Skip weekends if configured
    if (config.skipWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
      continue;
    }

    days.push({
      date,
      dateStr: format(date, 'yyyy-MM-dd'),
      tasks: [],
      totalHours: 0,
      remainingHours: config.maxHoursPerDay,
    });
  }

  return days;
};

/**
 * Account for already-scheduled tasks on each day
 */
const accountForExistingTasks = (
  days: ScheduleDay[], 
  allTasks: TodoItem[], 
  config: ScheduleConfig
): void => {
  for (const task of allTasks) {
    if (!task.dueDate || task.completed) continue;
    const taskDateStr = format(startOfDay(new Date(task.dueDate)), 'yyyy-MM-dd');
    const day = days.find(d => d.dateStr === taskDateStr);
    if (day) {
      const hours = task.estimatedHours || config.defaultEstimateHours;
      day.totalHours += hours;
      day.remainingHours = Math.max(0, config.maxHoursPerDay - day.totalHours);
    }
  }
};

/**
 * Auto-schedule undated tasks across available days
 */
export const autoScheduleTasks = (
  allTasks: TodoItem[], 
  config: ScheduleConfig = DEFAULT_SCHEDULE_CONFIG
): { schedule: ScheduleDay[]; unscheduled: TodoItem[] } => {
  // Get undated tasks sorted by priority (high first), then by creation order
  const undated = getUndatedTasks(allTasks).sort((a, b) => {
    const priorityDiff = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
    if (priorityDiff !== 0) return priorityDiff;
    // Smaller estimated effort first within same priority (fill gaps efficiently)
    const aHours = a.estimatedHours || config.defaultEstimateHours;
    const bHours = b.estimatedHours || config.defaultEstimateHours;
    return aHours - bHours;
  });

  // Generate available days and account for existing tasks
  const days = generateScheduleDays(config);
  accountForExistingTasks(days, allTasks, config);

  const unscheduled: TodoItem[] = [];

  // Distribute tasks using first-fit decreasing approach
  for (const task of undated) {
    const hours = task.estimatedHours || config.defaultEstimateHours;
    
    // Find first day with enough remaining capacity
    const availableDay = days.find(d => d.remainingHours >= hours);
    
    if (availableDay) {
      availableDay.tasks.push({
        task,
        scheduledDate: availableDay.date,
        estimatedHours: hours,
      });
      availableDay.totalHours += hours;
      availableDay.remainingHours = Math.max(0, config.maxHoursPerDay - availableDay.totalHours);
    } else {
      // Try to fit in any day with at least some remaining capacity
      const anyDay = days.find(d => d.remainingHours > 0);
      if (anyDay) {
        anyDay.tasks.push({
          task,
          scheduledDate: anyDay.date,
          estimatedHours: hours,
        });
        anyDay.totalHours += hours;
        anyDay.remainingHours = Math.max(0, config.maxHoursPerDay - anyDay.totalHours);
      } else {
        unscheduled.push(task);
      }
    }
  }

  return { schedule: days, unscheduled };
};

/**
 * Apply schedule to tasks (set due dates)
 */
export const applySchedule = (
  allTasks: TodoItem[], 
  schedule: ScheduleDay[]
): TodoItem[] => {
  // Build a map of task ID -> scheduled date
  const scheduledMap = new Map<string, Date>();
  for (const day of schedule) {
    for (const st of day.tasks) {
      scheduledMap.set(st.task.id, st.scheduledDate);
    }
  }

  return allTasks.map(task => {
    const scheduledDate = scheduledMap.get(task.id);
    if (scheduledDate) {
      return { ...task, dueDate: scheduledDate };
    }
    return task;
  });
};

/* --------------------------------------------------------------- *
 * TIME-BLOCK SCHEDULER (Motion-style)
 * Schedules undated tasks into real calendar time slots, avoiding
 * existing calendar events + already-timed tasks.
 * --------------------------------------------------------------- */

import type { CalendarEvent } from '@/types/note';

export interface TimeBlockOptions {
  /** Number of days to look ahead. */
  daysAhead: number;
  /** Work window start hour (0-23). */
  workStartHour: number;
  /** Work window end hour (0-23). */
  workEndHour: number;
  /** Length of a focus block, in minutes. */
  blockMinutes: number;
  /** Buffer between blocks, in minutes. */
  bufferMinutes: number;
  /** Skip Sat/Sun. */
  skipWeekends: boolean;
  /** Default estimate if a task has none, in minutes. */
  defaultEstimateMinutes: number;
  /** Do not schedule earlier than this instant (defaults to now + 5min). */
  earliestStart?: Date;
}

export const DEFAULT_TIME_BLOCK_OPTS: TimeBlockOptions = {
  daysAhead: 7,
  workStartHour: 9,
  workEndHour: 17,
  blockMinutes: 25,
  bufferMinutes: 5,
  skipWeekends: true,
  defaultEstimateMinutes: 25,
};

interface Interval { start: number; end: number; }

const AUTO_EVENT_TAG = '__auto_scheduled__';

/** True if this calendar event was previously created by the auto-scheduler. */
export const isAutoScheduledEvent = (e: CalendarEvent): boolean =>
  (e.description || '').includes(AUTO_EVENT_TAG);

const mergeBusy = (intervals: Interval[]): Interval[] => {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Interval[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else out.push({ ...cur });
  }
  return out;
};

/** Return the first free slot >= `after`, of at least `minutes`, that does not
 * cross a busy interval and stays within [dayStart, dayEnd]. */
const findSlot = (
  busy: Interval[],
  after: number,
  minutes: number,
  dayStart: number,
  dayEnd: number,
): Interval | null => {
  let cursor = Math.max(after, dayStart);
  const needed = minutes * 60_000;
  for (const b of busy) {
    if (b.end <= cursor) continue;
    if (b.start - cursor >= needed) {
      const end = cursor + needed;
      if (end <= dayEnd) return { start: cursor, end };
      return null;
    }
    cursor = Math.max(cursor, b.end);
    if (cursor >= dayEnd) return null;
  }
  const end = cursor + needed;
  if (end <= dayEnd) return { start: cursor, end };
  return null;
};

export interface TimeBlockResult {
  updates: Array<{ taskId: string; startDate: Date; endDate: Date }>;
  newEvents: CalendarEvent[];
  scheduledCount: number;
  unscheduledCount: number;
  unscheduled: TodoItem[];
}

/**
 * Auto-schedule undated tasks into real time blocks that dodge existing
 * calendar events. Produces both task updates (dueDate/reminderTime) and
 * new CalendarEvent rows to be inserted.
 */
export const scheduleWithTimeBlocks = (
  allTasks: TodoItem[],
  existingEvents: CalendarEvent[],
  opts: Partial<TimeBlockOptions> = {},
): TimeBlockResult => {
  const cfg: TimeBlockOptions = { ...DEFAULT_TIME_BLOCK_OPTS, ...opts };
  const now = new Date();
  const earliest = cfg.earliestStart ?? new Date(now.getTime() + 5 * 60_000);

  // ---- Build per-day busy intervals from existing events ----
  const dayBusy = new Map<string, Interval[]>();
  const pushBusy = (d: Date, iv: Interval) => {
    const key = format(startOfDay(d), 'yyyy-MM-dd');
    const arr = dayBusy.get(key) ?? [];
    arr.push(iv);
    dayBusy.set(key, arr);
  };

  for (const ev of existingEvents) {
    if (ev.allDay) continue;
    const s = new Date(ev.startDate).getTime();
    const e = new Date(ev.endDate).getTime();
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
      pushBusy(new Date(s), { start: s, end: e });
    }
  }
  // Treat already-timed incomplete tasks as busy too (avoid double-booking).
  for (const t of allTasks) {
    if (t.completed || !t.dueDate) continue;
    const s = new Date(t.dueDate).getTime();
    if (!Number.isFinite(s)) continue;
    // If the task has an estimatedHours we honor it; else assume one block.
    const durMin = t.estimatedHours ? Math.max(15, Math.round(t.estimatedHours * 60)) : cfg.blockMinutes;
    pushBusy(new Date(s), { start: s, end: s + durMin * 60_000 });
  }

  // ---- Sort undated tasks: earliest deadline first (hard constraint),
  // then priority (high first), then shorter first ----
  const queue = getUndatedTasks(allTasks).sort((a, b) => {
    const ad = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
    const bd = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    const pd = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
    if (pd !== 0) return pd;
    const ah = a.estimatedHours ?? cfg.defaultEstimateMinutes / 60;
    const bh = b.estimatedHours ?? cfg.defaultEstimateMinutes / 60;
    return ah - bh;
  });

  const updates: TimeBlockResult['updates'] = [];
  const newEvents: CalendarEvent[] = [];
  const unscheduled: TodoItem[] = [];

  for (const task of queue) {
    const durMin = task.estimatedHours
      ? Math.max(15, Math.round(task.estimatedHours * 60))
      : cfg.defaultEstimateMinutes;

    // Hard deadline constraint: never schedule a block that ends after `deadline`.
    const deadlineMs = task.deadline ? new Date(task.deadline).getTime() : Number.POSITIVE_INFINITY;

    let placed = false;
    for (let d = 0; d < cfg.daysAhead && !placed; d++) {
      const day = addDays(startOfDay(earliest), d);
      const dow = day.getDay();
      if (cfg.skipWeekends && (dow === 0 || dow === 6)) continue;

      const dayStart = new Date(day);
      dayStart.setHours(cfg.workStartHour, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(cfg.workEndHour, 0, 0, 0);
      // Clamp the day's window by the hard deadline.
      const cappedDayEnd = Math.min(dayEnd.getTime(), deadlineMs);
      if (cappedDayEnd <= dayStart.getTime()) {
        // This day is already past the deadline — stop searching further days.
        if (dayStart.getTime() >= deadlineMs) break;
        continue;
      }

      const after = d === 0 ? Math.max(earliest.getTime(), dayStart.getTime()) : dayStart.getTime();
      const key = format(day, 'yyyy-MM-dd');
      const busy = mergeBusy(dayBusy.get(key) ?? []);

      const slot = findSlot(busy, after, durMin, dayStart.getTime(), cappedDayEnd);
      if (!slot) continue;

      const startDate = new Date(slot.start);
      const endDate = new Date(slot.end);
      updates.push({ taskId: task.id, startDate, endDate });

      // Reserve the slot + buffer so subsequent tasks won't collide.
      const bufferedEnd = slot.end + cfg.bufferMinutes * 60_000;
      dayBusy.set(key, mergeBusy([...(dayBusy.get(key) ?? []), { start: slot.start, end: bufferedEnd }]));

      newEvents.push({
        id: `auto-${task.id}-${slot.start}`,
        title: `▸ ${task.text.slice(0, 80)}`,
        description: `${AUTO_EVENT_TAG} taskId=${task.id}`,
        location: '',
        allDay: false,
        startDate,
        endDate,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        repeat: 'never',
        reminder: 'at_time',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      placed = true;
    }
    if (!placed) unscheduled.push(task);
  }

  return {
    updates,
    newEvents,
    scheduledCount: updates.length,
    unscheduledCount: unscheduled.length,
    unscheduled,
  };
};

/** Merge scheduler updates into a TodoItem[]. */
export const applyTimeBlockUpdates = (
  tasks: TodoItem[],
  updates: TimeBlockResult['updates'],
): TodoItem[] => {
  const byId = new Map(updates.map(u => [u.taskId, u]));
  return tasks.map(t => {
    const u = byId.get(t.id);
    if (!u) return t;
    return { ...t, dueDate: u.startDate, reminderTime: u.startDate };
  });
};
