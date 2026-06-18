// Google Sign-In via Supabase Auth — native (Capgo Social Login) on Android/iOS, Supabase OAuth on web
// Supabase is used ONLY for authentication. All data storage goes through Google Drive.
// Token refresh: Uses refresh_token (obtained via serverAuthCode exchange) for fully silent refresh.
// NO popup, NO redirect, NO account picker during background refresh.

import { Capacitor } from '@capacitor/core';
import { getSetting, setSetting, removeSetting } from './settingsStorage';
import { supabase } from '@/lib/supabase';
import { saveRefreshTokenToSupabase } from './supabaseTokenStorage';

const CLIENT_ID = '425291387152-u06impgmsgg286jg7odo4f40fu6pjmb5.apps.googleusercontent.com';

const SUPABASE_FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

// Auth-only scopes — Drive and Calendar integrations removed
const DRIVE_SCOPES: string[] = [];
const CALENDAR_SCOPES: string[] = [];
const NATIVE_SCOPES = ['openid', 'email', 'profile'];

const SESSION_TTL = 365 * 24 * 3600 * 1000; // 1 year session
const ACCESS_TOKEN_TTL = 3500 * 1000; // ~58 min
const PROACTIVE_REFRESH_BUFFER = 15 * 60 * 1000; // refresh 15 min before expiry
const WEB_REFRESH_RETRY_COUNT = 1;
const NATIVE_REFRESH_RETRY_COUNT = 2;
const NATIVE_SIGN_IN_TIMEOUT_MS = 45_000;

// No-op: Drive integration removed
const emitReauthNeeded = () => {};

const NATIVE_LOGIN_OPTIONS = {
  scopes: NATIVE_SCOPES,
  forceRefreshToken: true,
  filterByAuthorizedAccounts: false,
  autoSelectEnabled: false,
};

export interface GoogleUser {
  email: string;
  name: string;
  picture: string;
  accessToken: string;
  /** Supabase user ID */
  uid?: string;
  /** Google OAuth refresh token — used for silent background refresh */
  refreshToken?: string;
  /** serverAuthCode from native sign-in — exchanged for refresh_token */
  serverAuthCode?: string;
  accessTokenExpiresAt: number;
  expiresAt: number;
}

const isNative = () => Capacitor.isNativePlatform();

const makeUser = (
  profile: { email: string; name: string; picture: string },
  accessToken: string,
  uid?: string,
  extras?: { refreshToken?: string; serverAuthCode?: string },
): GoogleUser => ({
  ...profile,
  accessToken,
  uid,
  refreshToken: extras?.refreshToken,
  serverAuthCode: extras?.serverAuthCode,
  accessTokenExpiresAt: Date.now() + ACCESS_TOKEN_TTL,
  expiresAt: Date.now() + SESSION_TTL,
});

const persistRefreshTokenBestEffort = async (
  refreshToken?: string,
  email?: string,
): Promise<void> => {
  if (!refreshToken) return;

  try {
    await saveRefreshTokenToSupabase(refreshToken, email);
  } catch (err) {
    console.warn('Failed to persist refresh token backup:', err);
  }
};

type EdgeFunctionPayload = Record<string, unknown>;

/**
 * Call Edge Functions with Supabase auth/session attached.
 * Primary path uses supabase.functions.invoke (auto headers/session);
 * fallback path uses direct fetch with Bearer token for maximum compatibility.
 */
const callEdgeFunction = async <T>(
  functionName: string,
  payload: EdgeFunctionPayload,
): Promise<T> => {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: payload,
    });

    if (error) throw error;
    if (!data) throw new Error(`Empty response from ${functionName}`);
    return data as T;
  } catch (invokeErr) {
    console.warn(`functions.invoke failed for ${functionName}, falling back to fetch:`, invokeErr);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
    } catch {}

    const res = await fetch(`${SUPABASE_FUNCTIONS_BASE}/${functionName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${functionName} failed: ${res.status} ${errText}`);
    }

    return (await res.json()) as T;
  }
};

// ── Server-side Token Exchange via Supabase Edge Functions ────────────────

/**
 * Exchange a serverAuthCode for access_token + refresh_token
 * via the server-side `google-exchange` Edge Function.
 * Client secret stays on the server — never exposed to the frontend.
 */
const exchangeAuthCodeForTokens = async (
  serverAuthCode: string,
  _redirectUri: string = '',
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> => {
  console.log('Exchanging auth code via server-side Edge Function');
  const data = await callEdgeFunction<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }>('google-exchange', { code: serverAuthCode });

  console.log('Server auth code exchange result — refresh_token present:', !!data.refresh_token);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    expiresIn: data.expires_in || 3600,
  };
};

/**
 * Use a refresh_token to get a new access_token silently
 * via the server-side `refresh-google-token` Edge Function.
 * NO UI, NO popup, NO redirect — pure HTTP call to our backend.
 */
const refreshAccessTokenViaRefreshToken = async (
  refreshToken?: string,
): Promise<{ accessToken: string; expiresIn: number; newRefreshToken?: string }> => {
  const data = await callEdgeFunction<{
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
  }>('refresh-google-token', refreshToken ? { refresh_token: refreshToken } : {});

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 3600,
    newRefreshToken: data.refresh_token || undefined,
  };
};

// ── Native (@capgo/capacitor-social-login → Supabase credential) ──────────

const IOS_CLIENT_ID = '425291387152-hg7uajqc20bd8t3qfb760gngbl2pd20i.apps.googleusercontent.com';
const SERVER_CLIENT_ID = '425291387152-u06impgmsgg286jg7odo4f40fu6pjmb5.apps.googleusercontent.com';

type CapgoAccessToken = { token: string } | null;
type CapgoGoogleOnline = {
  responseType: 'online';
  accessToken: CapgoAccessToken;
  idToken: string | null;
  profile: {
    email: string | null;
    familyName: string | null;
    givenName: string | null;
    id: string | null;
    name: string | null;
    imageUrl: string | null;
  };
};
type CapgoLoginResult = {
  provider: 'google';
  result: CapgoGoogleOnline | { responseType: 'offline'; serverAuthCode: string };
};
type CapgoAuthCode = { jwt?: string; accessToken?: string };
type CapgoSocialLogin = {
  initialize: (opts: {
    google?: {
      iOSClientId?: string;
      iOSServerClientId?: string;
      webClientId?: string;
      mode?: 'online' | 'offline';
    };
  }) => Promise<void>;
  login: (opts: {
    provider: 'google';
    options: { scopes?: string[]; forceRefreshToken?: boolean; forcePrompt?: boolean };
  }) => Promise<CapgoLoginResult>;
  logout: (opts: { provider: 'google' }) => Promise<void>;
  getAuthorizationCode: (opts: { provider: 'google' }) => Promise<CapgoAuthCode>;
  isLoggedIn: (opts: { provider: 'google' }) => Promise<{ isLoggedIn: boolean }>;
};

let nativeInitialized = false;

const loadNativeGoogle = async (): Promise<CapgoSocialLogin> => {
  // Indirect specifier so Vite's web build doesn't statically resolve a native-only path.
  const mod = await import(
    /* @vite-ignore */ ('@capgo/' + 'capacitor-social-login') as string
  ) as { SocialLogin: CapgoSocialLogin; default?: { SocialLogin: CapgoSocialLogin } };
  const SocialLogin = mod.SocialLogin ?? mod.default?.SocialLogin;
  if (!SocialLogin) throw new Error('@capgo/capacitor-social-login is not available');
  return SocialLogin;
};

const withTimeout = <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });

const ensureNativeInit = async (): Promise<CapgoSocialLogin> => {
  const SocialLogin = await loadNativeGoogle();
  if (nativeInitialized) return SocialLogin;
  try {
    await SocialLogin.initialize({
      google: {
        iOSClientId: IOS_CLIENT_ID,
        iOSServerClientId: SERVER_CLIENT_ID,
        webClientId: SERVER_CLIENT_ID,
        mode: 'online', // online → returns accessToken + idToken + profile (we fetch serverAuthCode separately)
      },
    });
  } catch (initErr) {
    // initialize is idempotent across calls; ignore "already initialized" type errors.
    console.warn('[Auth] SocialLogin.initialize warning:', initErr);
  }
  nativeInitialized = true;
  return SocialLogin;
};

/**
 * Cancel any auto-sign-in prompt the native SDK may show on app start.
 */
let nativeAutoPromptCancelled = false;
export const cancelNativeAutoPrompt = async (): Promise<void> => {
  if (nativeAutoPromptCancelled || !isNative()) return;
  nativeAutoPromptCancelled = true;
  try {
    // Must initialize BEFORE calling logout, otherwise the plugin
    // ends up in a broken state and login() silently does nothing.
    const SocialLogin = await ensureNativeInit();
    await SocialLogin.logout({ provider: 'google' });
    console.log('[Auth] Cancelled native auto-sign-in prompt');
  } catch {
    // Ignore — may fail if not initialized yet, which is fine.
  }
};

/**
 * Eagerly initialize the native social-login plugin at app startup.
 * Capgo's SocialLogin REQUIRES initialize() before any other call,
 * otherwise login() can silently do nothing on iOS.
 */
export const initNativeSocialLogin = async (): Promise<void> => {
  if (!isNative()) return;
  try {
    await ensureNativeInit();
    console.log('[Auth] Native SocialLogin (Google) initialized');
  } catch (e) {
    console.warn('[Auth] Native SocialLogin init failed:', e);
  }
};

const extractNativeProfile = async (
  online: CapgoGoogleOnline,
  accessToken: string,
) => {
  let email = online.profile?.email || '';
  let name = online.profile?.name || '';
  let picture = online.profile?.imageUrl || '';

  if (!email && accessToken) {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const info = await res.json();
        email = info.email || email;
        name = info.name || name;
        picture = info.picture || picture;
      }
    } catch {}
  }
  return { email, name: name || email, picture };
};

const nativeSignIn = async (): Promise<GoogleUser> => {
  const SocialLogin = await ensureNativeInit();

  // Always force the account picker. Without forcePrompt, Credential Manager on
  // Android silently exits ("blinks") when no account is pre-authorized for the
  // app, and the Google sheet on iOS may auto-dismiss for returning users.
  const doLogin = (opts: { scopes?: string[]; forceRefreshToken?: boolean; forcePrompt?: boolean }) =>
    withTimeout<CapgoLoginResult>(
      SocialLogin.login({ provider: 'google', options: opts }),
      NATIVE_SIGN_IN_TIMEOUT_MS,
      'Google Sign-In timed out. Please close the Google sheet and try again.',
    );

  let response: CapgoLoginResult;
  try {
    response = await doLogin({
      scopes: NATIVE_SCOPES,
      forceRefreshToken: true,
      forcePrompt: true,
    });
  } catch (firstErr) {
    console.warn('[Auth] First Google sign-in attempt failed, retrying after logout:', firstErr);
    // Clear any stale Credential Manager state and retry with the picker forced.
    try { await SocialLogin.logout({ provider: 'google' }); } catch {}
    response = await doLogin({
      scopes: NATIVE_SCOPES,
      forceRefreshToken: true,
      forcePrompt: true,
    });
  }

  const r = response.result;
  if (r.responseType !== 'online') {
    throw new Error('Unexpected offline response from Google Sign-In');
  }

  const accessToken = r.accessToken?.token || '';
  const idToken = r.idToken || '';
  if (!accessToken) throw new Error('No access token received from Google Sign-In');

  // Pull serverAuthCode separately — needed for the one-time refresh_token exchange.
  let serverAuthCode = '';
  try {
    const code = await withTimeout(
      SocialLogin.getAuthorizationCode({ provider: 'google' }),
      8_000,
      'getAuthorizationCode timed out',
    );
    serverAuthCode = code?.jwt || code?.accessToken || '';
  } catch (e) {
    console.warn('[Auth] getAuthorizationCode failed (refresh-token exchange will be skipped):', e);
  }

  // Sign into Supabase with the Google ID token
  let supabaseUid: string | undefined;
  if (idToken) {
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
          access_token: accessToken,
        }),
        15_000,
        'Google session setup timed out',
      );
      if (!error && data.user) {
        supabaseUid = data.user.id;
      }
    } catch (e) {
      console.warn('Supabase signInWithIdToken failed, continuing with Google token:', e);
    }
  }

  // Exchange serverAuthCode for refresh_token (one-time)
  let refreshToken: string | undefined;
  if (serverAuthCode) {
    try {
      const tokens = await withTimeout(
        exchangeAuthCodeForTokens(serverAuthCode),
        12_000,
        'Google token exchange timed out',
      );
      refreshToken = tokens.refreshToken;
      console.log('Successfully obtained refresh_token from serverAuthCode');
    } catch (e) {
      console.warn('Failed to exchange serverAuthCode:', e);
    }
  }

  const profile = await extractNativeProfile(r, accessToken);
  const user = makeUser(profile, accessToken, supabaseUid, { refreshToken, serverAuthCode });
  await setSetting('googleUser', user);

  if (refreshToken) {
    persistRefreshTokenBestEffort(refreshToken, profile.email).catch(() => {});
  }

  return user;
};

const nativeSignOut = async () => {
  try {
    const SocialLogin = await loadNativeGoogle();
    await SocialLogin.logout({ provider: 'google' });
  } catch {}
};

let nativeRefreshCooldownUntil = 0;
const REFRESH_RETRY_COOLDOWN_MS = 2 * 60 * 1000;
let nativeRefreshInProgress: Promise<GoogleUser> | null = null;

/**
 * Native token refresh — uses the stored refresh_token (via our backend
 * Edge Function) for a fully silent HTTP-only refresh. NO native UI, NO
 * account picker, NO redirect. The capgo plugin doesn't expose a useful
 * `refresh()` return value, so we go straight to the backend path that
 * already powers web silent refresh.
 */
const nativeRefresh = async (): Promise<GoogleUser> => {
  if (nativeRefreshInProgress) return nativeRefreshInProgress;

  nativeRefreshInProgress = _nativeRefreshImpl();
  try {
    return await nativeRefreshInProgress;
  } finally {
    nativeRefreshInProgress = null;
  }
};

const _nativeRefreshImpl = async (): Promise<GoogleUser> => {
  const stored = await getStoredGoogleUser();
  if (!stored) throw new Error('No stored Google user');

  if (Date.now() < nativeRefreshCooldownUntil) return stored;

  // Refresh via backend using local or server-stored refresh token.
  try {
    const { accessToken, expiresIn, newRefreshToken } =
      await refreshAccessTokenViaRefreshToken(stored.refreshToken);

    const finalRefreshToken = newRefreshToken || stored.refreshToken;
    const refreshedUser: GoogleUser = {
      ...stored,
      accessToken,
      refreshToken: finalRefreshToken,
      accessTokenExpiresAt: Date.now() + (expiresIn * 1000) - 60000,
      expiresAt: Date.now() + SESSION_TTL,
    };
    await setSetting('googleUser', refreshedUser);
    console.log(`[Auth] ✅ Silent refresh succeeded — new token valid for ${expiresIn}s`);

    if (newRefreshToken) {
      saveRefreshTokenToSupabase(finalRefreshToken, stored.email).catch(() => {});
    }
    return refreshedUser;
  } catch (err) {
    console.error('[Auth] ❌ refresh_token → Edge Function FAILED:', err);
  }

  // On native, if refresh_token is missing or broken, we do NOT auto-open the
  // account picker. Emit reauth so the user can manually sign in from Profile.
  nativeRefreshCooldownUntil = Date.now() + REFRESH_RETRY_COOLDOWN_MS;
  console.warn('[Auth] Token refresh failed — emitting reauth, user must sign in manually');
  emitReauthNeeded();
  return stored;
};

// ── Web (Supabase OAuth for sign-in + GIS implicit flow for silent refresh) ──

let refreshInProgress: Promise<GoogleUser | null> | null = null;
let tokenRefreshInProgress: Promise<GoogleUser> | null = null;

let gisLoaded = false;

export const loadGoogleIdentityServices = (): Promise<void> => {
  if (gisLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    if ((window as any).google?.accounts?.oauth2) {
      gisLoaded = true;
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => { gisLoaded = true; resolve(); };
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
};

let gisTokenClient: any = null;

const getGisTokenClient = async () => {
  if (gisTokenClient) return gisTokenClient;
  await loadGoogleIdentityServices();
  const google = (window as any).google;
  if (!google?.accounts?.oauth2?.initTokenClient) return null;
  gisTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: ['openid', 'email', 'profile'].join(' '),
    callback: () => {},
  });
  return gisTokenClient;
};

const gisSilentTokenRefresh = (): Promise<string | null> => {
  const isMobileWeb = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobileWeb) return Promise.resolve(null);

  return new Promise(async (resolve) => {
    try {
      const client = await getGisTokenClient();
      if (!client) { resolve(null); return; }

      const timeout = setTimeout(() => resolve(null), 10000);

      client.callback = (response: any) => {
        clearTimeout(timeout);
        if (response.error) {
          console.warn('GIS silent refresh error:', response.error);
          resolve(null);
        } else {
          resolve(response.access_token || null);
        }
      };
      client.error_callback = () => {
        clearTimeout(timeout);
        resolve(null);
      };

      client.requestAccessToken({ prompt: '' });
    } catch {
      resolve(null);
    }
  });
};

/**
 * Web sign-in: Supabase OAuth handles consent + auth.
 * Uses signInWithOAuth which redirects to Google and back.
 * After redirect, onAuthStateChange fires and we capture provider tokens.
 */
const webSignIn = async (): Promise<GoogleUser> => {
  const existingUser = await getStoredGoogleUser();
  const hasRefreshToken = !!existingUser?.refreshToken;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: 'openid email profile',
      queryParams: {
        access_type: 'offline',
        prompt: hasRefreshToken ? 'select_account' : 'consent',
      },
      redirectTo: window.location.origin,
    },
  });

  if (error) throw new Error(`Supabase OAuth failed: ${error.message}`);

  // signInWithOAuth triggers a redirect — the actual user data is captured
  // in onAuthStateChange in GoogleAuthContext. We throw a sentinel so the
  // caller knows a redirect is happening (not an error).
  throw new Error('__OAUTH_REDIRECT__');
};

/**
 * Called after Supabase OAuth redirect completes.
 * Captures the session and builds a GoogleUser.
 */
export const captureOAuthSession = async (): Promise<GoogleUser | null> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const user = session.user;
  const providerToken = session.provider_token; // Google access token
  const providerRefreshToken = session.provider_refresh_token; // Google refresh token

  const existingUser = await getStoredGoogleUser();

  const profile = {
    email: user.email || '',
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || '',
    picture: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
  };

  const googleUser: GoogleUser = {
    ...profile,
    accessToken: providerToken || existingUser?.accessToken || '',
    uid: user.id,
    refreshToken: providerRefreshToken || existingUser?.refreshToken,
    accessTokenExpiresAt: providerToken ? Date.now() + ACCESS_TOKEN_TTL : (existingUser?.accessTokenExpiresAt || 0),
    expiresAt: Date.now() + SESSION_TTL,
  };

  await setSetting('googleUser', googleUser);

  // Persist refresh token to Supabase for cross-device recovery
  if (googleUser.refreshToken) {
    persistRefreshTokenBestEffort(googleUser.refreshToken, googleUser.email).catch(() => {});
  }

  loadGoogleIdentityServices().catch(() => {});
  return googleUser;
};

const webSignOut = async () => {
  try { await supabase.auth.signOut(); } catch {}
};

/**
 * Silent web refresh — uses refresh_token for Drive access.
 * Falls back to GIS Token Client on desktop.
 * NEVER shows any popup or redirect.
 */
const silentWebRefresh = async (): Promise<GoogleUser | null> => {
  if (refreshInProgress) return refreshInProgress;

  refreshInProgress = (async () => {
    const stored = await getStoredGoogleUser();
    if (!stored) return null;

    // Strategy 1: Refresh via backend using local or server-stored refresh token
    try {
        const { accessToken, expiresIn, newRefreshToken } = await refreshAccessTokenViaRefreshToken(stored.refreshToken);
        const finalRefreshToken = newRefreshToken || stored.refreshToken;
        const user: GoogleUser = {
          ...stored,
          accessToken,
          refreshToken: finalRefreshToken,
          accessTokenExpiresAt: Date.now() + (expiresIn * 1000) - 60000,
          expiresAt: Date.now() + SESSION_TTL,
        };
        await setSetting('googleUser', user);
        console.log('Web: refresh_token refresh succeeded');

        // Update backend copy if token rotated
        if (newRefreshToken) {
          saveRefreshTokenToSupabase(finalRefreshToken, stored.email).catch(() => {});
        }

        return user;
      } catch {
        console.warn('Web: refresh_token failed, trying next strategy');
    }

    // Strategy 2: GIS silent token refresh (desktop only)
    try {
      const newAccessToken = await gisSilentTokenRefresh();
      if (newAccessToken) {
        const user: GoogleUser = {
          ...stored,
          accessToken: newAccessToken,
          accessTokenExpiresAt: Date.now() + ACCESS_TOKEN_TTL,
          expiresAt: Date.now() + SESSION_TTL,
        };
        await setSetting('googleUser', user);
        console.log('GIS silent token refresh succeeded');
        return user;
      }
    } catch {}

    // Strategy 3: Check if Supabase session is still alive
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const user: GoogleUser = {
          ...stored,
          uid: session.user.id,
          expiresAt: Date.now() + SESSION_TTL,
        };
        await setSetting('googleUser', user);
        console.warn('Web: Supabase session alive but Drive access token expired — re-auth needed');
        emitReauthNeeded();
        return user;
      }
    } catch {}

    // All strategies failed
    console.warn('Web: All token refresh strategies failed — sync paused');
    emitReauthNeeded();
    return null;
  })();

  try {
    return await refreshInProgress;
  } finally {
    refreshInProgress = null;
  }
};

// ── Unified API ───────────────────────────────────────────────────────────

/**
 * @param explicit  Pass `true` ONLY when the user taps "Sign in with Google"
 *                  in the Profile section. When false/omitted on native,
 *                  the account picker is blocked — we emit reauth instead.
 */
export const signInWithGoogle = (explicit = false): Promise<GoogleUser> => {
  if (isNative() && !explicit) {
    // Block automatic account picker on Android — force manual sign-in only
    console.warn('[Auth] Blocked automatic native sign-in — user must sign in from Profile');
    emitReauthNeeded();
    return Promise.reject(new Error('Native sign-in blocked — use Profile to sign in'));
  }
  return isNative() ? nativeSignIn() : webSignIn();
};

export const signOutGoogle = async (): Promise<void> => {
  if (isNative()) {
    await nativeSignOut();
  } else {
    await webSignOut();
  }
  await supabase.auth.signOut().catch(() => {});
  await removeSetting('googleUser');
};

export const getStoredGoogleUser = async (): Promise<GoogleUser | null> => {
  const user = await getSetting<GoogleUser | null>('googleUser', null);
  if (!user) return null;
  if (!user.accessTokenExpiresAt) {
    user.accessTokenExpiresAt = 0;
  }
  return user;
};

/**
 * Session is always valid if Supabase session exists — never force logout.
 */
export const isSessionValid = (user: GoogleUser): boolean => {
  if (user.refreshToken) return true;
  return user.expiresAt > Date.now();
};

export const isAccessTokenFresh = (user: GoogleUser): boolean =>
  user.accessTokenExpiresAt > Date.now() + 60000;

/** @deprecated Use isAccessTokenFresh instead */
export const isTokenValid = (user: GoogleUser): boolean =>
  isAccessTokenFresh(user);

export const refreshGoogleToken = async (): Promise<GoogleUser> => {
  if (tokenRefreshInProgress) return tokenRefreshInProgress;

  tokenRefreshInProgress = (async () => {
    if (isNative()) return nativeRefresh();

    const silent = await silentWebRefresh();
    if (silent) return silent;

    const stored = await getStoredGoogleUser();
    if (stored) return stored;
    throw new Error('Token refresh failed');
  })();

  try {
    return await tokenRefreshInProgress;
  } finally {
    tokenRefreshInProgress = null;
  }
};

/**
 * Get a valid Google access token with Drive scope.
 * Automatically refreshes if expired.
 */
export const getValidAccessToken = async (): Promise<string | null> => {
  const user = await getStoredGoogleUser();
  if (!user) return null;

  if (isAccessTokenFresh(user)) return user.accessToken;

  const maxAttempts = isNative() ? NATIVE_REFRESH_RETRY_COUNT : WEB_REFRESH_RETRY_COUNT;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const refreshed = await refreshGoogleToken();
      if (refreshed?.accessToken && isAccessTokenFresh(refreshed)) {
        return refreshed.accessToken;
      }
    } catch {
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  return user.accessToken || null;
};

/**
 * Proactive background refresh — refreshes token even if still fresh but close to expiry.
 */
export const backgroundTokenRefresh = async (): Promise<void> => {
  const user = await getStoredGoogleUser();
  if (!user) return;

  if (user.refreshToken) {
    persistRefreshTokenBestEffort(user.refreshToken, user.email).catch(() => {});
  }

  if (user.accessTokenExpiresAt > Date.now() + PROACTIVE_REFRESH_BUFFER) return;

  if (user.expiresAt < Date.now() + 30 * 24 * 3600 * 1000) {
    user.expiresAt = Date.now() + SESSION_TTL;
    await setSetting('googleUser', user);
  }

  const maxAttempts = isNative() ? NATIVE_REFRESH_RETRY_COUNT : WEB_REFRESH_RETRY_COUNT;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await refreshGoogleToken();
      return;
    } catch {
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
      }
    }
  }
  console.warn('Background token refresh failed — will retry on next cycle');
};

/**
 * Drive integration removed — kept as a no-op so existing callers compile.
 * Returns the currently stored Google user without performing any refresh.
 */
export const forceRefreshDriveToken = async (): Promise<GoogleUser | null> => {
  return await getStoredGoogleUser();
};

if (import.meta.env.DEV) {
  (window as Window & {
    __flowistGoogleAuthDebug?: {
      expireAccessTokenNow: () => Promise<void>;
      refreshNow: () => Promise<void>;
      getState: () => Promise<GoogleUser | null>;
      clearRefreshToken: () => Promise<void>;
    };
  }).__flowistGoogleAuthDebug = {
    expireAccessTokenNow: async () => {
      const user = await getStoredGoogleUser();
      if (!user) return;
      await setSetting('googleUser', {
        ...user,
        accessTokenExpiresAt: Date.now() - 1000,
      });
    },
    refreshNow: async () => {
      await backgroundTokenRefresh();
    },
    getState: async () => getStoredGoogleUser(),
    clearRefreshToken: async () => {
      const user = await getStoredGoogleUser();
      if (!user) return;
      await setSetting('googleUser', { ...user, refreshToken: undefined });
      console.log('Cleared refresh_token — next refresh will use SocialLogin fallback');
    },
  };
}

// ── Supabase Auth state listener ──────────────────────────────────────────

export const onSupabaseAuthStateChanged = (
  callback: (user: { id: string; email?: string; displayName?: string; photoURL?: string } | null) => void,
  onTokenRefreshed?: () => void,
) => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      callback({
        id: session.user.id,
        email: session.user.email || undefined,
        displayName: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
        photoURL: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture,
      });
    } else {
      callback(null);
    }

    // When Supabase auto-refreshes its JWT, also refresh the Drive token
    if (event === 'TOKEN_REFRESHED' && onTokenRefreshed) {
      onTokenRefreshed();
    }
  });

  return () => subscription.unsubscribe();
};
