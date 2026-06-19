import { TodoItem, RepeatType, AdvancedRepeatPattern } from '@/types/note';
import { addDays, addWeeks, addMonths, addYears, addHours, startOfDay, getDay, setDay, getDate, setDate, differenceInDays, getHours, getMinutes, setHours, setMinutes } from 'date-fns';
import { recordRecurringCompletion } from './recurringTaskIntelligence';

export const getNextOccurrence = (
  currentDate: Date,
  repeatType: RepeatType,
  repeatDays?: number[],
  advancedRepeat?: AdvancedRepeatPattern,
  preserveTime?: boolean // New parameter to preserve time from original date
): Date | undefined => {
  const today = startOfDay(new Date());
  // Preserve time if needed
  const originalHours = getHours(currentDate);
  const originalMinutes = getMinutes(currentDate);
  const baseDate = preserveTime ? currentDate : startOfDay(currentDate);

  // Helper to apply preserved time to result
  const applyTime = (date: Date): Date => {
    if (preserveTime) {
      return setMinutes(setHours(date, originalHours), originalMinutes);
    }
    return date;
  };

  // Handle advanced repeat patterns
  if (advancedRepeat) {
    const interval = advancedRepeat.interval || 1;
    
    switch (advancedRepeat.frequency) {
      case 'hourly':
        return addHours(currentDate, interval);
      case 'daily':
        return applyTime(addDays(startOfDay(currentDate), interval));
      case 'weekly':
        if (advancedRepeat.weeklyDays && advancedRepeat.weeklyDays.length > 0) {
          // Find next day in the pattern
          const currentDay = getDay(baseDate);
          const sortedDays = [...advancedRepeat.weeklyDays].sort((a, b) => a - b);
          const nextDayInWeek = sortedDays.find(d => d > currentDay);
          
          if (nextDayInWeek !== undefined) {
            return applyTime(setDay(startOfDay(baseDate), nextDayInWeek));
          } else {
            // Move to next week and get first day
            return applyTime(setDay(addWeeks(startOfDay(baseDate), interval), sortedDays[0]));
          }
        }
        return applyTime(addWeeks(startOfDay(currentDate), interval));
      case 'monthly':
        if (advancedRepeat.monthlyType === 'weekday' && advancedRepeat.monthlyWeek && advancedRepeat.monthlyDay !== undefined) {
          // e.g., "2nd Tuesday of the month"
          return applyTime(getNthWeekdayOfNextMonth(startOfDay(baseDate), advancedRepeat.monthlyWeek, advancedRepeat.monthlyDay, interval));
        } else if (advancedRepeat.monthlyType === 'date' && advancedRepeat.monthlyDay) {
          // e.g., "15th of each month"
          const nextMonth = addMonths(startOfDay(baseDate), interval);
          return applyTime(setDate(nextMonth, advancedRepeat.monthlyDay));
        }
        return applyTime(addMonths(startOfDay(currentDate), interval));
      case 'yearly':
        return applyTime(addYears(startOfDay(currentDate), interval));
      default:
        return undefined;
    }
  }

  // Handle simple repeat types
  switch (repeatType) {
    case 'hourly':
      return addHours(currentDate, 1);
    case 'daily':
      return applyTime(addDays(startOfDay(currentDate), 1));
    case 'weekly':
      if (repeatDays && repeatDays.length > 0) {
        // Find next day in the pattern
        const currentDay = getDay(baseDate);
        const sortedDays = [...repeatDays].sort((a, b) => a - b);
        const nextDayInWeek = sortedDays.find(d => d > currentDay);
        
        if (nextDayInWeek !== undefined) {
          const daysUntil = nextDayInWeek - currentDay;
          return applyTime(addDays(startOfDay(baseDate), daysUntil));
        } else {
          // Move to next week and get first day
          const daysUntil = 7 - currentDay + sortedDays[0];
          return applyTime(addDays(startOfDay(baseDate), daysUntil));
        }
      }
      return applyTime(addWeeks(startOfDay(baseDate), 1));
    case 'weekdays':
      let nextDate = addDays(startOfDay(baseDate), 1);
      while (getDay(nextDate) === 0 || getDay(nextDate) === 6) {
        nextDate = addDays(nextDate, 1);
      }
      return applyTime(nextDate);
    case 'weekends':
      let nextWeekend = addDays(startOfDay(baseDate), 1);
      while (getDay(nextWeekend) !== 0 && getDay(nextWeekend) !== 6) {
        nextWeekend = addDays(nextWeekend, 1);
      }
      return applyTime(nextWeekend);
    case 'monthly':
      return applyTime(addMonths(startOfDay(currentDate), 1));
    case 'yearly':
      return applyTime(addYears(startOfDay(currentDate), 1));
    case 'custom':
      if (repeatDays && repeatDays.length > 0) {
        const currentDay = getDay(baseDate);
        const sortedDays = [...repeatDays].sort((a, b) => a - b);
        const nextDayInWeek = sortedDays.find(d => d > currentDay);
        
        if (nextDayInWeek !== undefined) {
          const daysUntil = nextDayInWeek - currentDay;
          return applyTime(addDays(startOfDay(baseDate), daysUntil));
        } else {
          const daysUntil = 7 - currentDay + sortedDays[0];
          return applyTime(addDays(startOfDay(baseDate), daysUntil));
        }
      }
      return undefined;
    default:
      return undefined;
  }
};

const getNthWeekdayOfNextMonth = (
  baseDate: Date,
  weekNum: 1 | 2 | 3 | 4 | -1,
  weekday: number,
  interval: number
): Date => {
  const nextMonth = addMonths(baseDate, interval);
  const year = nextMonth.getFullYear();
  const month = nextMonth.getMonth();
  
  if (weekNum === -1) {
    // Last occurrence of weekday in month
    const lastDay = new Date(year, month + 1, 0);
    let date = lastDay;
    while (getDay(date) !== weekday) {
      date = addDays(date, -1);
    }
    return date;
  }
  
  // Find first occurrence of weekday in month
  let date = new Date(year, month, 1);
  while (getDay(date) !== weekday) {
    date = addDays(date, 1);
  }
  
  // Add weeks to get nth occurrence
  return addDays(date, (weekNum - 1) * 7);
};

export const createNextRecurringTask = (completedTask: TodoItem): TodoItem | null => {
  if (!completedTask.repeatType || completedTask.repeatType === 'none') {
    return null;
  }

  const currentDueDate = completedTask.dueDate ? new Date(completedTask.dueDate) : new Date();
  // Pass preserveTime=true to keep the original time for recurring tasks
  const nextDate = getNextOccurrence(
    currentDueDate,
    completedTask.repeatType,
    completedTask.repeatDays,
    completedTask.advancedRepeat,
    true // Preserve the original time
  );

  if (!nextDate) {
    return null;
  }

  // Calculate new reminder time if exists
  let newReminderTime: Date | undefined;
  if (completedTask.reminderTime && completedTask.dueDate) {
    const reminderOffset = new Date(completedTask.reminderTime).getTime() - new Date(completedTask.dueDate).getTime();
    newReminderTime = new Date(nextDate.getTime() + reminderOffset);
  }

  // Record completion in recurring stats
  const updatedStats = recordRecurringCompletion(completedTask);

  // Deterministic UUID derived from (source id + next occurrence). Every
  // device that processes the same completion produces the SAME id, so the
  // new recurring task syncs as one row instead of duplicating per device.
  const seed = `${completedTask.id}:${nextDate.toISOString()}`;
  let h1 = 0x811c9dc5, h2 = 0xdeadbeef;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  const a = hex(h1), b = hex(h2);
  const cc = hex(Math.imul(h1 ^ h2, 2246822507));
  const dd = hex(Math.imul(h2 ^ h1, 3266489909));
  const variant = ((parseInt(cc.slice(0, 1), 16) & 0x3) | 0x8).toString(16);
  const recurringId = `${a}-${b.slice(0, 4)}-4${b.slice(4, 7)}-${variant}${cc.slice(1, 4)}-${cc.slice(4)}${dd}`;

  return {
    ...completedTask,
    id: recurringId,
    completed: false,
    dueDate: nextDate,
    reminderTime: newReminderTime,
    recurringStats: updatedStats,
    timeTracking: completedTask.timeTracking ? {
      totalSeconds: 0,
      isRunning: false,
      sessions: []
    } : undefined,
    subtasks: completedTask.subtasks?.map((st, i) => ({
      ...st,
      id: `${recurringId}-st-${i}`,
      completed: false
    }))
  };
};

export const getRepeatLabel = (
  repeatType?: RepeatType,
  repeatDays?: number[],
  advancedRepeat?: AdvancedRepeatPattern
): string => {
  if (!repeatType || repeatType === 'none') return '';

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  if (advancedRepeat) {
    const interval = advancedRepeat.interval || 1;
    const intervalText = interval > 1 ? `${interval} ` : '';
    
    switch (advancedRepeat.frequency) {
      case 'hourly':
        return interval > 1 ? `Every ${interval} hours` : 'Hourly';
      case 'daily':
        return interval > 1 ? `Every ${interval} days` : 'Daily';
      case 'weekly':
        if (advancedRepeat.weeklyDays && advancedRepeat.weeklyDays.length > 0) {
          const days = advancedRepeat.weeklyDays.map(d => dayNames[d]).join(', ');
          return interval > 1 ? `Every ${interval} weeks on ${days}` : `Weekly on ${days}`;
        }
        return interval > 1 ? `Every ${interval} weeks` : 'Weekly';
      case 'monthly':
        if (advancedRepeat.monthlyType === 'weekday' && advancedRepeat.monthlyWeek !== undefined) {
          const weekNames = ['', '1st', '2nd', '3rd', '4th'];
          const weekName = advancedRepeat.monthlyWeek === -1 ? 'last' : weekNames[advancedRepeat.monthlyWeek];
          const dayName = fullDayNames[advancedRepeat.monthlyDay || 0];
          return `${weekName} ${dayName} of each month`;
        }
        return interval > 1 ? `Every ${interval} months` : 'Monthly';
      case 'yearly':
        return interval > 1 ? `Every ${interval} years` : 'Yearly';
      default:
        return 'Repeating';
    }
  }

  switch (repeatType) {
    case 'hourly':
      return 'Hourly';
    case 'daily':
      return 'Daily';
    case 'weekly':
      if (repeatDays && repeatDays.length > 0) {
        return `Weekly on ${repeatDays.map(d => dayNames[d]).join(', ')}`;
      }
      return 'Weekly';
    case 'weekdays':
      return 'Weekdays';
    case 'weekends':
      return 'Weekends';
    case 'monthly':
      return 'Monthly';
    case 'yearly':
      return 'Yearly';
    case 'custom':
      if (repeatDays && repeatDays.length > 0) {
        return `Every ${repeatDays.map(d => dayNames[d]).join(', ')}`;
      }
      return 'Custom';
    default:
      return '';
  }
};
