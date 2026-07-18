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
const MAX_QUEUE_STORAGE_CHARS = 5 * 1024 * 1024;

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
    if (raw && raw.length > MAX_QUEUE_STORAGE_CHARS) {
      // A legacy queue could contain many duplicated 100k-word notes. Parsing
      // that JSON on startup blocks scrolling/navigation, so drop it and let
      // fresh lightweight writes rebuild the queue.
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
    return raw ? JSON.parse(raw) as QueuedWrite[] : [];
  } catch { return []; }
}
function save(q: QueuedWrite[]): void {
  try {
    const raw = JSON.stringify(q);
    if (raw.length > MAX_QUEUE_STORAGE_CHARS) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(q.slice(-500)));
      return;
    }
    localStorage.setItem(STORAGE_KEY, raw);
  } catch {}
}

let flushing = false;
let flushPromise: Promise<void> | null = null;
let scheduledFlush: ReturnType<typeof setTimeout> | null = null;

type WriteInput = Omit<QueuedWrite, 'id' | 'attempts' | 'enqueuedAt'>;

const sanitizeWriteForQueue = (write: WriteInput): WriteInput | null => {
  const row: any = { ...write.row };

  if (write.table === 'notes') {
    const payload = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? { ...row.payload }
      : row.payload;

    if (payload && typeof payload === 'object') {
      delete payload.content;
      delete payload.codeContent;
      delete payload.fullPageSnapshot;
      delete payload.images;
      delete payload.floatingImages;
      delete payload.voiceRecordings;
      delete payload.attachments;
      row.payload = payload;
    }

    if (typeof row.body === 'string' && row.body.length > 200 * 1024) {
      row.body = null;
    }
  }

  try {
    // Never let one oversized localStorage queue entry freeze the whole app.
    // The local IndexedDB copy remains the source of truth for huge note bodies.
    if (JSON.stringify(row).length > 260 * 1024) return null;
  } catch {
    return null;
  }

  return { ...write, row };
};

const scheduleFlush = () => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (scheduledFlush) clearTimeout(scheduledFlush);
  scheduledFlush = setTimeout(() => {
    scheduledFlush = null;
    void flushQueue();
  }, 250);
};

export function enqueueWrite(
  table: SyncTable,
  op: 'upsert' | 'delete',
  row: Partial<SyncRow> & { id: string },
): void {
  enqueueWrites([{ table, op, row }]);
}

export function enqueueWrites(writes: WriteInput[]): void {
  if (!writes.length) return;
  const q = load()
    .map((entry) => {
      const sanitized = sanitizeWriteForQueue({ table: entry.table, op: entry.op, row: entry.row });
      return sanitized ? { ...entry, ...sanitized } : null;
    })
    .filter((entry): entry is QueuedWrite => !!entry);
  // Dedupe once per batch. The previous per-row load/filter/save path made
  // duplicating only a few hundred tasks block the UI for seconds.
  const byKey = new Map(q.map(e => [`${e.table}:${e.row.id}`, e] as const));
  const now = Date.now();
  for (const write of writes) {
    const sanitized = sanitizeWriteForQueue(write);
    if (!sanitized) continue;
    byKey.set(`${sanitized.table}:${sanitized.row.id}`, {
      id: `${sanitized.table}:${sanitized.row.id}:${now}`,
      ...sanitized,
      attempts: 0,
      enqueuedAt: now,
    });
  }
  save(Array.from(byKey.values()));
  scheduleFlush();
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

      let q = load()
        .map((entry) => {
          const sanitized = sanitizeWriteForQueue({ table: entry.table, op: entry.op, row: entry.row });
          return sanitized ? { ...entry, ...sanitized } : null;
        })
        .filter((entry): entry is QueuedWrite => !!entry);
      const remaining: QueuedWrite[] = [];
      const groups = new Map<string, QueuedWrite[]>();
      for (const entry of q) {
        const key = `${entry.table}:${entry.op}`;
        const group = groups.get(key) ?? [];
        group.push(entry);
        groups.set(key, group);
      }

      const keepForRetry = (entries: QueuedWrite[], err: unknown) => {
        for (const entry of entries) {
          entry.attempts += 1;
          if (entry.attempts < MAX_RETRIES) remaining.push(entry);
          else console.warn('[sync] dropping write after max retries', entry, err);
        }
      };

      const CHUNK = 500;
      for (const group of groups.values()) {
        for (let i = 0; i < group.length; i += CHUNK) {
          const chunk = group.slice(i, i + CHUNK);
          const entry = chunk[0];
          if (!entry) continue;
        try {
          if (entry.op === 'delete') {
            const { error } = await supabase
              .from(entry.table as any)
              .update({ is_deleted: true, updated_at: new Date().toISOString() } as any)
              .in('id', chunk.map(e => e.row.id) as any)
              .eq('user_id', userId);
            if (error) throw error;
          } else {
            const payload = chunk.map(e => ({
              ...e.row,
              user_id: userId,
              updated_at: e.row.updated_at ?? new Date().toISOString(),
            }));
            const { error } = await supabase
              .from(entry.table as any)
              .upsert(payload as any, { onConflict: 'id' });
            if (error) throw error;
          }
        } catch (err) {
          keepForRetry(chunk, err);
        }
        }
      }
      save(remaining);
    } finally {
      flushing = false;
      flushPromise = null;
    }
  })();
  return flushPromise;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushQueue(); });
}
