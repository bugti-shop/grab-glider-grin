/**
 * useGoogleDriveSync — hook that manages auto-sync and manual sync with Google Drive.
 */
import { useEffect, useState, useCallback } from 'react';
import { useGoogleAuth } from '@/contexts/GoogleAuthContext';
import { syncWithDrive, startAutoSync, stopAutoSync, setupManualSyncListener } from '@/utils/googleDriveSync';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline' | 'reauth';

let activeSyncConsumers = 0;
let cleanupManualSyncListener: (() => void) | null = null;

export function useGoogleDriveSync() {
  const { user } = useGoogleAuth();
  const [status, setStatus] = useState<SyncStatus>('idle');

  useEffect(() => {
    const handler = (e: CustomEvent<{ status: SyncStatus }>) => setStatus(e.detail.status);
    window.addEventListener('syncStatusChanged', handler as EventListener);
    return () => window.removeEventListener('syncStatusChanged', handler as EventListener);
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    activeSyncConsumers += 1;

    if (activeSyncConsumers === 1) {
      cleanupManualSyncListener = setupManualSyncListener();
      startAutoSync().catch(() => {});
    }

    return () => {
      activeSyncConsumers = Math.max(0, activeSyncConsumers - 1);

      if (activeSyncConsumers === 0) {
        cleanupManualSyncListener?.();
        cleanupManualSyncListener = null;
        stopAutoSync();
      }
    };
  }, [user?.email]);

  const triggerSync = useCallback(() => {
    if (status !== 'syncing') {
      syncWithDrive().catch(() => {});
    }
  }, [status]);

  return { status, triggerSync, isSyncing: status === 'syncing' };
}
