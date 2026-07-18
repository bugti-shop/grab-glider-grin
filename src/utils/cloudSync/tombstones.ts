/**
 * Tombstone registry — Prevents deleted rows from being resurrected by:
 *   - late upserts from a still-open editor / autosave
 *   - the one-time initial full upload
 *   - stale cloud snapshots arriving via realtime AFTER a local delete
 *
 * A tombstone is a tiny record `{ table, id, deletedAt }`. It lives in
 * localStorage under a single JSON blob and is garbage-collected after 30 days.
 *
 * Convention:
 *   - `markDeleted(table, id)` — call the moment a local delete is committed.
 *   - `isTombstoned(table, id, incomingTs?)` — call from write-queue AND from
 *     cloud-apply. Returns true when the incoming write/apply is older than
 *     (or equal to) the tombstone, so the caller can drop it.
 *   - `clearTombstone(table, id)` — call when the user genuinely re-creates
 *     the row (same id) so we stop blocking it.
 */
import type { SyncTable } from './syncTables';

const STORAGE_KEY = 'flowist:sync:tombstones:v1';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type TombstoneMap = Record<string, number>; // key = `${table}:${id}` → deletedAt (ms)

let cache: TombstoneMap | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const load = (): TombstoneMap => {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as TombstoneMap) : {};
  } catch {
    cache = {};
  }
  // GC
  const now = Date.now();
  let changed = false;
  for (const k of Object.keys(cache)) {
    if (now - cache[k] > TTL_MS) {
      delete cache[k];
      changed = true;
    }
  }
  if (changed) persist();
  return cache;
};

const persist = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache ?? {})); } catch {}
  }, 100);
};

const key = (table: SyncTable | string, id: string) => `${table}:${id}`;

export function markDeleted(table: SyncTable | string, id: string, when: number = Date.now()): void {
  const map = load();
  const existing = map[key(table, id)] ?? 0;
  if (when > existing) {
    map[key(table, id)] = when;
    persist();
  }
}

export function markDeletedMany(table: SyncTable | string, ids: string[], when: number = Date.now()): void {
  const map = load();
  let changed = false;
  for (const id of ids) {
    const k = key(table, id);
    if ((map[k] ?? 0) < when) {
      map[k] = when;
      changed = true;
    }
  }
  if (changed) persist();
}

/**
 * True if there is a tombstone for this id that is at least as recent as
 * `incomingTs` (or any tombstone when incomingTs is omitted).
 */
export function isTombstoned(table: SyncTable | string, id: string, incomingTs?: number): boolean {
  const map = load();
  const t = map[key(table, id)];
  if (!t) return false;
  if (incomingTs == null) return true;
  return t >= incomingTs;
}

export function clearTombstone(table: SyncTable | string, id: string): void {
  const map = load();
  if (map[key(table, id)] != null) {
    delete map[key(table, id)];
    persist();
  }
}

export function getTombstoneCount(): number {
  return Object.keys(load()).length;
}
