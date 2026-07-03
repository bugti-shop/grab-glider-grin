// Local cache + Cloud-synced storage for feature-tour "seen" state.
// - Local (IndexedDB via settingsStorage) is authoritative for instant reads.
// - Cloud (public.user_feature_tours) is best-effort: writes flush async,
//   and on sign-in we hydrate any tour rows the user completed on other devices.

import { getSetting, setSetting } from '@/utils/settingsStorage';
import { supabase } from '@/integrations/supabase/client';

export interface TourState {
  seenAt?: string;          // ISO timestamp of first completion / manual mark
  dismissedForever?: boolean; // "Don't show tips like this again"
}

export type TourStateMap = Record<string, TourState>;

const CACHE_KEY = 'feature-tours-state-v1';
const INSTALL_DATE_KEY = 'feature-tours-install-date';

let cache: TourStateMap | null = null;
let hydratePromise: Promise<TourStateMap> | null = null;

const emitChange = () => {
  window.dispatchEvent(new CustomEvent('featureToursChanged'));
};

const loadCache = async (): Promise<TourStateMap> => {
  if (cache) return cache;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const stored = await getSetting<TourStateMap | null>(CACHE_KEY, null);
    cache = stored ?? {};
    return cache;
  })();
  return hydratePromise;
};

const persistCache = async () => {
  if (!cache) return;
  await setSetting(CACHE_KEY, cache, { skipCloudSync: true });
};

/** Read all known tour states (from local cache). */
export const getAllTourStates = async (): Promise<TourStateMap> => {
  return { ...(await loadCache()) };
};

/** Sync check that avoids async chain for React render paths. Returns {} until first hydration. */
export const getTourStatesSync = (): TourStateMap => cache ?? {};

export const hasSeenTour = async (tourId: string): Promise<boolean> => {
  const map = await loadCache();
  return !!map[tourId]?.seenAt || !!map[tourId]?.dismissedForever;
};

export const isDismissedForever = async (tourId: string): Promise<boolean> => {
  const map = await loadCache();
  return !!map[tourId]?.dismissedForever;
};

const upsertLocal = async (tourId: string, patch: TourState) => {
  const map = await loadCache();
  map[tourId] = { ...map[tourId], ...patch };
  await persistCache();
  emitChange();
};

const pushToCloud = async (tourId: string, patch: TourState) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('user_feature_tours')
      .upsert(
        {
          user_id: user.id,
          tour_id: tourId,
          seen_at: patch.seenAt ?? new Date().toISOString(),
          dismissed_forever: !!patch.dismissedForever,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,tour_id' },
      );
  } catch {
    // Best-effort; local cache is authoritative.
  }
};

export const markTourSeen = async (tourId: string) => {
  const patch: TourState = { seenAt: new Date().toISOString() };
  await upsertLocal(tourId, patch);
  pushToCloud(tourId, patch);
};

export const dismissTourForever = async (tourId: string) => {
  const patch: TourState = {
    seenAt: new Date().toISOString(),
    dismissedForever: true,
  };
  await upsertLocal(tourId, patch);
  pushToCloud(tourId, patch);
};

export const resetTour = async (tourId: string) => {
  const map = await loadCache();
  delete map[tourId];
  await persistCache();
  emitChange();
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('user_feature_tours')
        .delete()
        .eq('user_id', user.id)
        .eq('tour_id', tourId);
    }
  } catch {}
};

/** Pull any cloud rows the user completed on another device into the local cache. */
export const hydrateFromCloud = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from('user_feature_tours')
      .select('tour_id, seen_at, dismissed_forever')
      .eq('user_id', user.id);
    if (error || !data) return;
    const map = await loadCache();
    let changed = false;
    for (const row of data) {
      const existing = map[row.tour_id];
      if (!existing || !existing.seenAt || row.dismissed_forever) {
        map[row.tour_id] = {
          seenAt: row.seen_at ?? existing?.seenAt,
          dismissedForever: !!row.dismissed_forever || !!existing?.dismissedForever,
        };
        changed = true;
      }
    }
    if (changed) {
      await persistCache();
      emitChange();
    }
  } catch {}
};

/** Milliseconds since first install (falls back to now on first call). */
export const getDaysSinceInstall = async (): Promise<number> => {
  let iso = await getSetting<string | null>(INSTALL_DATE_KEY, null);
  if (!iso) {
    iso = new Date().toISOString();
    await setSetting(INSTALL_DATE_KEY, iso, { skipCloudSync: true });
  }
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
};

/** Ensure install date is recorded (idempotent). */
export const ensureInstallDate = async () => {
  await getDaysSinceInstall();
};

// Kick off initial hydration eagerly.
loadCache().catch(() => {});
