/**
 * Per-user, per-table sync state stored in localStorage.
 * Tracks last_sync_timestamp so reconnects only refetch missed events.
 */
import type { SyncTable } from './syncTables';

const key = (userId: string, table: SyncTable) =>
  `flowist_sync_ts:${userId}:${table}`;

export function getLastSync(userId: string, table: SyncTable): string | null {
  try { return localStorage.getItem(key(userId, table)); } catch { return null; }
}

export function setLastSync(userId: string, table: SyncTable, iso: string): void {
  try { localStorage.setItem(key(userId, table), iso); } catch {}
}

export function clearAllSyncState(userId: string): void {
  try {
    const prefix = `flowist_sync_ts:${userId}:`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) localStorage.removeItem(k);
    }
  } catch {}
}
