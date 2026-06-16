/**
 * Cloud-synced daily AI usage counters (scan, voice).
 *
 * Mirrors the lifetime-counters strategy:
 *  - localStorage is the source of truth for INSTANT reads (no loader UI).
 *  - On app start / sign-in we PULL today's row(s) from the cloud and merge
 *    `max(local, cloud)` into local.
 *  - On every successful AI use we PUSH to the cloud (fire-and-forget) so
 *    other devices catch up.
 *
 * Identifier: Supabase email (preferred) or device_id (fallback for anon users).
 */
import { supabase } from '@/lib/supabase';
import type { AiFeature } from './aiUsageLimits';

const db: any = supabase;

const DEVICE_ID_KEY = 'flowist_device_id';

const localKey = (f: AiFeature) => `aiUsage_${f}_v1`;

const todayDate = () => {
  const d = new Date();
  // ISO YYYY-MM-DD (used by Postgres DATE column)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface UsageRecord { date: string; count: number; }

const readLocal = (f: AiFeature): UsageRecord => {
  try {
    const raw = localStorage.getItem(localKey(f));
    if (!raw) return { date: todayDate(), count: 0 };
    const parsed = JSON.parse(raw) as UsageRecord;
    return parsed;
  } catch {
    return { date: todayDate(), count: 0 };
  }
};

const writeLocal = (f: AiFeature, rec: UsageRecord) => {
  try { localStorage.setItem(localKey(f), JSON.stringify(rec)); } catch {}
};

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

/**
 * Pull today's cloud counters for both features and merge max(cloud, local) into local.
 * Call once on app start (after auth resolves) and on auth state change.
 */
export const pullAndMergeAiUsage = async (): Promise<void> => {
  try {
    const { identifier, type } = await getIdentifier();
    const today = todayDate();

    const { data, error } = await db
      .from('user_daily_ai_usage')
      .select('feature, count')
      .eq('identifier', identifier)
      .eq('identifier_type', type)
      .eq('usage_date', today);

    if (error) {
      console.warn('[AiUsageCloud] pull failed:', error.message);
      return;
    }

    const features: AiFeature[] = ['scan', 'voice'];
    let cloudPushNeeded = false;

    features.forEach((f) => {
      const cloudRow = (data || []).find((r: any) => r.feature === f);
      const cloudCount = Number(cloudRow?.count) || 0;
      const localRec = readLocal(f);
      // If local date is stale (different day), reset before merging.
      const localCount = localRec.date === today ? localRec.count : 0;
      const max = Math.max(cloudCount, localCount);
      if (max !== localCount || localRec.date !== today) {
        writeLocal(f, { date: today, count: max });
      }
      if (localCount > cloudCount) {
        cloudPushNeeded = true;
      }
    });

    if (cloudPushNeeded) {
      // Push back so cloud catches up
      void Promise.all(features.map((f) => pushAiUsage(f, readLocal(f).count)));
    }
  } catch (e) {
    console.warn('[AiUsageCloud] pull error:', e);
  }
};

/**
 * Push a single feature's usage count to the cloud (upsert with max-wins).
 * Fire-and-forget — failure won't block the user.
 */
export const pushAiUsage = async (feature: AiFeature, value: number): Promise<void> => {
  try {
    const { identifier, type } = await getIdentifier();
    const today = todayDate();

    // Read current cloud value to avoid regressing
    const { data } = await db
      .from('user_daily_ai_usage')
      .select('count')
      .eq('identifier', identifier)
      .eq('identifier_type', type)
      .eq('feature', feature)
      .eq('usage_date', today)
      .maybeSingle();

    const currentCloud = Number(data?.count) || 0;
    const next = Math.max(currentCloud, value);
    if (data && next === currentCloud) return;

    const { error } = await db
      .from('user_daily_ai_usage')
      .upsert(
        {
          identifier,
          identifier_type: type,
          feature,
          usage_date: today,
          count: next,
        },
        { onConflict: 'identifier,identifier_type,feature,usage_date' },
      );
    if (error) console.warn('[AiUsageCloud] push failed:', error.message);
  } catch (e) {
    console.warn('[AiUsageCloud] push error:', e);
  }
};
