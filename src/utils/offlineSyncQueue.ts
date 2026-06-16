/**
 * Offline Sync Queue — Buffers changes when offline and auto-syncs on reconnect.
 * Uses IndexedDB (via settingsStorage) to persist queued operations.
 */
import { getSetting, setSetting } from '@/utils/settingsStorage';

const QUEUE_KEY = 'offline_sync_queue';

export interface QueuedOperation {
  id: string;
  type: 'notes' | 'tasks' | 'folders' | 'tags' | 'habits' | 'settings' | 'journey';
  timestamp: number;
  retries: number;
}

// In-memory cache for synchronous access
let _queueCache: QueuedOperation[] | null = null;

export const getQueue = (): QueuedOperation[] => {
  return _queueCache ?? [];
};

/** Async load from IndexedDB — call at startup */
export const loadQueueAsync = async (): Promise<QueuedOperation[]> => {
  try {
    const raw = await getSetting<QueuedOperation[]>(QUEUE_KEY, []);
    _queueCache = raw;
    return raw;
  } catch { return []; }
};

const saveQueue = (queue: QueuedOperation[]): void => {
  _queueCache = queue;
  setSetting(QUEUE_KEY, queue).catch(console.error);
};

export const addToQueue = (type: QueuedOperation['type']): void => {
  const queue = getQueue();
  // Deduplicate — only one entry per type
  const existing = queue.findIndex(q => q.type === type);
  if (existing >= 0) {
    queue[existing].timestamp = Date.now();
  } else {
    queue.push({ id: `${type}_${Date.now()}`, type, timestamp: Date.now(), retries: 0 });
  }
  saveQueue(queue);
};

export const removeFromQueue = (type: QueuedOperation['type']): void => {
  const queue = getQueue().filter(q => q.type !== type);
  saveQueue(queue);
};

export const clearQueue = (): void => {
  _queueCache = [];
  setSetting(QUEUE_KEY, []).catch(console.error);
};

export const getQueueSize = (): number => getQueue().length;

/**
 * Wrap a sync function to queue operations when offline.
 * Returns a function that either runs immediately or queues.
 */
export const withOfflineQueue = (
  type: QueuedOperation['type'],
  syncFn: () => Promise<void>,
): (() => Promise<void>) => {
  return async () => {
    if (!navigator.onLine) {
      addToQueue(type);
      window.dispatchEvent(new CustomEvent('syncQueueChanged', { detail: { size: getQueueSize() } }));
      return;
    }
    try {
      await syncFn();
      removeFromQueue(type);
    } catch (err) {
      // If network error, queue it
      if (err instanceof Error && (err.message.includes('network') || err.message.includes('timeout') || err.message.includes('Failed to fetch'))) {
        addToQueue(type);
      }
      throw err;
    }
  };
};

/**
 * Process all queued operations when coming back online.
 * Call this in the online event handler.
 */
export const processOfflineQueue = async (
  handlers: Record<QueuedOperation['type'], () => Promise<void>>,
): Promise<{ processed: number; failed: number }> => {
  const queue = getQueue();
  if (queue.length === 0) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;

  for (const op of queue) {
    const handler = handlers[op.type];
    if (!handler) continue;
    try {
      await handler();
      removeFromQueue(op.type);
      processed++;
    } catch {
      // Increment retry count
      const q = getQueue();
      const item = q.find(i => i.type === op.type);
      if (item) {
        item.retries++;
        if (item.retries >= 3) {
          removeFromQueue(op.type); // Give up after 3 retries
          failed++;
        } else {
          saveQueue(q);
          failed++;
        }
      }
    }
  }

  window.dispatchEvent(new CustomEvent('syncQueueChanged', { detail: { size: getQueueSize() } }));
  return { processed, failed };
};

// Auto-setup online listener
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    const queue = getQueue();
    if (queue.length > 0) {
      window.dispatchEvent(new CustomEvent('processOfflineQueue'));
    }
  });

  window.addEventListener('offline', () => {
    window.dispatchEvent(new CustomEvent('syncStatusChanged', { detail: { status: 'offline', timestamp: Date.now() } }));
  });
}