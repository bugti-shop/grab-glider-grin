import { useEffect, useRef } from 'react';
import {
  advanceJourneyForTask,
  getActiveJourney,
  getRarityFromJourney,
  loadJourneyData,
} from '@/utils/virtualJourneyStorage';
import { playAchievementSound } from '@/utils/gamificationSounds';
import { toast } from '@/hooks/use-toast';
import { BadgeUnlockToast } from '@/components/BadgeUnlockToast';
import { loadTodoItems } from '@/utils/todoItemsStorage';
import { TodoItem } from '@/types/note';

/**
 * Global hook that listens for task updates and advances the active journey
 * exactly once per uniquely-completed task ID — making advancement idempotent
 * across devices/realtime echoes (the counted-task set syncs via settings).
 */
export const useJourneyAdvancement = () => {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessingRef = useRef(false);

  const collectCompletedIds = (items: TodoItem[]): string[] => {
    const out: string[] = [];
    const walk = (list: TodoItem[]) => {
      for (const item of list) {
        if (item && (item as any).completed && typeof item.id === 'string') out.push(item.id);
        if (Array.isArray((item as any).subtasks) && (item as any).subtasks.length > 0) {
          walk((item as any).subtasks as TodoItem[]);
        }
      }
    };
    walk(items);
    return out;
  };

  useEffect(() => {
    const syncAndAdvance = async () => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        const items = await loadTodoItems();
        const completedIds = collectCompletedIds(items);
        if (completedIds.length === 0) return;

        const counted = loadJourneyData().countedTaskIds ?? {};
        const fresh = completedIds.filter((id) => !counted[id]);
        if (fresh.length === 0) return;

        for (const id of fresh) {
          try {
            const active = getActiveJourney();
            const result = advanceJourneyForTask(id);
            if (!result) continue;
            if (!active || active.progress.completedAt) continue;
            if (!result.newMilestone && !result.journeyCompleted) continue;

            playAchievementSound();
            const journey = active.journey;

            if (result.journeyCompleted) {
              const rarity = getRarityFromJourney(journey, 'journey_complete');
              toast({
                description: BadgeUnlockToast({
                  icon: '🏆',
                  label: `${journey.name} Conqueror`,
                  journeyName: journey.name,
                  rarity,
                  isJourneyComplete: true,
                }),
                duration: 5000,
              });
            } else if (result.newMilestone) {
              const msIndex = journey.milestones.findIndex((m) => m.id === result.newMilestone!.id);
              const rarity = getRarityFromJourney(journey, 'milestone', Math.max(msIndex, 0));
              toast({
                description: BadgeUnlockToast({
                  icon: result.newMilestone.icon,
                  label: result.newMilestone.name,
                  journeyName: journey.name,
                  rarity,
                }),
                duration: 4000,
              });
            }

            window.dispatchEvent(
              new CustomEvent('journeyMilestoneReached', {
                detail: { milestone: result.newMilestone, completed: result.journeyCompleted },
              }),
            );
          } catch (error) {
            console.warn('Journey advancement step failed:', error);
          }
        }
      } catch (error) {
        console.warn('Journey advancement sync failed:', error);
      } finally {
        isProcessingRef.current = false;
      }
    };

    void syncAndAdvance();

    const handler = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void syncAndAdvance();
      }, 250);
    };

    // Foreground / resume re-sync: when the tab becomes visible or the native
    // app resumes, force an immediate journey reconciliation so any tasks
    // completed on another surface (widget, other device) or while the app
    // was backgrounded advance the journey right away.
    const foregroundHandler = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void syncAndAdvance();
      // Also let downstream UI (VirtualJourneyCard, Progress) refresh.
      window.dispatchEvent(new Event('tasksUpdated'));
    };
    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') foregroundHandler();
    };

    window.addEventListener('tasksUpdated', handler);
    window.addEventListener('journeyUpdated', handler);
    document.addEventListener('visibilitychange', visibilityHandler);
    window.addEventListener('focus', foregroundHandler);

    let capacitorCleanup: (() => void) | null = null;
    import('@capacitor/app')
      .then(({ App }) => {
        const sub = App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) foregroundHandler();
        });
        capacitorCleanup = () => {
          Promise.resolve(sub).then((s) => s.remove()).catch(() => {});
        };
      })
      .catch(() => {});

    return () => {
      window.removeEventListener('tasksUpdated', handler);
      window.removeEventListener('journeyUpdated', handler);
      document.removeEventListener('visibilitychange', visibilityHandler);
      window.removeEventListener('focus', foregroundHandler);
      capacitorCleanup?.();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);
};
