/**
 * Cloud-synced lifetime counters for free-tier limits.
 * 
 * Tracks the highest number of items a user has EVER created (notes, tasks, folders, etc.)
 * keyed by their Supabase email (preferred) or device_id (fallback for anon users).
 * 
 * Persists across:
 *  - App reinstalls (cleared localStorage)
 *  - New devices (same email)
 *  - Account switches (per-email isolation)
 * 
 * Strategy:
 *  - localStorage is the source of truth for INSTANT reads (no loader UI).
 *  - Cloud is synced in the background: on app start we MERGE max(local, cloud)
 *    and on every bump we push to cloud (fire-and-forget).
 */

import { supabase } from '@/lib/supabase';
import type { SoftLimitKind } from '@/contexts/SubscriptionContext';

const db: any = supabase;

const COLUMN_MAP: Record<SoftLimitKind, string> = {
  notes: 'notes_created',
  tasks: 'tasks_created',
  noteFolders: 'note_folders_created',
  taskFolders: 'task_folders_created',
  taskSections: 'task_sections_created',
};

const LIFETIME_KEY = (kind: SoftLimitKind) => `flowist_lifetime_${kind}`;
const DEVICE_ID_KEY = 'flowist_device_id';
const LAST_SYNC_KEY = 'flowist_lifetime_last_sync';

// ── Local storage helpers ──

export const getLocalLifetimeMax = (kind: SoftLimitKind): number => {
  try { return parseInt(localStorage.getItem(LIFETIME_KEY(kind)) || '0', 10) || 0; } catch { return 0; }
};

export const setLocalLifetimeMax = (kind: SoftLimitKind, value: number) => {
  try { localStorage.setItem(LIFETIME_KEY(kind), String(value)); } catch {}
};

/**
 * Wipe all lifetime counters in localStorage AND zero them in the cloud row.
 * Call this when a user upgrades to Pro so the slate is clean if they ever downgrade.
 */
export const resetAllLifetimeCounters = async (): Promise<void> => {
  try {
    (Object.keys(COLUMN_MAP) as SoftLimitKind[]).forEach((kind) => {
      localStorage.removeItem(LIFETIME_KEY(kind));
    });
    localStorage.removeItem(LAST_SYNC_KEY);
  } catch {}

  try {
    const { identifier, type } = await getIdentifier();
    const payload: Record<string, any> = { identifier, identifier_type: type };
    (Object.keys(COLUMN_MAP) as SoftLimitKind[]).forEach((kind) => {
      payload[COLUMN_MAP[kind]] = 0;
    });
    const { error } = await db
      .from('user_lifetime_counters')
      .upsert(payload, { onConflict: 'identifier,identifier_type' });
    if (error) console.warn('[LifetimeCounters] reset failed:', error.message);
    else console.log('[LifetimeCounters] ✅ Reset all counters (local + cloud)');
  } catch (e) {
    console.warn('[LifetimeCounters] reset error:', e);
  }
};

// ── Identifier ──

const getOrCreateDeviceId = (): string => {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `dev_anon_${Date.now()}`;
  }
};

const getIdentifier = async (): Promise<{ identifier: string; type: 'email' | 'device' }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      return { identifier: user.email.toLowerCase(), type: 'email' };
    }
  } catch {}
  return { identifier: getOrCreateDeviceId(), type: 'device' };
};

// ── Cloud sync ──

/**
 * Pull cloud counters and merge into local storage (max wins).
 * Call once on app start (after auth resolves) and after sign-in.
 */
export const pullAndMergeLifetimeCounters = async (): Promise<void> => {
  try {
    const { identifier, type } = await getIdentifier();
    const { data, error } = await db
      .from('user_lifetime_counters')
      .select('*')
      .eq('identifier', identifier)
      .eq('identifier_type', type)
      .maybeSingle();

    if (error) {
      console.warn('[LifetimeCounters] pull failed:', error.message);
      return;
    }
    if (!data) return;

    // Merge max(cloud, local) into local
    let mutated = false;
    const localSnapshot: Partial<Record<SoftLimitKind, number>> = {};
    (Object.keys(COLUMN_MAP) as SoftLimitKind[]).forEach((kind) => {
      const col = COLUMN_MAP[kind];
      const cloudVal = Number(data[col]) || 0;
      const localVal = getLocalLifetimeMax(kind);
      const max = Math.max(cloudVal, localVal);
      if (max > localVal) {
        setLocalLifetimeMax(kind, max);
        mutated = true;
      }
      localSnapshot[kind] = max;
    });

    // If local was higher than cloud anywhere, push back so cloud catches up
    const cloudNeedsUpdate = (Object.keys(COLUMN_MAP) as SoftLimitKind[]).some(
      (kind) => (localSnapshot[kind] || 0) > (Number(data[COLUMN_MAP[kind]]) || 0)
    );
    if (cloudNeedsUpdate) {
      void pushAllLifetimeCounters();
    }

    try { localStorage.setItem(LAST_SYNC_KEY, String(Date.now())); } catch {}
    if (mutated) console.log('[LifetimeCounters] Merged cloud counters into local');
  } catch (e) {
    console.warn('[LifetimeCounters] pull error:', e);
  }
};

/**
 * Push a single counter to the cloud (upsert).
 * Fire-and-forget — failure won't block the user.
 */
export const pushLifetimeCounter = async (kind: SoftLimitKind, value: number): Promise<void> => {
  try {
    const { identifier, type } = await getIdentifier();
    const col = COLUMN_MAP[kind];

    // Read current cloud value to avoid regressing it
    const { data } = await db
      .from('user_lifetime_counters')
      .select(col)
      .eq('identifier', identifier)
      .eq('identifier_type', type)
      .maybeSingle();

    const currentCloud = Number(data?.[col]) || 0;
    const next = Math.max(currentCloud, value);
    if (next === currentCloud && data) return;

    const { error } = await db
      .from('user_lifetime_counters')
      .upsert(
        { identifier, identifier_type: type, [col]: next },
        { onConflict: 'identifier,identifier_type' }
      );
    if (error) console.warn('[LifetimeCounters] push failed:', error.message);
  } catch (e) {
    console.warn('[LifetimeCounters] push error:', e);
  }
};

/**
 * Push ALL local counters to the cloud at once (for catch-up after merge).
 */
export const pushAllLifetimeCounters = async (): Promise<void> => {
  try {
    const { identifier, type } = await getIdentifier();
    const payload: Record<string, any> = { identifier, identifier_type: type };
    (Object.keys(COLUMN_MAP) as SoftLimitKind[]).forEach((kind) => {
      payload[COLUMN_MAP[kind]] = getLocalLifetimeMax(kind);
    });
    const { error } = await db
      .from('user_lifetime_counters')
      .upsert(payload, { onConflict: 'identifier,identifier_type' });
    if (error) console.warn('[LifetimeCounters] pushAll failed:', error.message);
  } catch (e) {
    console.warn('[LifetimeCounters] pushAll error:', e);
  }
};
