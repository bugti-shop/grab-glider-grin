/**
 * In-app notification store (IndexedDB-backed)
 * Captures task reminders, note events, streaks, achievements, etc.
 */

export interface InAppNotification {
  id: string;
  type: 'reminder' | 'streak' | 'achievement' | 'note' | 'task' | 'system';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  icon?: string; // lucide icon name
  actionPath?: string; // optional route to navigate to
}

const DB_NAME = 'nota-notifications-db';
const STORE_NAME = 'notifications';
const DB_VERSION = 1;
const MAX_NOTIFICATIONS = 100;

let dbPromise: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('read', 'read', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
};

export const addNotification = async (notif: Omit<InAppNotification, 'id' | 'timestamp' | 'read'>): Promise<InAppNotification> => {
  const db = await openDB();
  const full: InAppNotification = {
    ...notif,
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    read: false,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(full);
    tx.oncomplete = () => {
      window.dispatchEvent(new CustomEvent('inAppNotificationChanged'));
      resolve(full);
    };
    tx.onerror = () => reject(tx.error);
  });
};

export const getNotifications = async (limit = 50): Promise<InAppNotification[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const idx = store.index('timestamp');
    const req = idx.openCursor(null, 'prev');
    const results: InAppNotification[] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
};

export const getUnreadCount = async (): Promise<number> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const idx = store.index('read');
    const req = idx.count(IDBKeyRange.only(0)); // false stored as 0
    req.onsuccess = () => {
      // Fallback: count manually since boolean index can be tricky
      const allReq = store.getAll();
      allReq.onsuccess = () => {
        const all = allReq.result as InAppNotification[];
        resolve(all.filter(n => !n.read).length);
      };
      allReq.onerror = () => resolve(0);
    };
    req.onerror = () => resolve(0);
  });
};

export const markAsRead = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      if (req.result) {
        req.result.read = true;
        store.put(req.result);
      }
    };
    tx.oncomplete = () => {
      window.dispatchEvent(new CustomEvent('inAppNotificationChanged'));
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
};

export const markAllAsRead = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const val = cursor.value;
        if (!val.read) {
          val.read = true;
          cursor.update(val);
        }
        cursor.continue();
      }
    };
    tx.oncomplete = () => {
      window.dispatchEvent(new CustomEvent('inAppNotificationChanged'));
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
};

export const clearAllNotifications = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => {
      window.dispatchEvent(new CustomEvent('inAppNotificationChanged'));
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
};

export const deleteNotification = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => {
      window.dispatchEvent(new CustomEvent('inAppNotificationChanged'));
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
};

// Prune old notifications to keep store manageable
export const pruneNotifications = async (): Promise<void> => {
  const all = await getNotifications(MAX_NOTIFICATIONS + 50);
  if (all.length > MAX_NOTIFICATIONS) {
    const toDelete = all.slice(MAX_NOTIFICATIONS);
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    toDelete.forEach(n => store.delete(n.id));
  }
};
