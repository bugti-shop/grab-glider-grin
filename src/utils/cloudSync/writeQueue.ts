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
const MAX_PERSISTED_QUEUE_ENTRIES = 500;

interface QueuedWrite {
  id: string;          // queue entry id
  table: SyncTable;
  op: 'upsert' | 'delete';
  row: Partial<SyncRow> & { id: string };
  attempts: number;
  enqueuedAt: number;
}

let inMemoryQueue: QueuedWrite[] = [];

function loadPersisted(): QueuedWrite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && raw.length > MAX_QUEUE_STORAGE_CHARS) {
      // A legacy queue could contain many duplicated 100k-word notes. Parsing
      // that JSON on startup blocks scrolling/navigation, so drop it and let
      // fresh lightweight writes rebuild the queue.
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
    const parsed = raw ? JSON.parse(raw) as QueuedWrite[] : [];
    // Older builds compacted persisted large notes by writing body:null without
    // a marker. Treat those queued upserts as omitted bodies so they rehydrate
    // from IndexedDB instead of uploading an empty note to the backend.
    return parsed.map((entry) => {
      if (entry.table === 'notes' && entry.op === 'upsert' && (entry.row as any).body === null && !(entry.row as any).__bodyOmittedFromQueue) {
        return { ...entry, row: { ...(entry.row as any), __bodyOmittedFromQueue: true } };
      }
      return entry;
    });
  } catch { return []; }
}
function save(q: QueuedWrite[]): void {
  try {
    // Persist only a compact tail for crash/reload recovery. Large first-sync
    // uploads can contain 40k+ notes/tasks; stringifying the whole queue both
    // freezes the UI and previously dropped most rows before they ever flushed.
    let tail = q.slice(-MAX_PERSISTED_QUEUE_ENTRIES).map((entry) => {
      const row: any = { ...entry.row };
      if (entry.table === 'notes' && typeof row.body === 'string' && row.body.length > 200 * 1024) {
        row.body = null;
        row.__bodyOmittedFromQueue = true;
      }
      return { ...entry, row };
    });
    let raw = JSON.stringify(tail);
    if (raw.length > MAX_QUEUE_STORAGE_CHARS) {
      while (tail.length > 50 && raw.length > MAX_QUEUE_STORAGE_CHARS) {
        tail = tail.slice(Math.floor(tail.length / 2));
        raw = JSON.stringify(tail);
      }
      if (raw.length > MAX_QUEUE_STORAGE_CHARS) return;
    }
    localStorage.setItem(STORAGE_KEY, raw);
  } catch {}
}

function mergeQueuedEntries(...groups: QueuedWrite[][]): QueuedWrite[] {
  const byKey = new Map<string, QueuedWrite>();
  for (const group of groups) {
    for (const entry of group) byKey.set(`${entry.table}:${entry.row.id}`, entry);
  }
  return Array.from(byKey.values());
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

  }

  try {
    // Guard only truly pathological single rows. Normal note bodies must sync;
    // the persistent localStorage copy is compacted separately in save().
    if (JSON.stringify(row).length > 10 * 1024 * 1024) return null;
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

async function rehydratePersistedNoteBodies(entries: QueuedWrite[]): Promise<QueuedWrite[]> {
  if (!entries.some((entry) => entry.table === 'notes' && (entry.row as any).__bodyOmittedFromQueue)) {
    return entries;
  }

  let loadNoteFromDB: ((id: string) => Promise<any | null>) | null = null;
  try {
    loadNoteFromDB = (await import('@/utils/noteStorage')).loadNoteFromDB;
  } catch {
    return entries;
  }

  const next: QueuedWrite[] = [];
  for (const entry of entries) {
    if (entry.table !== 'notes' || !(entry.row as any).__bodyOmittedFromQueue) {
      next.push(entry);
      continue;
    }
    try {
      const note = await loadNoteFromDB(entry.row.id);
      if (note && typeof note.content === 'string') {
        const { __bodyOmittedFromQueue: _omitted, ...row } = entry.row as any;
        next.push({ ...entry, row: { ...row, body: note.content } });
      } else if (note) {
        const { __bodyOmittedFromQueue: _omitted, ...row } = entry.row as any;
        next.push({ ...entry, row: { ...row, body: '' } });
      } else {
        // Never upload a null body just because the compact localStorage queue
        // omitted it. Keep the write queued until the note can be rehydrated.
        next.push(entry);
      }
    } catch {
      next.push(entry);
    }
  }
  return next;
}

export function enqueueWrite(
  table: SyncTable,
  op: 'upsert' | 'delete',
  row: Partial<SyncRow> & { id: string },
): void {
  enqueueWrites([{ table, op, row }]);
}

export function enqueueWrites(writes: WriteInput[]): void {
  if (!writes.length) return;
  const q = mergeQueuedEntries(loadPersisted(), inMemoryQueue)
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
  inMemoryQueue = Array.from(byKey.values());
  save(inMemoryQueue);
  scheduleFlush();
}

export function getQueueLength(): number {
  return mergeQueuedEntries(loadPersisted(), inMemoryQueue).length;
}

export async function flushQueue(): Promise<void> {
  if (flushing && flushPromise) return flushPromise;
  flushing = true;
  flushPromise = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const userId = session.user.id;

      let q = mergeQueuedEntries(loadPersisted(), inMemoryQueue)
        .map((entry) => {
          const sanitized = sanitizeWriteForQueue({ table: entry.table, op: entry.op, row: entry.row });
          return sanitized ? { ...entry, ...sanitized } : null;
        })
        .filter((entry): entry is QueuedWrite => !!entry);
      q = await rehydratePersistedNoteBodies(q);
      const flushingKeys = new Map<string, number>(q.map((entry) => [`${entry.table}:${entry.row.id}`, entry.enqueuedAt] as const));
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
            const skipped = chunk.filter(e => e.table === 'notes' && (e.row as any).__bodyOmittedFromQueue);
            if (skipped.length) keepForRetry(skipped, new Error('note body not rehydrated'));
            const uploadable = chunk.filter(e => !(e.table === 'notes' && (e.row as any).__bodyOmittedFromQueue));
            if (!uploadable.length) continue;
            const payload = uploadable
              .map(e => {
                const { __bodyOmittedFromQueue: _omitted, ...row } = e.row as any;
                return {
                  ...row,
                  user_id: userId,
                  updated_at: e.row.updated_at ?? new Date().toISOString(),
                };
              });
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
      const failedKeys = new Set(remaining.map((entry) => `${entry.table}:${entry.row.id}`));
      // Keep writes that were enqueued while this flush was in flight. Without
      // this, a first-login upload can start flushing notes, then queue tasks,
      // and the notes flush completion would overwrite the task queue.
      const current = mergeQueuedEntries(loadPersisted(), inMemoryQueue);
      inMemoryQueue = mergeQueuedEntries(
        current.filter((entry) => {
          const key = `${entry.table}:${entry.row.id}`;
          const startedAt = flushingKeys.get(key);
          return startedAt === undefined || failedKeys.has(key) || entry.enqueuedAt > startedAt;
        }),
        remaining,
      );
      save(inMemoryQueue);
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
