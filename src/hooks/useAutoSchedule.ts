/**
 * useAutoSchedule — one-shot auto-scheduler
 *
 * Motion-style: reads existing in-app calendar events, packs undated tasks
 * into 25-min blocks (09:00–17:00, Mon–Fri, 5-min buffer), and writes both
 * task updates and new calendar events immediately.
 *
 * Free tier: capped at 3 auto-schedule runs per day (RPC-enforced). Pro: unlimited.
 */
import { useCallback, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getSetting, setSetting } from '@/utils/settingsStorage';
import { useSubscription } from '@/contexts/SubscriptionContext';
import type { CalendarEvent, TodoItem } from '@/types/note';
import {
  scheduleWithTimeBlocks,
  applyTimeBlockUpdates,
  isAutoScheduledEvent,
  DEFAULT_TIME_BLOCK_OPTS,
  type TimeBlockOptions,
} from '@/utils/autoScheduler';

const FREE_DAILY_LIMIT = 3;

interface AutoScheduleOutcome {
  ok: boolean;
  scheduledCount: number;
  unscheduledCount: number;
  updatedTasks: TodoItem[];
  reason?: 'no_tasks' | 'cap_reached' | 'error';
  remaining?: number;
}

export const useAutoSchedule = () => {
  const { isPro } = useSubscription();
  const [isRunning, setIsRunning] = useState(false);

  const run = useCallback(
    async (
      tasks: TodoItem[],
      opts: Partial<TimeBlockOptions> = {},
    ): Promise<AutoScheduleOutcome> => {
      setIsRunning(true);
      try {
        // 1) Daily cap for free users
        if (!isPro) {
          try {
            const { data: userData } = await supabase.auth.getUser();
            const identifier = userData.user?.id ?? 'anon';
            const { data, error } = await supabase.rpc(
              'increment_ai_usage_if_under_limit',
              {
                p_identifier: identifier,
                p_identifier_type: userData.user ? 'user' : 'anon',
                p_feature: 'auto_schedule',
                p_usage_date: format(new Date(), 'yyyy-MM-dd'),
                p_limit: FREE_DAILY_LIMIT,
              },
            );
            const row = Array.isArray(data) ? data[0] : data;
            if (error || !row?.allowed) {
              toast.error(
                `Daily limit reached (${FREE_DAILY_LIMIT}/day). Upgrade for unlimited auto-scheduling.`,
                { icon: '⏳' },
              );
              return {
                ok: false,
                scheduledCount: 0,
                unscheduledCount: 0,
                updatedTasks: tasks,
                reason: 'cap_reached',
                remaining: 0,
              };
            }
          } catch (_) {
            // If cap check fails, fall through and let user run once — don't block UX.
          }
        }

        // 2) Load existing events, drop previous auto-scheduled ones so re-runs are idempotent
        const savedRaw = await getSetting<CalendarEvent[]>('calendarEvents', []);
        const saved = savedRaw.map(e => ({
          ...e,
          startDate: new Date(e.startDate),
          endDate: new Date(e.endDate),
          createdAt: new Date(e.createdAt),
          updatedAt: new Date(e.updatedAt),
        }));
        const preserved = saved.filter(e => !isAutoScheduledEvent(e));

        // Strip earlier auto-scheduled dueDates so the scheduler treats them as free again
        const scrubbedTasks = tasks.map(t => {
          const wasAuto = saved.some(
            e => isAutoScheduledEvent(e) && (e.description || '').includes(`taskId=${t.id}`),
          );
          return wasAuto ? { ...t, dueDate: undefined, reminderTime: undefined } : t;
        });

        // 3) Schedule
        const result = scheduleWithTimeBlocks(scrubbedTasks, preserved, opts);
        if (result.scheduledCount === 0) {
          toast(result.unscheduledCount === 0
            ? 'No undated tasks to schedule.'
            : 'No free slots found in the next 7 days.', { icon: '📅' });
          return {
            ok: false,
            scheduledCount: 0,
            unscheduledCount: result.unscheduledCount,
            updatedTasks: tasks,
            reason: 'no_tasks',
          };
        }

        // 4) Persist events + updated tasks
        const merged = [...preserved, ...result.newEvents];
        await setSetting('calendarEvents', merged);
        window.dispatchEvent(new CustomEvent('calendarEventsUpdated'));

        const updatedTasks = applyTimeBlockUpdates(scrubbedTasks, result.updates);

        toast.success(
          `Scheduled ${result.scheduledCount} task${result.scheduledCount === 1 ? '' : 's'}${
            result.unscheduledCount ? ` · ${result.unscheduledCount} couldn't fit` : ''
          }`,
          { icon: '⚡' },
        );

        return {
          ok: true,
          scheduledCount: result.scheduledCount,
          unscheduledCount: result.unscheduledCount,
          updatedTasks,
        };
      } catch (err) {
        console.error('[useAutoSchedule] failed', err);
        toast.error('Auto-schedule failed. Please try again.');
        return {
          ok: false,
          scheduledCount: 0,
          unscheduledCount: 0,
          updatedTasks: tasks,
          reason: 'error',
        };
      } finally {
        setIsRunning(false);
      }
    },
    [isPro],
  );

  return { run, isRunning, freeDailyLimit: FREE_DAILY_LIMIT, isPro };
};

export { DEFAULT_TIME_BLOCK_OPTS };
