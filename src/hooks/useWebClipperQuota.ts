import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const FEATURE = 'web_clipper_fetch';
export const WEB_CLIPPER_FREE_MONTHLY_LIMIT = 10;

function monthBucket(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Reads the current user's Web Clipper monthly usage counter.
 * Auto-refetches when the auth user changes and exposes a `refresh()`
 * so callers can re-poll after a successful clip or subscription flip.
 */
export function useWebClipperQuota(enabled: boolean) {
  const [used, setUsed] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setUserId(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || !userId) {
      setUsed(0);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_daily_ai_usage')
        .select('count')
        .eq('identifier_type', 'user')
        .eq('identifier', userId)
        .eq('feature', FEATURE)
        .eq('usage_date', monthBucket())
        .maybeSingle();
      if (!error) setUsed(data?.count ?? 0);
    } finally {
      setLoading(false);
    }
  }, [enabled, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const limit = WEB_CLIPPER_FREE_MONTHLY_LIMIT;
  const remaining = Math.max(0, limit - used);
  const percent = Math.min(100, Math.round((used / limit) * 100));

  return { used, limit, remaining, percent, loading, refresh };
}
