/**
 * Offline write queue. Buffers writes locally when the device is offline or the
 * Supabase request fails, then flushes on reconnect / sync event. Each entry is
 * idempotent: an upsert keyed by row id. Last-write-wins is enforced server-side
 * by updated_at on the row.
 */
import { supabase } from '@/integrations/supabase/client';
import type { SyncTable, SyncRow } from './syncTables';

const STORAGE_KEY = 'flowist_sync_write_queue_v1';
const MAX_RETRIES = 8;

interface QueuedWrite {
  id: string;          // queue entry id
  table: SyncTable;
  op: 'upsert' | 'delete';
  row: Partial<SyncRow> & { id: string };
  attempts: number;
  enqueuedAt: number;
}

function load(): QueuedWrite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as QueuedWrite[] : [];
  } catch { return []; }
}
function save(q: QueuedWrite[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(q)); } catch {}
}

let flushing = false;
let flushPromise: Promise<void> | null = null;

export function enqueueWrite(
  table: SyncTable,
  op: 'upsert' | 'delete',
  row: Partial<SyncRow> & { id: string },
): void {
  const q = load();
  // dedupe: keep only the latest entry per (table,id)
  const filtered = q.filter(e => !(e.table === table && e.row.id === row.id));
  filtered.push({
    id: `${table}:${row.id}:${Date.now()}`,
    table, op, row,
    attempts: 0,
    enqueuedAt: Date.now(),
  });
  save(filtered);
  // Try to flush opportunistically
  if (typeof navigator === 'undefined' || navigator.onLine) {
    void flushQueue();
  }
}

export function getQueueLength(): number {
  return load().length;
}

export async function flushQueue(): Promise<void> {
  if (flushing && flushPromise) return flushPromise;
  flushing = true;
  flushPromise = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const userId = session.user.id;

      let q = load();
      const processingIds = new Set(q.map(entry => entry.id));
      const remaining: QueuedWrite[] = [];
      for (const entry of q) {
        try {
          if (entry.op === 'delete') {
            const { error } = await supabase
              .from(entry.table as any)
              .update({ is_deleted: true, updated_at: new Date().toISOString() } as any)
              .eq('id', entry.row.id)
              .eq('user_id', userId);
            if (error) throw error;
          } else {
            const payload = { ...entry.row, user_id: userId, updated_at: entry.row.updated_at ?? new Date().toISOString() };
            const { error } = await supabase
              .from(entry.table as any)
              .upsert(payload as any, { onConflict: 'id' });
            if (error) throw error;
          }
        } catch (err) {
          entry.attempts += 1;
          if (entry.attempts < MAX_RETRIES) remaining.push(entry);
          else console.warn('[sync] dropping write after max retries', entry, err);
        }
      }
      // Preserve writes enqueued while this flush was running. The old code
      // saved `remaining` from the initial snapshot and could accidentally
      // drop a new complete/delete write, letting stale cloud data restore it.
      const latest = load();
      const queuedDuringFlush = latest.filter(entry => !processingIds.has(entry.id));
      save([...remaining, ...queuedDuringFlush]);
    } finally {
      flushing = false;
      flushPromise = null;
      if ((typeof navigator === 'undefined' || navigator.onLine) && load().length > 0) {
        setTimeout(() => { void flushQueue(); }, 0);
      }
    }
  })();
  return flushPromise;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushQueue(); });
}
