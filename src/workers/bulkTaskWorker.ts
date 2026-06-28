/**
 * bulkTaskWorker — performs IndexedDB bulk inserts for tasks on a background
 * thread. Keeps adding 100k+ tasks from freezing the main thread, scroll, or
 * the bottom navigation bar.
 *
 * Protocol (postMessage):
 *   IN  : { id, type: 'bulkPut', items: any[] }
 *   OUT : { id, type: 'progress', written, total }
 *   OUT : { id, type: 'done',    written, duration }
 *   OUT : { id, type: 'error',   error }
 */

const DB_NAME = 'nota-tasks-db';
const DB_VERSION = 3;
const STORE_NAME = 'tasks';
const META_STORE = 'meta';
const BATCH = 5000;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('completed', 'completed', { unique: false });
        store.createIndex('dueDate', 'dueDate', { unique: false });
        store.createIndex('sectionId', 'sectionId', { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
  });
  return dbPromise;
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data || {};
  const { id, type, items } = msg;
  if (type !== 'bulkPut' || !Array.isArray(items)) return;

  const started = (self as any).performance ? (self as any).performance.now() : Date.now();
  try {
    const db = await openDB();
    let written = 0;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const item of batch) {
          try { store.put(item); } catch {}
        }
        tx.oncomplete = () => { written += batch.length; resolve(); };
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
      (self as any).postMessage({ id, type: 'progress', written, total: items.length });
    }
    const now = (self as any).performance ? (self as any).performance.now() : Date.now();
    (self as any).postMessage({ id, type: 'done', written, duration: now - started });
  } catch (err: any) {
    (self as any).postMessage({ id, type: 'error', error: String(err?.message ?? err) });
  }
};

export {};
