/**
 * Drive sync conflict detection & resolution.
 *
 * Before overwriting local data with remote, we compare a lightweight hash
 * of both sides. If they diverge and both have changes since last sync,
 * we emit a conflict event so the UI can ask the user what to do.
 */

import { getSetting, setSetting } from '@/utils/settingsStorage';

export type ConflictCategory = 'notes' | 'tasks' | 'habits' | 'folders' | 'settings' | 'streaks' | 'gamification' | 'journey' | 'tags';

export type ConflictResolution = 'keep_local' | 'keep_remote' | 'merge';

export interface SyncConflict {
  category: ConflictCategory;
  localCount: number;
  remoteCount: number;
  localLastModified: number;
  remoteLastModified: number;
  localData: any;
  remoteData: any;
}

// ── Lightweight hash for change detection ────────────────────────────────

/** Fast, non-cryptographic hash of JSON-serialisable data */
export const quickHash = (data: any): string => {
  const str = JSON.stringify(data);
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
};

// ── Per-category hash storage ────────────────────────────────────────────

const hashKey = (cat: ConflictCategory) => `drive_hash_${cat}`;

export const getStoredHash = async (cat: ConflictCategory): Promise<string> =>
  getSetting<string>(hashKey(cat), '');

export const storeHash = async (cat: ConflictCategory, data: any): Promise<void> => {
  await setSetting(hashKey(cat), quickHash(data));
};

// ── Conflict detection ───────────────────────────────────────────────────

const getItemCount = (data: any): number => {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') return Object.keys(data).length;
  return 0;
};

const getLatestTimestamp = (data: any): number => {
  if (!Array.isArray(data)) return 0;
  let latest = 0;
  for (const item of data) {
    const t = new Date(item.updatedAt || item.modifiedAt || item.createdAt || 0).getTime();
    if (t > latest) latest = t;
  }
  return latest;
};

/**
 * Compare local data with remote data.
 * Returns a SyncConflict if both sides changed since the last stored hash,
 * or null if one side is unchanged (safe to overwrite).
 */
export const detectConflict = async (
  category: ConflictCategory,
  localData: any,
  remoteData: any,
): Promise<SyncConflict | null> => {
  const storedHash = await getStoredHash(category);
  const localHash = quickHash(localData);
  const remoteHash = quickHash(remoteData);

  // Identical — no conflict
  if (localHash === remoteHash) return null;

  // If one side matches the stored hash, the other is strictly newer — no conflict
  if (storedHash && (localHash === storedHash || remoteHash === storedHash)) return null;

  // Both sides differ from the last-known state → conflict
  return {
    category,
    localCount: getItemCount(localData),
    remoteCount: getItemCount(remoteData),
    localLastModified: getLatestTimestamp(localData),
    remoteLastModified: getLatestTimestamp(remoteData),
    localData,
    remoteData,
  };
};

// ── Event-based conflict flow ────────────────────────────────────────────

let pendingConflicts: SyncConflict[] = [];
let resolvers: Map<ConflictCategory, (resolution: ConflictResolution) => void> = new Map();

export const getPendingConflicts = (): SyncConflict[] => [...pendingConflicts];

/**
 * Queue a conflict and wait for the user to resolve it.
 * Returns a promise that resolves with the user's choice.
 */
export const requestConflictResolution = (
  conflict: SyncConflict,
): Promise<ConflictResolution> => {
  return new Promise((resolve) => {
    pendingConflicts.push(conflict);
    resolvers.set(conflict.category, resolve);

    // Notify the UI
    window.dispatchEvent(
      new CustomEvent('syncConflictDetected', {
        detail: { conflicts: getPendingConflicts() },
      }),
    );
  });
};

/**
 * Called by the UI when the user makes a choice.
 */
export const resolveConflict = (
  category: ConflictCategory,
  resolution: ConflictResolution,
): void => {
  const resolver = resolvers.get(category);
  if (resolver) {
    resolver(resolution);
    resolvers.delete(category);
  }
  pendingConflicts = pendingConflicts.filter((c) => c.category !== category);

  // If all resolved, notify UI to close
  if (pendingConflicts.length === 0) {
    window.dispatchEvent(new CustomEvent('syncConflictsResolved'));
  }
};

/**
 * Resolve all pending conflicts with the same resolution.
 */
export const resolveAllConflicts = (resolution: ConflictResolution): void => {
  for (const conflict of [...pendingConflicts]) {
    resolveConflict(conflict.category, resolution);
  }
};

// ── Merge helper (union by ID, preferring newer) ─────────────────────────

export const mergeArraysById = <T extends { id: string; updatedAt?: any; modifiedAt?: any; createdAt?: any }>(
  local: T[],
  remote: T[],
): T[] => {
  const map = new Map<string, T>();

  for (const item of local) map.set(item.id, item);

  for (const rItem of remote) {
    const existing = map.get(rItem.id);
    if (!existing) {
      map.set(rItem.id, rItem);
    } else {
      const localTime = new Date(existing.updatedAt || existing.modifiedAt || existing.createdAt || 0).getTime();
      const remoteTime = new Date(rItem.updatedAt || rItem.modifiedAt || rItem.createdAt || 0).getTime();
      if (remoteTime > localTime && remoteTime > 0) {
        map.set(rItem.id, rItem);
      }
    }
  }

  return Array.from(map.values());
};
