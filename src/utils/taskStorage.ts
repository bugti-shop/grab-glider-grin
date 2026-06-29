// IndexedDB-based storage for task data
// Ultra-optimized for 600k+ tasks without quota issues
// Features: connection pooling, batch writes, streaming, memory management

import { TodoItem } from '@/types/note';
import { requestUnlimitedStorage, LRUCache } from './unlimitedStorage';
import { debounce, BatchProcessor } from './performanceOptimizer';

const DB_NAME = 'nota-tasks-db';
const DB_VERSION = 3;
const STORE_NAME = 'tasks';
const META_STORE = 'meta';
const BATCH_SIZE = 5000; // Process 5000 items at a time for better performance
const TODO_ITEMS_KEY = 'todoItems';
const LOCAL_STORAGE_MIGRATION_DONE_KEY = 'todoItems_idb_migration_done_v1';

const markLocalStorageMigrationDone = () => {
  try {
    localStorage.setItem(LOCAL_STORAGE_MIGRATION_DONE_KEY, 'true');
    localStorage.removeItem(TODO_ITEMS_KEY);
  } catch {}
};

// In-memory cache with LRU eviction for large datasets
let tasksCache: TodoItem[] | null = null;
let tasksCacheIndex: Map<string, number> | null = null;
let cacheVersion = 0;
let lastSaveTime = 0;
const MIN_SAVE_INTERVAL = 50; // Minimum 50ms between saves
let pendingFlushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingFlushItems: TodoItem[] | null = null;
let pendingSkipSyncEvent = false;
let taskUpdatedDispatchTimer: ReturnType<typeof setTimeout> | null = null;

const dispatchTasksUpdated = (debounceMs = 0) => {
  if (typeof window === 'undefined') return;
  if (debounceMs < 0) return;
  if (debounceMs <= 0) {
    window.dispatchEvent(new Event('tasksUpdated'));
    return;
  }
  if (taskUpdatedDispatchTimer) clearTimeout(taskUpdatedDispatchTimer);
  taskUpdatedDispatchTimer = setTimeout(() => {
    taskUpdatedDispatchTimer = null;
    window.dispatchEvent(new Event('tasksUpdated'));
  }, debounceMs);
};

const rebuildTasksCacheIndex = () => {
  tasksCacheIndex = tasksCache ? new Map(tasksCache.map((task, index) => [task.id, index] as const)) : null;
};

const setTasksCache = (items: TodoItem[] | null) => {
  tasksCache = items;
  rebuildTasksCacheIndex();
  cacheVersion++;
};

const mergeTasksIntoCache = (tasks: TodoItem[]) => {
  if (!tasks.length) return;
  if (!tasksCache) {
    setTasksCache(tasks.slice());
    return;
  }

  // Checkbox completion batches are tiny; avoid allocating a full Map and new
  // 100k-row array on the main thread for every 2–4 rapid taps.
  if (tasks.length <= 50) {
    for (const task of tasks) {
      const index = tasksCacheIndex?.get(task.id) ?? -1;
      if (index >= 0) tasksCache[index] = task;
      else {
        tasksCache.unshift(task);
        rebuildTasksCacheIndex();
      }
    }
    cacheVersion++;
    return;
  }

  const byId = new Map(tasksCache.map((task) => [task.id, task] as const));
  tasks.forEach((task) => byId.set(task.id, task));
  setTasksCache(Array.from(byId.values()));
};

const pendingCloudPush = new Map<string, TodoItem>();
let pendingCloudPushTimer: ReturnType<typeof setTimeout> | null = null;

const flushTaskCloudPush = () => {
  pendingCloudPushTimer = null;
  const batch = Array.from(pendingCloudPush.values());
  pendingCloudPush.clear();
  if (!batch.length) return;
  const run = () => {
    import('@/utils/cloudSync/storeBridge').then(({ pushTasks }) => {
      try { pushTasks(batch); } catch {}
    }).catch(() => {});
  };
  if (typeof window === 'undefined') {
    run();
    return;
  }
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };
  if (idleWindow.requestIdleCallback) idleWindow.requestIdleCallback(run, { timeout: 2000 });
  else window.setTimeout(run, 0);
};

const scheduleTaskCloudPush = (tasks: TodoItem[]) => {
  if (!tasks.length) return;
  tasks.forEach((task) => pendingCloudPush.set(task.id, task));
  if (pendingCloudPushTimer) clearTimeout(pendingCloudPushTimer);
  pendingCloudPushTimer = setTimeout(flushTaskCloudPush, tasks.length > 50 ? 900 : 6000);
};

// Connection pooling - reuse database connection (never close)
let dbConnection: IDBDatabase | null = null;
let dbConnectionPromise: Promise<IDBDatabase> | null = null;

// Initialize persistent storage silently
requestUnlimitedStorage().catch(() => {});

const toOptionalDate = (value: unknown): Date | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const date = value instanceof Date ? value : new Date(value as any);
  return Number.isFinite(date.getTime()) ? date : undefined;
};

const hydrateItem = (raw: any): TodoItem => ({
  ...raw,
  dueDate: toOptionalDate(raw?.dueDate),
  reminderTime: toOptionalDate(raw?.reminderTime),
  completedAt: toOptionalDate(raw?.completedAt),
  createdAt: toOptionalDate(raw?.createdAt),
  modifiedAt: toOptionalDate(raw?.modifiedAt),
  voiceRecording: raw?.voiceRecording
    ? {
        ...raw.voiceRecording,
        timestamp: toOptionalDate(raw.voiceRecording.timestamp) ?? new Date(),
      }
    : undefined,
  subtasks: Array.isArray(raw?.subtasks) ? raw.subtasks.map(hydrateItem) : undefined,
});

const openDB = (): Promise<IDBDatabase> => {
  // Return existing connection immediately
  if (dbConnection && dbConnection.objectStoreNames.length > 0) {
    return Promise.resolve(dbConnection);
  }
  
  if (dbConnectionPromise) {
    return dbConnectionPromise;
  }

  dbConnectionPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    // Timeout: if IndexedDB doesn't open in 5s, reject
    const timeout = setTimeout(() => {
      dbConnectionPromise = null;
      reject(new Error('Tasks IndexedDB open timed out'));
    }, 5000);
    
    request.onerror = () => {
      clearTimeout(timeout);
      dbConnectionPromise = null;
      reject(request.error);
    };
    
    request.onsuccess = () => {
      clearTimeout(timeout);
      dbConnection = request.result;
      
      // Handle connection close
      dbConnection.onclose = () => {
        dbConnection = null;
        dbConnectionPromise = null;
      };
      
      resolve(dbConnection);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Store for all tasks
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('completed', 'completed', { unique: false });
        store.createIndex('dueDate', 'dueDate', { unique: false });
        store.createIndex('sectionId', 'sectionId', { unique: false });
      }
      
      // Store for metadata
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
  });

  return dbConnectionPromise;
};

// Load all tasks from IndexedDB (with streaming for large datasets)
export const loadTasksFromDB = async (): Promise<TodoItem[]> => {
  // Return cached data if available
  if (tasksCache !== null) {
    return tasksCache;
  }
  
  try {
    const db = await openDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onerror = () => {
        // Don't close connection - keep it pooled
        console.warn('Failed to load tasks:', request.error);
        resolve([]);
      };
      
      request.onsuccess = () => {
        try {
          const items = request.result.map(hydrateItem);
          // Automated UI/data check: strip any legacy "(Copy)" suffixes that
          // older versions of the app may have persisted. We re-save in the
          // background if anything actually changed.
          import('@/utils/duplicateName').then(({ sanitizeCopySuffixes }) => {
            const { items: cleaned, changed } = sanitizeCopySuffixes(items);
            if (changed) {
              setTasksCache(cleaned);
              // Skip sync push — this is a cosmetic local cleanup that the
              // next legitimate save will mirror to the cloud.
              setTimeout(() => { void bulkPutTasksInDB(cleaned, true); }, 0);
            }
          }).catch(() => {});
          setTasksCache(items);
          resolve(items);
        } catch (e) {
          console.warn('Failed to hydrate tasks:', e);
          resolve([]);
        }
      };
    });
  } catch (e) {
    console.warn('IndexedDB load failed, returning empty array:', e);
    return [];
  }
};

// Save tasks to IndexedDB (optimized batch operation for 100B+ items)
export const saveTasksToDB = async (items: TodoItem[], skipSyncEvent = false): Promise<boolean> => {
  // Safety net: refuse to wipe a previously non-empty store with an empty array.
  // This protects against logout/login races where some caller momentarily holds
  // `[]` before the real data finishes loading. Callers that legitimately need
  // to clear everything should delete tasks individually (which pushes deletes
  // to the cloud) or call the dedicated reset path.
  if (items.length === 0) {
    const hadCachedItems = Array.isArray(tasksCache) && tasksCache.length > 0;
    let hadStoredItems = false;
    if (!hadCachedItems) {
      try {
        const existing = await loadTasksFromDB();
        hadStoredItems = existing.length > 0;
      } catch {}
    }
    if (hadCachedItems || hadStoredItems) {
      console.warn('[taskStorage] Blocked attempt to wipe tasks with an empty array');
      return false;
    }
  }

  // IndexedDB is the source of truth. Clear old localStorage mirrors so deleted
  // sample/template tasks cannot be imported again on the next launch.
  markLocalStorageMigrationDone();

  // ALWAYS update in-memory cache immediately so any sync reads see latest data
  setTasksCache(items);

  // Mirror to Lovable Cloud (offline-queued). Skipped when this save was itself
  // triggered by an inbound realtime event (skipSyncEvent=true) to avoid loops.
  if (!skipSyncEvent) {
    import('@/utils/cloudSync/storeBridge').then(({ pushTasks }) => {
      try { pushTasks(items); } catch {}
    }).catch(() => {});
  }


  // Throttle actual IndexedDB writes to prevent overwhelming the database
  const now = Date.now();
  if (now - lastSaveTime < MIN_SAVE_INTERVAL) {
    pendingFlushItems = items;
    pendingSkipSyncEvent = skipSyncEvent;
    if (pendingFlushTimer) clearTimeout(pendingFlushTimer);
    pendingFlushTimer = setTimeout(() => {
      const queuedItems = pendingFlushItems ?? items;
      const queuedSkipSyncEvent = pendingSkipSyncEvent;
      pendingFlushItems = null;
      pendingSkipSyncEvent = false;
      pendingFlushTimer = null;
      void flushTasksToDB(queuedItems, queuedSkipSyncEvent);
    }, MIN_SAVE_INTERVAL);
    return true;
  }

  if (pendingFlushTimer) {
    clearTimeout(pendingFlushTimer);
    pendingFlushTimer = null;
    pendingFlushItems = null;
    pendingSkipSyncEvent = false;
  }

  lastSaveTime = now;

  return flushTasksToDB(items, skipSyncEvent);
};

// Internal: actually write to IndexedDB (cache is already updated by caller)
const flushTasksToDB = async (items: TodoItem[], skipSyncEvent = false): Promise<boolean> => {
  lastSaveTime = Date.now();

  try {
    const db = await openDB();
    
    // For very large datasets, use batch processing
    if (items.length > BATCH_SIZE) {
      return saveLargeDataset(db, items, skipSyncEvent);
    }
    
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      // Clear existing and add all new
      const clearRequest = store.clear();
      
      clearRequest.onsuccess = () => {
        if (items.length === 0) {
          setTasksCache(items);
          if (!skipSyncEvent) dispatchTasksUpdated();
          resolve(true);
          return;
        }
        
        // Use put instead of add for better performance
        items.forEach(item => {
          try {
            store.put(item);
          } catch (e) {
            console.warn('Failed to put task:', item.id);
          }
        });
      };
      
      clearRequest.onerror = () => {
        console.warn('Clear failed, continuing with put operations');
        items.forEach(item => {
          try {
            store.put(item);
          } catch {}
        });
      };
      
      transaction.oncomplete = () => {
        if (!skipSyncEvent) dispatchTasksUpdated();
        resolve(true);
      };
      
      transaction.onerror = () => {
        console.warn('Transaction error, data may be partially saved');
        if (!skipSyncEvent) dispatchTasksUpdated();
        resolve(true);
      };
    });
  } catch (e) {
    console.warn('IndexedDB save failed, using memory cache only:', e);
    return true; // Graceful degradation - cache is already updated
  }
};

// Save large datasets in batches (for 100B+ items)
const saveLargeDataset = async (db: IDBDatabase, items: TodoItem[], skipSyncEvent = false): Promise<boolean> => {
  try {
    // Clear all existing data first
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve(); // Continue even if clear fails
    });

    // Process in batches to avoid blocking UI
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        batch.forEach(item => {
          try {
            store.put(item);
          } catch {}
        });
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve(); // Continue even on error
      });
      
      // Yield to main thread between batches
      if (i + BATCH_SIZE < items.length) {
        await new Promise(r => requestAnimationFrame(r));
      }
    }

    if (!skipSyncEvent) dispatchTasksUpdated();
    
    return true;
  } catch (e) {
    console.warn('Large dataset save failed:', e);
    return true; // Graceful degradation - cache already updated by caller
  }
};

// Update a single task without rewriting everything
export const updateTaskInDB = async (taskId: string, updates: Partial<TodoItem>): Promise<boolean> => {
  markLocalStorageMigrationDone();
  let updatedForSync: TodoItem | null = null;

  // Update cache immediately
  if (tasksCache) {
    const index = tasksCacheIndex?.get(taskId) ?? -1;
    if (index >= 0) {
      tasksCache[index] = { ...tasksCache[index], ...updates };
      updatedForSync = tasksCache[index];
      cacheVersion++;
    }
  }
  
  try {
    const db = await openDB();
    
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(taskId);
      
      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (existing) {
          const updated = { ...existing, ...updates };
          updatedForSync = hydrateItem(updated);
          store.put(updated);
        }
      };
      
      transaction.oncomplete = () => {
        if (updatedForSync) {
          scheduleTaskCloudPush([updatedForSync]);
        }
        const isLightCompletionUpdate = Object.keys(updates).every((k) => k === 'completed' || k === 'completedAt' || k === 'modifiedAt');
        dispatchTasksUpdated(isLightCompletionUpdate ? 1800 : 400);
        resolve(true);
      };
      transaction.onerror = () => {
        const isLightCompletionUpdate = Object.keys(updates).every((k) => k === 'completed' || k === 'completedAt' || k === 'modifiedAt');
        dispatchTasksUpdated(isLightCompletionUpdate ? 1800 : 400);
        resolve(true);
      };
    });
  } catch (e) {
    console.warn('Update task failed, cache is still updated:', e);
    return true; // Graceful degradation
  }
};

// Lightweight count for stats/profile screens. Avoids materializing 10k–100k
// task objects just to show a number, preventing mobile Chrome "Aw, Snap" OOMs.
export const countTasksInDB = async (): Promise<number> => {
  if (tasksCache) return tasksCache.length;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).count();
      request.onsuccess = () => resolve(Number(request.result) || 0);
      request.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
};

// Insert or replace a single task without rewriting the whole tasks store.
export const putTaskInDB = async (task: TodoItem, skipSyncEvent = false): Promise<boolean> => {
  markLocalStorageMigrationDone();
  const hydrated = hydrateItem(task);

  if (tasksCache) {
    const index = tasksCacheIndex?.get(hydrated.id) ?? -1;
    if (index >= 0) tasksCache[index] = hydrated;
    else {
      tasksCache.unshift(hydrated);
      rebuildTasksCacheIndex();
    }
    cacheVersion++;
  }

  if (!skipSyncEvent) scheduleTaskCloudPush([hydrated]);

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(hydrated);
      transaction.oncomplete = () => {
        if (!skipSyncEvent) dispatchTasksUpdated(250);
        resolve(true);
      };
      transaction.onerror = () => {
        if (!skipSyncEvent) dispatchTasksUpdated(250);
        resolve(true);
      };
    });
  } catch (e) {
    console.warn('Put task failed, cache is still updated:', e);
    return true;
  }
};

// Bulk update existing tasks without treating the provided array as the whole
// cache. Used by rapid completion batching: optimistic React state updates must
// not wait on IndexedDB/Supabase, and a partial completion batch must never
// replace a cold full-task cache with only the changed rows.
export const bulkUpdateTasksInDB = async (
  updatedTasks: TodoItem[],
  skipSyncEvent = false,
): Promise<boolean> => {
  if (updatedTasks.length === 0) return true;
  markLocalStorageMigrationDone();

  const hydrated = updatedTasks.map(hydrateItem);

  if (tasksCache) {
    hydrated.forEach((task) => {
      const index = tasksCacheIndex?.get(task.id) ?? -1;
      if (index >= 0) tasksCache![index] = task;
    });
    cacheVersion++;
  }

  if (!skipSyncEvent) scheduleTaskCloudPush(hydrated);

  try {
    const db = await openDB();
    for (let i = 0; i < hydrated.length; i += 250) {
      const batch = hydrated.slice(i, i + 250);
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        batch.forEach((task) => { try { store.put(task); } catch {} });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      if (i + 250 < hydrated.length) await new Promise((r) => requestAnimationFrame(r));
    }
    if (!skipSyncEvent) dispatchTasksUpdated(150);
    return true;
  } catch (e) {
    console.warn('Bulk update tasks failed, cache is still updated:', e);
    return true;
  }
};

// Bulk additive insert/replace for many tasks at once. Unlike saveTasksToDB
// this does NOT clear the store — so adding 100 (or 100k) new tasks does not
// rewrite the existing ones. Used by batch-add flows to avoid multi-second
// freezes on large stores.
export const bulkPutTasksInDB = async (
  newTasks: TodoItem[],
  skipSyncEvent = false,
  taskUpdatedDelayMs = 150,
): Promise<boolean> => {
  if (newTasks.length === 0) return true;
  markLocalStorageMigrationDone();

  const hydrated = newTasks.map(hydrateItem);

  mergeTasksIntoCache(hydrated);

  if (!skipSyncEvent) scheduleTaskCloudPush(hydrated);

  try {
    const db = await openDB();
    for (let i = 0; i < hydrated.length; i += BATCH_SIZE) {
      const batch = hydrated.slice(i, i + BATCH_SIZE);
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        batch.forEach((item) => { try { store.put(item); } catch {} });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      // Yield to the main thread between batches so scrolling/typing stay live.
      if (i + BATCH_SIZE < hydrated.length) {
        await new Promise((r) => requestAnimationFrame(r));
      }
    }
    if (!skipSyncEvent) dispatchTasksUpdated(taskUpdatedDelayMs);
    return true;
  } catch (e) {
    console.warn('Bulk put tasks failed, cache is still updated:', e);
    return true;
  }
};

// ── Bulk insert via Web Worker ──────────────────────────────────────────────
// Same contract as `bulkPutTasksInDB` but the actual IndexedDB writes happen
// on a worker thread, so adding 100k tasks never blocks scroll, navigation,
// or the completion-ring animation. Falls back to the main-thread path if
// the worker fails to spawn (older browsers, blocked module workers, etc.).
let bulkWorker: Worker | null = null;
let bulkWorkerFailed = false;
let bulkReqCounter = 0;
type BulkCallback = {
  resolve: (ok: boolean) => void;
  onProgress?: (p: { written: number; total: number }) => void;
};
const bulkCallbacks = new Map<number, BulkCallback>();

const getBulkWorker = (): Worker | null => {
  if (bulkWorkerFailed) return null;
  if (bulkWorker) return bulkWorker;
  try {
    bulkWorker = new Worker(
      new URL('../workers/bulkTaskWorker.ts', import.meta.url),
      { type: 'module' },
    );
    bulkWorker.onmessage = (e: MessageEvent) => {
      const { id, type, written, total, duration } = e.data || {};
      const cb = bulkCallbacks.get(id);
      if (!cb) return;
      if (type === 'progress') {
        cb.onProgress?.({ written, total });
      } else if (type === 'done') {
        bulkCallbacks.delete(id);
        import('@/utils/perfLogger').then(({ logPerfEvent }) => {
          logPerfEvent('bulkAdd', {
            count: written,
            ms: Math.round(duration || 0),
            via: 'worker',
          });
        }).catch(() => {});
        cb.resolve(true);
      } else if (type === 'error') {
        bulkCallbacks.delete(id);
        cb.resolve(false);
      }
    };
    bulkWorker.onerror = () => {
      console.warn('[taskStorage] bulk worker failed, falling back to main thread');
      bulkWorkerFailed = true;
      bulkWorker = null;
    };
    return bulkWorker;
  } catch {
    bulkWorkerFailed = true;
    return null;
  }
};

export const bulkPutTasksInWorker = async (
  newTasks: TodoItem[],
  skipSyncEvent = false,
  onProgress?: (p: { written: number; total: number }) => void,
  taskUpdatedDelayMs = 150,
): Promise<boolean> => {
  if (newTasks.length === 0) return true;
  markLocalStorageMigrationDone();
  const hydrated = newTasks.map(hydrateItem);

  // Update the in-memory cache synchronously so the UI sees the new rows
  // immediately, regardless of how long the worker takes to drain.
  mergeTasksIntoCache(hydrated);

  if (!skipSyncEvent) scheduleTaskCloudPush(hydrated);

  const worker = getBulkWorker();
  if (!worker) {
    // Graceful fallback: keep the existing main-thread batched path so adding
    // tasks always works even if the worker can't initialise.
    const t0 = performance.now();
    const ok = await bulkPutTasksInDB(newTasks, skipSyncEvent, taskUpdatedDelayMs);
    import('@/utils/perfLogger').then(({ logPerfEvent }) => {
      logPerfEvent('bulkAdd', {
        count: newTasks.length,
        ms: Math.round(performance.now() - t0),
        via: 'main-thread-fallback',
      });
    }).catch(() => {});
    return ok;
  }

  const id = ++bulkReqCounter;
  return new Promise<boolean>((resolve) => {
    bulkCallbacks.set(id, {
      resolve: (ok) => {
        if (!skipSyncEvent) dispatchTasksUpdated(taskUpdatedDelayMs);
        resolve(ok);
      },
      onProgress,
    });
    // structured-clone serialises Date / nested objects safely.
    worker.postMessage({ id, type: 'bulkPut', items: hydrated });
  });
};


// Dedicated reset path for developer/performance tools. This intentionally
// bypasses the empty-array safety guard in saveTasksToDB while clearing cache.
export const clearAllTasksFromDB = async (): Promise<boolean> => {
  markLocalStorageMigrationDone();
  setTasksCache([]);

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => {
        dispatchTasksUpdated();
        resolve(true);
      };
      transaction.onerror = () => {
        dispatchTasksUpdated();
        resolve(true);
      };
    });
  } catch (e) {
    console.warn('Clear all tasks failed, cache has still been cleared:', e);
    return true;
  }
};

// Delete a task
export const deleteTaskFromDB = async (taskId: string): Promise<boolean> => {
  markLocalStorageMigrationDone();
  // Update cache immediately
  if (tasksCache) {
    const index = tasksCacheIndex?.get(taskId) ?? -1;
    if (index >= 0) {
      tasksCache.splice(index, 1);
      rebuildTasksCacheIndex();
      cacheVersion++;
    }
  }
  
  // Mirror delete to Lovable Cloud
  import('@/utils/cloudSync/storeBridge').then(({ pushTaskDelete }) => {
    try { pushTaskDelete(taskId); } catch {}
  }).catch(() => {});

  try {
    const db = await openDB();

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.delete(taskId);
      
      transaction.oncomplete = () => {
        dispatchTasksUpdated(250);
        // Track deletion for cross-device sync and upload immediately
        import('@/utils/deletionTracker').then(({ trackDeletion, loadDeletions }) => {
          trackDeletion(taskId, 'tasks');
          import('@/utils/googleDriveSync').then(({ uploadCategory }) => {
            uploadCategory('flowist_deletions.json', loadDeletions()).catch(() => {});
          });
        });
        resolve(true);
      };
      transaction.onerror = () => {
        dispatchTasksUpdated(250);
        resolve(true);
      };
    });
  } catch (e) {
    console.warn('Delete task failed, cache is still updated:', e);
    return true; // Graceful degradation
  }
};

// Chunked bulk delete — used by selection-mode "Delete" so removing 10k+
// tasks never blocks the main thread or the cloud-push pipeline.
export const bulkDeleteTasksFromDB = async (
  taskIds: string[],
  skipSyncEvent = false,
): Promise<boolean> => {
  if (taskIds.length === 0) return true;
  markLocalStorageMigrationDone();
  const idSet = new Set(taskIds);

  // 1. Cache update — synchronous so the UI hides rows immediately.
  if (tasksCache) {
    tasksCache = tasksCache.filter(t => !idSet.has(t.id));
    rebuildTasksCacheIndex();
    cacheVersion++;
  }

  // 2. Single tracker write + cloud deletes (batched).
  if (!skipSyncEvent) {
    try {
      const { trackDeletion, loadDeletions } = await import('@/utils/deletionTracker');
      taskIds.forEach(id => trackDeletion(id, 'tasks'));
      import('@/utils/googleDriveSync').then(({ uploadCategory }) => {
        uploadCategory('flowist_deletions.json', loadDeletions()).catch(() => {});
      }).catch(() => {});
    } catch {}
    import('@/utils/cloudSync/storeBridge').then((mod: any) => {
      const fn = mod.pushTaskDeletes || mod.pushTaskDelete;
      if (typeof fn === 'function') {
        try {
          if (mod.pushTaskDeletes) fn(taskIds);
          else taskIds.forEach(id => fn(id));
        } catch {}
      }
    }).catch(() => {});
  }

  // 3. Chunked IndexedDB deletes (yield between chunks).
  try {
    const db = await openDB();
    const CHUNK = 500;
    for (let start = 0; start < taskIds.length; start += CHUNK) {
      const slice = taskIds.slice(start, start + CHUNK);
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const id of slice) { try { store.delete(id); } catch {} }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      if (start + CHUNK < taskIds.length) {
        await new Promise((r) => requestAnimationFrame(r));
      }
    }
    if (!skipSyncEvent) dispatchTasksUpdated(250);
    return true;
  } catch (e) {
    console.warn('Bulk delete tasks failed, cache is still updated:', e);
    return true;
  }
};

// Migrate from localStorage to IndexedDB (silent, non-blocking)
export const migrateFromLocalStorage = async (): Promise<{ migrated: boolean; count: number }> => {
  try {
    if (localStorage.getItem(LOCAL_STORAGE_MIGRATION_DONE_KEY) === 'true') {
      localStorage.removeItem(TODO_ITEMS_KEY);
      return { migrated: false, count: 0 };
    }
  } catch {}
  
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(TODO_ITEMS_KEY);
  } catch {
    return { migrated: false, count: 0 };
  }
  
  if (!saved) {
    markLocalStorageMigrationDone();
    return { migrated: false, count: 0 };
  }
  
  try {
    const parsed = JSON.parse(saved);
    const items: TodoItem[] = Array.isArray(parsed) ? parsed.map(hydrateItem) : [];
    
    if (items.length === 0) {
      markLocalStorageMigrationDone();
      return { migrated: false, count: 0 };
    }
    
    // Check if IndexedDB already has data
    const existingItems = await loadTasksFromDB();
    if (existingItems.length > 0) {
      // Already migrated, just clear localStorage to free space
      markLocalStorageMigrationDone();
      return { migrated: false, count: existingItems.length };
    }
    
    // Only legacy localStorage should be imported once. If the user has already
    // been using IndexedDB (or just deleted all tasks), stale localStorage must
    // not resurrect old sample/template tasks.
    const hasExplicitMigrationMarker = localStorage.getItem(LOCAL_STORAGE_MIGRATION_DONE_KEY) === 'true';
    if (!hasExplicitMigrationMarker) {
      await saveTasksToDB(items);
    }
    
    // Clear localStorage to free quota
    markLocalStorageMigrationDone();
    
    console.log(`Migrated ${items.length} tasks from localStorage to IndexedDB`);
    return { migrated: true, count: items.length };
  } catch (e) {
    console.error('Migration failed:', e);
    return { migrated: false, count: 0 };
  }
};

// Clear cache (call when you need fresh data)
export const clearTasksCache = () => {
  setTasksCache(null);
};

// Get cache version for React dependencies
export const getTasksCacheVersion = () => cacheVersion;

// Get storage estimate
export const getTasksStorageInfo = async (): Promise<{ taskCount: number; estimatedSizeKB: number }> => {
  const tasks = await loadTasksFromDB();
  const jsonString = JSON.stringify(tasks);
  return {
    taskCount: tasks.length,
    estimatedSizeKB: Math.round(jsonString.length / 1024),
  };
};

// Paged loading with IDBCursor for progressive rendering of large datasets
export const loadTasksPagedFromDB = async (
  offset: number,
  limit: number
): Promise<{ items: TodoItem[]; hasMore: boolean }> => {
  // If cache exists and covers the range, use it
  if (tasksCache !== null) {
    const slice = tasksCache.slice(offset, offset + limit);
    return { items: slice, hasMore: offset + limit < tasksCache.length };
  }

  try {
    const db = await openDB();

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const results: TodoItem[] = [];
      let skipped = 0;
      const cursorRequest = store.openCursor();

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          resolve({ items: results, hasMore: false });
          return;
        }

        if (skipped < offset) {
          skipped++;
          cursor.continue();
          return;
        }

        if (results.length < limit) {
          results.push(hydrateItem(cursor.value));
          cursor.continue();
        } else {
          // We have enough, there's more data
          resolve({ items: results, hasMore: true });
        }
      };

      cursorRequest.onerror = () => {
        console.warn('Cursor paged load failed:', cursorRequest.error);
        resolve({ items: [], hasMore: false });
      };
    });
  } catch (e) {
    console.warn('Paged load failed:', e);
    return { items: [], hasMore: false };
  }
};
