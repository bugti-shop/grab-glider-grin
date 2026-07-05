/**
 * IndexedDB-backed cache for Web Clipper fetches.
 * Keyed by normalized URL. Stores the raw HTML returned by the
 * `fetch-article` edge function so users can re-clip the same page
 * while offline and get an instant snapshot without a network round-trip.
 */

const DB_NAME = 'flowist-webclip-cache';
const STORE = 'clips';
const VERSION = 1;
const MAX_ENTRIES = 200;

export interface CachedClip {
  url: string;          // normalized key
  rawHtml: string;
  status: number;
  capturedAt: number;   // epoch ms
  bytes: number;
}

const isBrowser = () => typeof window !== 'undefined' && 'indexedDB' in window;

const openDb = (): Promise<IDBDatabase | null> =>
  new Promise((resolve) => {
    if (!isBrowser()) return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'url' });
          store.createIndex('capturedAt', 'capturedAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

export const normalizeClipUrl = (raw: string): string => {
  const trimmed = (raw || '').trim();
  try {
    const u = new URL(trimmed);
    u.hash = '';
    return u.toString();
  } catch {
    return trimmed;
  }
};

export const getCachedClip = async (url: string): Promise<CachedClip | null> => {
  const db = await openDb();
  if (!db) return null;
  const key = normalizeClipUrl(url);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as CachedClip) || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

export const putCachedClip = async (
  entry: Omit<CachedClip, 'url' | 'capturedAt'> & { url: string; capturedAt?: number },
): Promise<void> => {
  const db = await openDb();
  if (!db) return;
  const record: CachedClip = {
    url: normalizeClipUrl(entry.url),
    rawHtml: entry.rawHtml,
    status: entry.status,
    bytes: entry.bytes,
    capturedAt: entry.capturedAt ?? Date.now(),
  };
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  // Best-effort LRU trim by capturedAt (oldest first).
  await trimCache().catch(() => {});
};

const trimCache = async (): Promise<void> => {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const countReq = store.count();
      countReq.onsuccess = () => {
        const excess = countReq.result - MAX_ENTRIES;
        if (excess <= 0) return resolve();
        const idx = store.index('capturedAt');
        const cursorReq = idx.openCursor();
        let removed = 0;
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor || removed >= excess) return resolve();
          cursor.delete();
          removed += 1;
          cursor.continue();
        };
        cursorReq.onerror = () => resolve();
      };
      countReq.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
};
