import { useEffect, useCallback, useRef } from 'react';
import { addNotification } from '@/utils/notificationStore';

/**
 * Hook that listens for various app events and pushes them
 * into the in-app notification center.
 */
export const useNotificationListener = () => {
  const mounted = useRef(true);

  const push = useCallback(async (
    type: 'reminder' | 'streak' | 'achievement' | 'note' | 'task' | 'system',
    title: string,
    message: string,
    icon?: string,
    actionPath?: string,
  ) => {
    if (!mounted.current) return;
    try {
      await addNotification({ type, title, message, icon, actionPath });
    } catch (e) {
      console.warn('[NotifListener] failed to add notification:', e);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;

    // 1. Task reminder triggered (urgent overlay)
    const onUrgentReminder = (e: Event) => {
      const d = (e as CustomEvent).detail;
      push('reminder', '⏰ Reminder', d.taskName || 'Task reminder', 'bell', '/todo/today');
    };

    // 2. Streak milestones
    const onStreakMilestone = (e: Event) => {
      const d = (e as CustomEvent).detail;
      push('streak', '🔥 Streak Milestone', `${d?.days || ''} day streak!`, 'flame', '/todo/progress');
    };

    // 3. Achievement / badge unlocked
    const onBadgeUnlock = (e: Event) => {
      const d = (e as CustomEvent).detail;
      push('achievement', '🏆 Badge Unlocked', d?.badgeName || d?.name || 'New achievement!', 'trophy');
    };

    // 4. Certificate unlocked
    const onCertificateUnlock = (e: Event) => {
      const d = (e as CustomEvent).detail;
      push('achievement', '📜 Certificate', d?.certificateName || 'Certificate earned!', 'award');
    };

    // 5. Task completed
    const onTaskCompleted = (e: Event) => {
      const d = (e as CustomEvent).detail;
      push('task', '✅ Task Done', d?.text || d?.taskName || 'Task completed', 'check-circle', '/todo/today');
    };

    // 6. Note created
    const onNoteCreated = (e: Event) => {
      const d = (e as CustomEvent).detail;
      push('note', '📝 New Note', d?.title || 'Note created', 'file-text', '/notesdashboard');
    };

    // 7. Combo multiplier
    const onCombo = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.multiplier >= 3) {
        push('achievement', '⚡ Combo!', `${d.multiplier}x combo streak!`, 'zap');
      }
    };

    // 8. Journey advancement
    const onJourney = (e: Event) => {
      const d = (e as CustomEvent).detail;
      push('achievement', '🗺️ Journey', d?.message || 'Journey milestone reached!', 'map', '/todo/journey-history');
    };

    // 9. Sync conflict
    const onSyncConflict = () => {
      push('system', '⚠️ Sync Conflict', 'Data conflict detected. Please review.', 'alert-triangle');
    };

    // 10. Weekly challenge
    const onWeeklyChallenge = (e: Event) => {
      const d = (e as CustomEvent).detail;
      push('achievement', '🎯 Challenge', d?.message || 'Weekly challenge update!', 'target');
    };

    window.addEventListener('urgentReminderTriggered', onUrgentReminder);
    window.addEventListener('streakMilestone', onStreakMilestone);
    window.addEventListener('badgeUnlocked', onBadgeUnlock);
    window.addEventListener('certificateUnlocked', onCertificateUnlock);
    window.addEventListener('taskCompleted', onTaskCompleted);
    window.addEventListener('noteCreated', onNoteCreated);
    window.addEventListener('comboUpdated', onCombo);
    window.addEventListener('journeyAdvanced', onJourney);
    window.addEventListener('syncConflictDetected', onSyncConflict);
    window.addEventListener('weeklyChallengeUpdate', onWeeklyChallenge);

    return () => {
      mounted.current = false;
      window.removeEventListener('urgentReminderTriggered', onUrgentReminder);
      window.removeEventListener('streakMilestone', onStreakMilestone);
      window.removeEventListener('badgeUnlocked', onBadgeUnlock);
      window.removeEventListener('certificateUnlocked', onCertificateUnlock);
      window.removeEventListener('taskCompleted', onTaskCompleted);
      window.removeEventListener('noteCreated', onNoteCreated);
      window.removeEventListener('comboUpdated', onCombo);
      window.removeEventListener('journeyAdvanced', onJourney);
      window.removeEventListener('syncConflictDetected', onSyncConflict);
      window.removeEventListener('weeklyChallengeUpdate', onWeeklyChallenge);
    };
  }, [push]);
};
