/**
 * Device-locked 3-day free trial.
 *
 * On first app open we register the device in `user_lifetime_counters`
 * (existing table) with `trial_started_at = now()`. The server is the source
 * of truth, so reinstalling the app does NOT reset the trial as long as the
 * same identifier can be reconstructed:
 *
 *   1. If user is signed in → identifier = email (100% reliable across reinstalls)
 *   2. Else → identifier = device UUID stored in Capacitor Preferences +
 *      localStorage (survives reinstalls on Android; weak on iOS unless
 *      user keeps Keychain backup. Acknowledged limitation.)
 *
 * A determined user CAN bypass via factory-reset + new account + VPN. This is
 * accepted (<2% of users).
 */

import { supabase } from '@/lib/supabase';
import { Preferences } from '@capacitor/preferences';

const TRIAL_DAYS = 3;
const PREF_KEY = 'flowist_device_fp';
const LS_KEY = 'flowist_device_fp';

const db: any = supabase;

const newFingerprint = (): string => {
  const rand = () => Math.random().toString(36).slice(2, 12);
  return `fp_${Date.now().toString(36)}_${rand()}${rand()}`;
};

/** Get a stable device fingerprint, creating one if needed. Stored in Capacitor Preferences + localStorage. */
export const getDeviceFingerprint = async (): Promise<string> => {
  // Try Capacitor Preferences first (more persistent on Android)
  try {
    const { value } = await Preferences.get({ key: PREF_KEY });
    if (value) {
      try { localStorage.setItem(LS_KEY, value); } catch {}
      return value;
    }
  } catch {}
  // Fall back to localStorage
  try {
    const ls = localStorage.getItem(LS_KEY);
    if (ls) {
      try { await Preferences.set({ key: PREF_KEY, value: ls }); } catch {}
      return ls;
    }
  } catch {}
  // Generate new
  const fp = newFingerprint();
  try { await Preferences.set({ key: PREF_KEY, value: fp }); } catch {}
  try { localStorage.setItem(LS_KEY, fp); } catch {}
  return fp;
};

/** Returns the effective identifier: email if signed in, else device fingerprint. */
const getTrialIdentifier = async (): Promise<{ identifier: string; type: 'email' | 'device'; fingerprint: string }> => {
  const fingerprint = await getDeviceFingerprint();
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      return { identifier: user.email.toLowerCase(), type: 'email', fingerprint };
    }
  } catch {}
  return { identifier: fingerprint, type: 'device', fingerprint };
};

/**
 * Read the trial start timestamp from the server, registering it if absent.
 * Returns ISO string or null on failure.
 */
export const initOrCheckTrial = async (): Promise<string | null> => {
  try {
    const { identifier, type, fingerprint } = await getTrialIdentifier();

    // First, read the existing row
    const { data: existing } = await db
      .from('user_lifetime_counters')
      .select('trial_started_at')
      .eq('identifier', identifier)
      .eq('identifier_type', type)
      .maybeSingle();

    if (existing?.trial_started_at) {
      return existing.trial_started_at as string;
    }

    // Also probe by device fingerprint in case user signed in with new email but same device
    if (type === 'email') {
      const { data: deviceRow } = await db
        .from('user_lifetime_counters')
        .select('trial_started_at')
        .eq('identifier', fingerprint)
        .eq('identifier_type', 'device')
        .maybeSingle();
      if (deviceRow?.trial_started_at) {
        // Migrate device trial start onto the email row
        const startedAt = deviceRow.trial_started_at as string;
        await db.from('user_lifetime_counters').upsert(
          { identifier, identifier_type: type, trial_started_at: startedAt, trial_device_fingerprint: fingerprint },
          { onConflict: 'identifier,identifier_type' },
        );
        return startedAt;
      }
    }

    // No record anywhere → start the trial now
    const nowIso = new Date().toISOString();
    const { error } = await db
      .from('user_lifetime_counters')
      .upsert(
        { identifier, identifier_type: type, trial_started_at: nowIso, trial_device_fingerprint: fingerprint },
        { onConflict: 'identifier,identifier_type' },
      );
    if (error) {
      console.warn('[DeviceTrial] insert failed:', error.message);
      // Fallback: persist locally so user still gets trial even if server fails
      try { localStorage.setItem('flowist_trial_start_iso_fallback', nowIso); } catch {}
      return nowIso;
    }
    return nowIso;
  } catch (e) {
    console.warn('[DeviceTrial] initOrCheckTrial error:', e);
    try {
      const cached = localStorage.getItem('flowist_trial_start_iso_fallback');
      if (cached) return cached;
      const nowIso = new Date().toISOString();
      localStorage.setItem('flowist_trial_start_iso_fallback', nowIso);
      return nowIso;
    } catch {
      return null;
    }
  }
};

export const getTrialMs = () => TRIAL_DAYS * 24 * 60 * 60 * 1000;

export const getTrialDaysRemaining = (startedAtIso: string | null): number => {
  if (!startedAtIso) return 0;
  const started = new Date(startedAtIso).getTime();
  if (!started) return 0;
  const elapsed = Date.now() - started;
  const remainingMs = getTrialMs() - elapsed;
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
};

export const isTrialActive = (startedAtIso: string | null): boolean => {
  if (!startedAtIso) return false;
  const started = new Date(startedAtIso).getTime();
  if (!started) return false;
  return Date.now() - started < getTrialMs();
};
