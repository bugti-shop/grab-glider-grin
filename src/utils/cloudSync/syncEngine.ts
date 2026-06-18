/**
 * Invisible realtime sync engine.
 *
 * Lifecycle:
 *   start(userId) → bootstrap (parallel batch fetch with upsert keyed by id)
 *                 → set last_sync_timestamp per table
 *                 → attach realtime listeners (one multiplexed channel)
 *                 → set up heartbeat, visibility/online/foreground hooks that
 *                   refetch missed events using last_sync_timestamp
 *   stop()       → tears everything down
 *
 * The engine emits a `flowist:sync:change` CustomEvent on `window` for each
 * row change so app-level stores can update their caches without any direct
 * dependency on the engine.
 */
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SYNC_TABLES, type SyncTable, type SyncRow } from './syncTables';
import { getLastSync, setLastSync } from './syncState';
import { flushQueue } from './writeQueue';
import { getDeviceId, getPlatform } from './deviceId';

export interface SyncChangeDetail {
  table: SyncTable;
  rows: SyncRow[];
  source: 'bootstrap' | 'realtime' | 'refetch';
}

let started = false;
let currentUserId: string | null = null;
let channel: RealtimeChannel | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let bootstrapping = false;
let authSub: { unsubscribe: () => void } | null = null;

function emit(detail: SyncChangeDetail): void {
  try {
    window.dispatchEvent(new CustomEvent('flowist:sync:change', { detail }));
  } catch {}
}

async function registerDevice(userId: string): Promise<void> {
  try {
    await supabase.from('device_registry').upsert({
      device_id: getDeviceId(),
      user_id: userId,
      platform: getPlatform(),
      last_seen_at: new Date().toISOString(),
    } as any, { onConflict: 'device_id' });
  } catch (err) {
    console.warn('[sync] device register failed', err);
  }
}

/** Fetch all rows for a table since `since` (ISO) and emit them. */
async function fetchSince(userId: string, table: SyncTable, since: string | null, source: SyncChangeDetail['source']): Promise<void> {
  let query = supabase.from(table as any).select('*').eq('user_id', userId);
  if (since) query = query.gt('updated_at', since);
  const { data, error } = await query.order('updated_at', { ascending: true }).limit(5000);
  if (error) {
    console.warn('[sync] fetch failed', table, error);
    return;
  }
  const rows = ((data ?? []) as unknown) as SyncRow[];
  if (rows.length > 0) {
    emit({ table, rows, source });
    const newest = rows[rows.length - 1].updated_at;
    if (newest) setLastSync(userId, table, newest);
  } else if (!since) {
    setLastSync(userId, table, new Date().toISOString());
  }
}

async function bootstrap(userId: string): Promise<void> {
  if (bootstrapping) return;
  bootstrapping = true;
  try {
    await Promise.all(SYNC_TABLES.map(t => fetchSince(userId, t, getLastSync(userId, t), 'bootstrap')));
  } finally {
    bootstrapping = false;
  }
}

async function refetchMissed(userId: string): Promise<void> {
  await Promise.all(SYNC_TABLES.map(t => fetchSince(userId, t, getLastSync(userId, t), 'refetch')));
}

function attachRealtime(userId: string): void {
  if (channel) supabase.removeChannel(channel);
  const ch = supabase.channel(`sync:${userId}`, { config: { broadcast: { self: false } } });

  for (const table of SYNC_TABLES) {
    ch.on(
      'postgres_changes' as any,
      { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
      (payload: any) => {
        const row = (payload.new ?? payload.old) as SyncRow | undefined;
        if (!row) return;
        emit({ table, rows: [row], source: 'realtime' });
        import('./diagnostics').then(d => d.recordListenerEvent(table)).catch(() => {});
        if (row.updated_at) setLastSync(userId, table, row.updated_at);
      },
    );
  }

  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      // Drain any writes queued while offline and refetch anything missed
      void flushQueue().then(() => refetchMissed(userId));
    }
  });
  channel = ch;
}

function startHeartbeat(): void {
  if (heartbeat) clearInterval(heartbeat);
  // Every 30s: if online and we have a user, refetch missed events as a safety net.
  heartbeat = setInterval(() => {
    if (!currentUserId) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    void refetchMissed(currentUserId);
  }, 30_000);
}

function onVisibility(): void {
  if (document.visibilityState === 'visible' && currentUserId) {
    void flushQueue().then(() => refetchMissed(currentUserId!));
  }
}
function onOnline(): void {
  if (currentUserId) void flushQueue().then(() => refetchMissed(currentUserId!));
}
function onForeground(): void {
  if (currentUserId) void flushQueue().then(() => refetchMissed(currentUserId!));
}

export async function startSync(userId: string): Promise<void> {
  if (started && currentUserId === userId) return;
  if (started) await stopSync();
  started = true;
  currentUserId = userId;

  await registerDevice(userId);
  await bootstrap(userId);
  attachRealtime(userId);
  startHeartbeat();

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  window.addEventListener('flowist:app:foreground', onForeground);

  // Best-effort: register background sync if the SW supports it.
  try {
    const reg: any = await (navigator as any).serviceWorker?.ready;
    if (reg?.sync?.register) await reg.sync.register('flowist-resync').catch(() => {});
  } catch {}
}

export async function stopSync(): Promise<void> {
  started = false;
  currentUserId = null;
  if (channel) { try { supabase.removeChannel(channel); } catch {} channel = null; }
  if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('online', onOnline);
  window.removeEventListener('flowist:app:foreground', onForeground);
}

/** Force a manual refetch (e.g. after returning from a deep background state). */
export function syncNow(): void {
  if (currentUserId) {
    void flushQueue().then(() => refetchMissed(currentUserId!));
  }
}
