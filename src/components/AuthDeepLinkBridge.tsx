import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

/**
 * On native (iOS/Android), when a user taps the "Verify email" link and the OS
 * routes that Universal / App Link back into the Flowist app, we get an
 * `appUrlOpen` event with the full URL including the Supabase session tokens
 * in the hash fragment. Supabase's `detectSessionInUrl` only runs once during
 * client init, so we must manually parse the tokens and call `setSession` to
 * complete sign-in — then route the user to /auth/callback so the standard
 * success screen shows.
 */
export const AuthDeepLinkBridge = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let sub: { remove: () => void } | null = null;

    CapApp.addListener('appUrlOpen', async ({ url }: { url: string }) => {
      try {
        if (!/\/auth\/callback/i.test(url)) return;
        const u = new URL(url);
        // Supabase puts tokens in the hash. Strip the leading '#'.
        const hash = u.hash.startsWith('#') ? u.hash.slice(1) : u.hash;
        const params = new URLSearchParams(hash || u.search.replace(/^\?/, ''));
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        const type = params.get('type');

        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
        }
        // Recovery links land here too — take the user to /auth/callback which
        // will detect the fresh session and route home.
        navigate('/auth/callback', { replace: true });
        // Silence the "type" hint so we don't warn about it.
        void type;
      } catch {
        /* ignore malformed deep links */
      }
    }).then((s) => { sub = s; }).catch(() => {});

    return () => { try { sub?.remove(); } catch {} };
  }, [navigate]);

  return null;
};
