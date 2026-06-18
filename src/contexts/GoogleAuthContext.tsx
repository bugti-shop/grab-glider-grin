import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import {
  GoogleUser,
  signInWithGoogle,
  signOutGoogle,
  getStoredGoogleUser,
  loadGoogleIdentityServices,
  backgroundTokenRefresh,
  onSupabaseAuthStateChanged,
  captureOAuthSession,
  cancelNativeAutoPrompt,
} from '@/utils/googleAuth';
import { setSetting } from '@/utils/settingsStorage';

interface GoogleAuthContextType {
  user: GoogleUser | null;
  isLoading: boolean;
  isSigningIn: boolean;
  /** @param explicit Pass true only when user explicitly taps "Sign in with Google" in Profile */
  signIn: (explicit?: boolean) => Promise<GoogleUser>;
  signOut: () => Promise<void>;
}

const GoogleAuthContext = createContext<GoogleAuthContextType | undefined>(undefined);

const BG_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const SESSION_TTL = 365 * 24 * 3600 * 1000;

export function GoogleAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval>>();

  // Load stored user on mount + capture OAuth redirect session
  useEffect(() => {
    const loadUser = async () => {
      try {
        // Cancel any native auto-sign-in prompt immediately on startup
        cancelNativeAutoPrompt();

        // Check if this is an OAuth redirect callback
        const oauthUser = await captureOAuthSession();
        if (oauthUser) {
          setUser(oauthUser);
          setIsLoading(false);
          return;
        }

        const stored = await getStoredGoogleUser();
        if (stored) {
          // Extend session silently
          if (stored.expiresAt < Date.now() + 30 * 24 * 3600 * 1000) {
            stored.expiresAt = Date.now() + SESSION_TTL;
            await setSetting('googleUser', stored);
          }
          setUser(stored);
        }
        // GSI script is now loaded on-demand when user triggers sign-in
        // This avoids ~95KB of unused JS on initial page load
      } catch (err) {
        console.error('Failed to load Google user:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadUser();
  }, []);

  // Native Apple sign-in happens outside this context, so listen for the
  // shared auth-change event and reload the stored signed-in profile instantly.
  useEffect(() => {
    const handleAuthStateChanged = async (event: Event) => {
      const detailUser = (event as CustomEvent<{ user?: GoogleUser | null }>).detail?.user;

      if (detailUser !== undefined) {
        setUser(detailUser);
        setIsLoading(false);
        setIsSigningIn(false);
        return;
      }

      const stored = await getStoredGoogleUser();
      setUser(stored);
      setIsLoading(false);
      setIsSigningIn(false);
    };

    window.addEventListener('googleAuthStateChanged', handleAuthStateChanged);
    return () => window.removeEventListener('googleAuthStateChanged', handleAuthStateChanged);
  }, []);

  // Listen to Supabase auth state changes + auto-refresh Drive token on TOKEN_REFRESHED
  useEffect(() => {
    const unsubscribe = onSupabaseAuthStateChanged(
      async (sbUser) => {
        if (!sbUser) return;
        if (user?.uid === sbUser.id) return;

        const stored = await getStoredGoogleUser();
        const nextUser: GoogleUser = stored
          ? { ...stored, uid: sbUser.id, expiresAt: Date.now() + SESSION_TTL }
          : {
              email: sbUser.email || '',
              name: sbUser.displayName || sbUser.email || '',
              picture: sbUser.photoURL || '',
              accessToken: '',
              uid: sbUser.id,
              accessTokenExpiresAt: 0,
              expiresAt: Date.now() + SESSION_TTL,
            };

        await setSetting('googleUser', nextUser);
        setUser(nextUser);
      },
      // This fires when Supabase auto-refreshes its JWT — piggyback Drive token refresh
      async () => {
        console.log('Supabase TOKEN_REFRESHED → refreshing Google Drive token');
        const refreshed = await forceRefreshDriveToken();
        if (refreshed) setUser(refreshed);
      },
    );
    return () => unsubscribe();
  }, [user?.uid]);

  // Background token refresh
  useEffect(() => {
    if (!user) return;

    backgroundTokenRefresh().catch(() => {});

    // TEMP DISABLED — two-way Google Calendar sync (pending Google scope
    // verification). Re-enable once scopes are approved.
    // startCalendarAutoSync();

    refreshTimerRef.current = setInterval(() => {
      backgroundTokenRefresh().then(async () => {
        const refreshed = await getStoredGoogleUser();
        if (refreshed) setUser(refreshed);
      }).catch(() => {});
    }, BG_REFRESH_INTERVAL);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        backgroundTokenRefresh().then(async () => {
          const refreshed = await getStoredGoogleUser();
          if (refreshed) setUser(refreshed);
        }).catch(() => {});
      }
    };

    const handleOnline = () => {
      backgroundTokenRefresh().then(async () => {
        const refreshed = await getStoredGoogleUser();
        if (refreshed) setUser(refreshed);
      }).catch(() => {});
    };

    const handleReauthNeeded = () => {
      console.log('Drive re-auth needed — showing Reconnect Sync button');
      window.dispatchEvent(new CustomEvent('syncStatusChanged', { detail: { status: 'reauth' } }));
    };

    const handleSyncReconnected = () => {
      setTimeout(() => {
        window.dispatchEvent(new Event('triggerManualSync'));
      }, 2000);
    };
    window.addEventListener('syncReconnected', handleSyncReconnected);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('driveReauthNeeded', handleReauthNeeded);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('driveReauthNeeded', handleReauthNeeded);
      window.removeEventListener('syncReconnected', handleSyncReconnected);
      // TEMP DISABLED — see note above.
      // stopCalendarAutoSync();
    };
  }, [user?.email]);

  const signIn = useCallback(async (explicit = false): Promise<GoogleUser> => {
    setIsSigningIn(true);
    try {
      const googleUser = await signInWithGoogle(explicit);
      setUser(googleUser);
      window.dispatchEvent(
        new CustomEvent('googleAuthStateChanged', { detail: { user: googleUser } }),
      );
      window.dispatchEvent(new CustomEvent('syncReconnected'));
      return googleUser;
    } catch (err: any) {
      // OAuth redirect is expected on web — not an error
      if (err?.message === '__OAUTH_REDIRECT__') {
        throw err; // Let it propagate — page will redirect
      }
      console.error('Google sign-in failed:', err);
      throw err;
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await signOutGoogle();
    setUser(null);
    window.dispatchEvent(new CustomEvent('googleAuthStateChanged'));
  }, []);

  return (
    <GoogleAuthContext.Provider value={{ user, isLoading, isSigningIn, signIn, signOut }}>
      {children}
    </GoogleAuthContext.Provider>
  );
}

export function useGoogleAuth() {
  const context = useContext(GoogleAuthContext);
  if (!context) {
    throw new Error('useGoogleAuth must be used within a GoogleAuthProvider');
  }
  return context;
}
