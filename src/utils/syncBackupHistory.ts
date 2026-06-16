/**
 * Sync Backup History — keeps versioned snapshots of local data before each sync merge.
 * Stores up to 5 recent backups in IndexedDB so users can restore if a bad sync happens.
 */

import { getSetting, setSetting } from '@/utils/settingsStorage';

const BACKUP_KEY = 'flowist_sync_backups';
const MAX_BACKUPS = 5;

export interface SyncBackup {
  id: string;
  timestamp: number;
  label: string; // e.g. "Before sync at 3:45 PM"
  data: {
    tasks?: any;
    notes?: any;
    streaks?: any;
    gamification?: any;
    journey?: any;
    settings?: any;
    certificates?: {
      seenCertificates: string[];
      firstStepEarned: any;
    };
  };
}

export const loadBackups = async (): Promise<SyncBackup[]> => {
  try {
    return await getSetting<SyncBackup[]>(BACKUP_KEY, []);
  } catch {
    return [];
  }
};

export const saveBackup = async (backup: SyncBackup): Promise<void> => {
  const backups = await loadBackups();
  backups.unshift(backup);
  // Keep only the most recent MAX_BACKUPS
  const trimmed = backups.slice(0, MAX_BACKUPS);
  await setSetting(BACKUP_KEY, trimmed);
};

export const deleteBackup = async (backupId: string): Promise<void> => {
  const backups = await loadBackups();
  const filtered = backups.filter(b => b.id !== backupId);
  await setSetting(BACKUP_KEY, filtered);
};

export const clearAllBackups = async (): Promise<void> => {
  await setSetting(BACKUP_KEY, []);
};

/**
 * Create a pre-sync snapshot of all important local data.
 * Called automatically before downloadFromDrive merges remote data.
 */
export const createPreSyncBackup = async (): Promise<void> => {
  try {
    const [
      { loadTasksFromDB },
      { loadNotesFromDB },
      { loadStreakData },
      { loadAchievementsData },
      { loadJourneyData },
      { getAllSettings },
    ] = await Promise.all([
      import('@/utils/taskStorage'),
      import('@/utils/noteStorage'),
      import('@/utils/streakStorage'),
      import('@/utils/gamificationStorage'),
      import('@/utils/virtualJourneyStorage'),
      import('@/utils/settingsStorage'),
    ]);

    const [tasks, notes, streaks, gamification, journey, settings] = await Promise.all([
      loadTasksFromDB(),
      loadNotesFromDB(),
      loadStreakData('flowist_task_streak'),
      loadAchievementsData(),
      Promise.resolve(loadJourneyData()),
      getAllSettings(),
    ]);

    const now = new Date();
    const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const backup: SyncBackup = {
      id: `backup_${Date.now()}`,
      timestamp: Date.now(),
      label: `Before sync at ${timeLabel}`,
      data: {
        tasks,
        notes,
        streaks,
        gamification,
        journey,
        settings,
        certificates: {
          seenCertificates: settings?.flowist_seen_certificates || [],
          firstStepEarned: settings?.flowist_first_step_earned || null,
        },
      },
    };

    await saveBackup(backup);
    console.log(`[SyncBackup] Created backup: ${backup.label} (${tasks.length} tasks, ${notes.length} notes)`);
  } catch (e) {
    console.warn('[SyncBackup] Failed to create pre-sync backup:', e);
  }
};

/**
 * Restore local data from a backup snapshot.
 */
export const restoreFromBackup = async (backupId: string): Promise<boolean> => {
  try {
    const backups = await loadBackups();
    const backup = backups.find(b => b.id === backupId);
    if (!backup) return false;

    const { saveTasksToDB } = await import('@/utils/taskStorage');
    const { saveNotesToDB } = await import('@/utils/noteStorage');
    const { saveStreakData } = await import('@/utils/streakStorage');
    const { saveJourneyData } = await import('@/utils/virtualJourneyStorage');
    const { setSetting: set } = await import('@/utils/settingsStorage');

    const promises: Promise<any>[] = [];

    if (backup.data.tasks) promises.push(saveTasksToDB(backup.data.tasks, true));
    if (backup.data.notes) promises.push(saveNotesToDB(backup.data.notes));
    if (backup.data.streaks) promises.push(saveStreakData('flowist_task_streak', backup.data.streaks));
    if (backup.data.gamification) promises.push(set('flowist_achievements', backup.data.gamification));
    if (backup.data.journey) saveJourneyData(backup.data.journey);

    if (backup.data.certificates) {
      promises.push(set('flowist_seen_certificates', backup.data.certificates.seenCertificates));
      if (backup.data.certificates.firstStepEarned) {
        promises.push(set('flowist_first_step_earned', backup.data.certificates.firstStepEarned));
      }
    }

    await Promise.allSettled(promises);

    // Notify UI to reload
    window.dispatchEvent(new Event('tasksRestored'));
    window.dispatchEvent(new Event('foldersRestored'));
    window.dispatchEvent(new Event('sectionsRestored'));
    window.dispatchEvent(new Event('streakUpdated'));
    window.dispatchEvent(new Event('journeyUpdated'));

    console.log(`[SyncBackup] Restored from backup: ${backup.label}`);
    return true;
  } catch (e) {
    console.error('[SyncBackup] Restore failed:', e);
    return false;
  }
};