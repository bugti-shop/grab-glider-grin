import { useState, useEffect, useCallback } from 'react';
import { getSetting, setSetting } from '@/utils/settingsStorage';
import { supabase } from '@/integrations/supabase/client';

export interface UserProfile {
  name: string;
  avatarUrl: string;
  coverUrl: string;
}

const PROFILE_KEY = 'flowist_user_profile';

const DEFAULT_PROFILE: UserProfile = { name: '', avatarUrl: '', coverUrl: '' };

const sanitizeUserProfile = (value: unknown): UserProfile => {
  if (!value || typeof value !== 'object') return DEFAULT_PROFILE;
  const raw = value as Partial<UserProfile>;
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : '',
    coverUrl: typeof raw.coverUrl === 'string' ? raw.coverUrl : '',
  };
};

export const loadUserProfile = async (): Promise<UserProfile> => {
  const stored = await getSetting<UserProfile | null>(PROFILE_KEY, DEFAULT_PROFILE);
  return sanitizeUserProfile(stored);
};

export const saveUserProfile = async (profile: UserProfile): Promise<void> => {
  const sanitized = sanitizeUserProfile(profile);
  await setSetting(PROFILE_KEY, sanitized);
  window.dispatchEvent(new CustomEvent('userProfileUpdated', { detail: sanitized }));
};

// ---- Cloud sync ----

async function getSessionUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch { return null; }
}

async function pushProfileToCloud(profile: UserProfile): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from('profiles').upsert({
      id: userId,
      display_name: profile.name || null,
      avatar_url: profile.avatarUrl || null,
      cover_url: profile.coverUrl || null,
      email: session?.user?.email || null,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: 'id' });
  } catch (err) {
    console.warn('[profile] push failed', err);
  }
}

async function pullProfileFromCloud(): Promise<UserProfile | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, avatar_url, cover_url')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      name: (data as any).display_name || '',
      avatarUrl: (data as any).avatar_url || '',
      coverUrl: (data as any).cover_url || '',
    };
  } catch { return null; }
}

/** Merge cloud profile into local (cloud is source of truth on cross-device load). */
async function reconcileFromCloud(): Promise<void> {
  const [local, cloud] = await Promise.all([loadUserProfile(), pullProfileFromCloud()]);
  if (!cloud) {
    // No cloud row yet — push local up so the other device can pull it.
    if (local.name || local.avatarUrl || local.coverUrl) await pushProfileToCloud(local);
    return;
  }
  // Prefer non-empty values; if both have data, prefer cloud.
  const merged: UserProfile = {
    name: cloud.name || local.name,
    avatarUrl: cloud.avatarUrl || local.avatarUrl,
    coverUrl: cloud.coverUrl || local.coverUrl,
  };
  const changedLocally =
    merged.name !== local.name ||
    merged.avatarUrl !== local.avatarUrl ||
    merged.coverUrl !== local.coverUrl;
  if (changedLocally) await saveUserProfile(merged);
  // If local had richer data than cloud, push the merged version up.
  const changedCloud =
    merged.name !== cloud.name ||
    merged.avatarUrl !== cloud.avatarUrl ||
    merged.coverUrl !== cloud.coverUrl;
  if (changedCloud) await pushProfileToCloud(merged);
}

let realtimeChannelStarted = false;
function ensureRealtime(): void {
  if (realtimeChannelStarted) return;
  realtimeChannelStarted = true;
  (async () => {
    const userId = await getSessionUserId();
    if (!userId) { realtimeChannelStarted = false; return; }
    const channel = supabase
      .channel(`profile:${userId}`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        async (payload: any) => {
          const row = payload.new || payload.old;
          if (!row) return;
          const remote: UserProfile = {
            name: row.display_name || '',
            avatarUrl: row.avatar_url || '',
            coverUrl: row.cover_url || '',
          };
          const local = await loadUserProfile();
          if (
            local.name !== remote.name ||
            local.avatarUrl !== remote.avatarUrl ||
            local.coverUrl !== remote.coverUrl
          ) {
            await saveUserProfile({
              name: remote.name || local.name,
              avatarUrl: remote.avatarUrl || local.avatarUrl,
              coverUrl: remote.coverUrl || local.coverUrl,
            });
          }
        },
      )
      .subscribe();
    // Tear down if user signs out
    supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user) {
        try { supabase.removeChannel(channel); } catch {}
        realtimeChannelStarted = false;
      }
    });
  })();
}

export const useUserProfile = () => {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUserProfile()
      .then((p) => {
        setProfile(sanitizeUserProfile(p));
        setIsLoading(false);
      })
      .catch(() => {
        setProfile(DEFAULT_PROFILE);
        setIsLoading(false);
      });

    const handler = (e: CustomEvent<UserProfile>) => setProfile(sanitizeUserProfile(e.detail));
    window.addEventListener('userProfileUpdated', handler as EventListener);

    // Initial cloud reconcile + realtime
    reconcileFromCloud().catch(() => {});
    ensureRealtime();

    // Re-reconcile on auth state changes (e.g. first sign-in on a new device)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        reconcileFromCloud().catch(() => {});
        ensureRealtime();
      }
    });

    return () => {
      window.removeEventListener('userProfileUpdated', handler as EventListener);
      sub.subscription.unsubscribe();
    };
  }, []);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    const updated = sanitizeUserProfile({ ...profile, ...updates });
    setProfile(updated);
    await saveUserProfile(updated);
    // Fire-and-forget push to cloud
    pushProfileToCloud(updated).catch(() => {});
  }, [profile]);

  return { profile, isLoading, updateProfile };
};
