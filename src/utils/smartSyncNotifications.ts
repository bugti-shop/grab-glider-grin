/**
 * Smart Sync Notifications — Non-intrusive toasts when data syncs from other devices.
 * Batches rapid updates and provides actionable feedback.
 */

import { toast } from 'sonner';

interface SyncNotification {
  type: string;
  count: number;
  timestamp: number;
}

let pendingNotifications: SyncNotification[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_DELAY = 2000; // 2 seconds
let notificationsEnabled = true;

export const setSyncNotificationsEnabled = (enabled: boolean) => {
  notificationsEnabled = enabled;
};

const SYNC_ICONS: Record<string, string> = {
  notes: '📝',
  tasks: '✅',
  folders: '📁',
  tags: '🏷️',
  habits: '🎯',
  settings: '⚙️',
  journey: '🗺️',
  sections: '📋',
};

const SYNC_LABELS: Record<string, string> = {
  notes: 'Notes',
  tasks: 'Tasks',
  folders: 'Folders',
  tags: 'Tags',
  habits: 'Habits',
  settings: 'Settings',
  journey: 'Journey',
  sections: 'Sections',
};

export const queueSyncNotification = (type: string) => {
  if (!notificationsEnabled) return;

  const existing = pendingNotifications.find(n => n.type === type);
  if (existing) {
    existing.count++;
    existing.timestamp = Date.now();
  } else {
    pendingNotifications.push({ type, count: 1, timestamp: Date.now() });
  }

  if (batchTimer) clearTimeout(batchTimer);
  batchTimer = setTimeout(flushNotifications, BATCH_DELAY);
};

const flushNotifications = () => {
  if (pendingNotifications.length === 0) return;

  if (pendingNotifications.length === 1) {
    const n = pendingNotifications[0];
    const icon = SYNC_ICONS[n.type] || '🔄';
    const label = SYNC_LABELS[n.type] || n.type;
    toast.info(`${label} synced from another device`, {
      icon,
      duration: 3000,
      action: {
        label: 'View',
        onClick: () => window.dispatchEvent(new CustomEvent('navigateToSyncedItem', { detail: { type: n.type } })),
      },
    });
  } else {
    const types = pendingNotifications.map(n => SYNC_LABELS[n.type] || n.type);
    const summary = types.slice(0, 3).join(', ') + (types.length > 3 ? ` +${types.length - 3} more` : '');
    toast.info(`Synced: ${summary}`, {
      icon: '🔄',
      duration: 4000,
    });
  }

  pendingNotifications = [];
  batchTimer = null;
};

/**
 * Show a sync status change notification
 */
export const showSyncStatusNotification = (status: 'synced' | 'error' | 'offline' | 'syncing') => {
  switch (status) {
    case 'offline':
      toast.warning('You\'re offline — changes will sync when connected', {
        icon: '📡',
        duration: 4000,
        id: 'sync-status',
      });
      break;
    case 'error':
      toast.error('Sync failed — will retry automatically', {
        icon: '⚠️',
        duration: 4000,
        id: 'sync-status',
      });
      break;
    case 'synced':
      // Only show after coming back from offline/error
      break;
  }
};

/**
 * Show notification when offline queue is processed
 */
export const showQueueProcessedNotification = (processed: number, failed: number) => {
  if (processed > 0 && failed === 0) {
    toast.success(`${processed} queued change${processed > 1 ? 's' : ''} synced successfully`, {
      icon: '✅',
      duration: 3000,
    });
  } else if (processed > 0 && failed > 0) {
    toast.warning(`${processed} synced, ${failed} failed — will retry`, {
      icon: '⚠️',
      duration: 4000,
    });
  }
};
