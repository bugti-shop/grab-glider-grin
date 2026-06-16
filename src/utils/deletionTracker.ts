/**
 * Deletion tracker — records deleted item IDs so deletions sync across devices.
 * Uses IndexedDB (via settingsStorage) to persist queued operations.
 */
import { getSetting, setSetting } from '@/utils/settingsStorage';

export interface DeletionRecord {
  id: string;
  category: 'notes' | 'tasks' | 'habits' | 'folders' | 'noteFolders' | 'todoSections' | 'todoFolders';
  deletedAt: number; // timestamp
}

const DELETIONS_KEY = 'flowist_deletions';

// In-memory cache for synchronous access
let _deletionsCache: DeletionRecord[] | null = null;

export const loadDeletions = (): DeletionRecord[] => {
  return _deletionsCache ?? [];
};

/** Async load from IndexedDB — call at startup */
export const loadDeletionsAsync = async (): Promise<DeletionRecord[]> => {
  try {
    const stored = await getSetting<DeletionRecord[]>(DELETIONS_KEY, []);
    _deletionsCache = stored;
    return stored;
  } catch {
    return [];
  }
};

export const saveDeletions = (records: DeletionRecord[]): void => {
  // Keep only last 30 days of deletions to avoid unbounded growth
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const trimmed = records.filter((r) => r.deletedAt > cutoff);
  _deletionsCache = trimmed;
  setSetting(DELETIONS_KEY, trimmed).catch(console.error);
};

export const trackDeletion = (id: string, category: DeletionRecord['category']): void => {
  const records = loadDeletions();
  // Avoid duplicates
  if (records.some((r) => r.id === id && r.category === category)) return;
  records.push({ id, category, deletedAt: Date.now() });
  saveDeletions(records);
};

/**
 * Merge local and remote deletion records (union, dedupe by id+category).
 */
export const mergeDeletions = (local: DeletionRecord[], remote: DeletionRecord[]): DeletionRecord[] => {
  const map = new Map<string, DeletionRecord>();
  for (const r of [...local, ...remote]) {
    const key = `${r.category}::${r.id}`;
    const existing = map.get(key);
    if (!existing || r.deletedAt > existing.deletedAt) {
      map.set(key, r);
    }
  }
  return Array.from(map.values());
};

/**
 * Apply deletions to an array of items — remove any items whose IDs appear
 * in the deletion records for the given category.
 */
export const applyDeletions = <T extends { id: string; createdAt?: any; updatedAt?: any; modifiedAt?: any }>(
  items: T[],
  deletions: DeletionRecord[],
  category: DeletionRecord['category'],
): T[] => {
  const deletedIds = new Set(
    deletions.filter((r) => r.category === category).map((r) => r.id),
  );
  return items.filter((item) => !deletedIds.has(item.id));
};
