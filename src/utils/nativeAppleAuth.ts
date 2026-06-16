// Native Apple Sign-In for iOS (Capacitor) via @capgo/capacitor-social-login.
// Falls back to web OAuth on non-native platforms.
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { setSetting } from '@/utils/settingsStorage';
import { saveUserProfile, loadUserProfile } from '@/hooks/useUserProfile';
import type { GoogleUser } from '@/utils/googleAuth';

export const isNativeApple = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

type CapgoSocialLogin = {
  initialize: (opts: { apple?: Record<string, unknown> }) => Promise<void>;
  login: (opts: {
    provider: 'apple';
    options: { scopes?: string[]; nonce?: string };
  }) => Promise<{
    provider: 'apple';
    result: {
      idToken: string | null;
      accessToken?: { token: string } | null;
      profile: {
        user: string;
        email: string | null;
        givenName: string | null;
        familyName: string | null;
      };
      authorizationCode?: string;
    };
  }>;
  logout: (opts: { provider: 'apple' }) => Promise<void>;
};

type CapgoModule = { SocialLogin: CapgoSocialLogin; default?: { SocialLogin: CapgoSocialLogin } };

let capgoInitialized = false;
const loadCapgo = async (): Promise<CapgoSocialLogin> => {
  const mod = await import(
    /* @vite-ignore */ ('@capgo/' + 'capacitor-social-login') as string
  ) as CapgoModule;
  const SocialLogin = mod.SocialLogin ?? mod.default?.SocialLogin;
  if (!SocialLogin) throw new Error('@capgo/capacitor-social-login is not available');
  if (!capgoInitialized) {
    try {
      // On iOS native sheet handles everything — no clientId needed.
      // Android would need a Services ID + redirectUrl; we only run Apple on iOS today.
      await SocialLogin.initialize({ apple: {} });
    } catch (initErr) {
      // initialize is idempotent — ignore "already initialized" style errors.
      console.warn('[AppleAuth] SocialLogin.initialize warning:', initErr);
    }
    capgoInitialized = true;
  }
  return SocialLogin;
};

/**
 * Eagerly initialize Apple provider at app startup on iOS.
 * Capgo requires initialize() before login(), otherwise the native
 * sheet opens but the JS callback never fires.
 */
export const initNativeApple = async (): Promise<void> => {
  if (!isNativeApple()) return;
  try {
    await loadCapgo();
    console.log('[AppleAuth] Native SocialLogin (Apple) initialized');
  } catch (e) {
    console.warn('[AppleAuth] Native SocialLogin init failed:', e);
  }
};

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

const getAudience = (claims: Record<string, unknown> | null) => {
  const audience = claims?.aud;
  if (typeof audience === 'string') return audience;
  if (Array.isArray(audience)) return audience.filter((item) => typeof item === 'string').join(', ');
  return undefined;
};

const explainAppleExchangeError = (message: string, audience?: string) => {
  const lower = message.toLowerCase();
  if (lower.includes('aud') || lower.includes('audience') || lower.includes('client id')) {
    return `Apple token audience is "${audience || 'unknown'}", but the backend is not accepting it. Add this Bundle ID to Apple provider allowed Client IDs and use your own Apple credentials, not Managed mode.`;
  }
  if (lower.includes('nonce')) {
    return 'Apple nonce verification failed. Please try again once; if it repeats, the native token exchange configuration is rejecting the nonce.';
  }
  if (lower.includes('provider') || lower.includes('disabled')) {
    return 'Apple sign-in is not enabled correctly in backend Auth settings.';
  }
  return message || 'Apple sign-in was not accepted by the backend.';
};

/**
 * Map raw native errors from the Apple sheet into a user-friendly message.
 * Apple/AuthKit errors -7026 and AuthorizationError 1000 commonly mean the
 * device/simulator has no signed-in Apple ID. Capgo surfaces these as a
 * "cancelled"-shaped error, which our callers were silently swallowing.
 */
export const explainNativeAppleError = (err: unknown): string => {
  const raw =
    (err as { message?: string })?.message ||
    (typeof err === 'string' ? err : '') ||
    String(err || '');
  const code = String((err as { code?: string | number })?.code ?? '');
  const blob = `${raw} ${code}`.toLowerCase();

  if (
    blob.includes('-7026') ||
    blob.includes('1000') ||
    blob.includes('no active account') ||
    blob.includes('not signed in') ||
    blob.includes('no apple id')
  ) {
    return 'Apple sign-in is not available. On the iOS Simulator open Settings → Sign in to your iPhone and add an Apple ID, then try again. On a real device, make sure you are signed into iCloud.';
  }
  if (blob.includes('cancel')) return 'CANCELLED';
  if (blob.includes('network') || blob.includes('timed out') || blob.includes('-1001')) {
    return 'Network error during Apple sign-in. Check your connection and try again.';
  }
  return raw || 'Apple sign-in failed. Please try again.';
};

const withTimeout = <T,>(p: Promise<T>, ms: number, msg: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(msg)), ms);
    p.then(
      (v) => { clearTimeout(id); resolve(v); },
      (e) => { clearTimeout(id); reject(e); },
    );
  });

/**
 * Run native "Sign in with Apple" on iOS via @capgo/capacitor-social-login
 * and exchange the identity token for a Supabase session. Returns the
 * Supabase user on success.
 */
export const signInWithAppleNative = async () => {
  const SocialLogin = await loadCapgo();

  // Supabase requires the RAW nonce passed back; the native request should send the SHA-256 hash.
  const rawNonce = crypto.randomUUID();
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawNonce));
  const hashedNonce = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const response = await withTimeout(
    SocialLogin.login({
      provider: 'apple',
      options: {
        scopes: ['email', 'name'],
        nonce: hashedNonce,
      },
    }),
    90_000,
    'Apple Sign-In timed out. Please try again.',
  );
  const r = response.result;
  const identityToken: string | null | undefined = r?.idToken;
  if (!identityToken) throw new Error('No identity token returned from Apple Sign-In');

  const claims = decodeJwtPayload(identityToken);
  const audience = getAudience(claims);
  console.info('[AppleAuth] Native Apple token received', {
    audience,
    issuer: claims?.iss,
    expiresAt: claims?.exp,
    hasEmail: Boolean(claims?.email),
    hasNonce: Boolean(claims?.nonce),
  });

  const { data, error } = await withTimeout(
    supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken,
      nonce: rawNonce,
    }),
    20_000,
    'Apple session exchange timed out',
  );

  if (error) {
    console.error('[AppleAuth] signInWithIdToken error:', error.message, error);
    // Surface a useful message rather than an empty {}
    throw new Error(explainAppleExchangeError(error.message, audience));
  }

  console.info('[AppleAuth] Native Apple token exchanged for backend session');

  if (data?.user) {
    // Per Apple Sign In HIG: use the name Apple provides on first auth.
    // Apple only returns givenName/familyName on the FIRST sign-in for an Apple ID.
    const appleName =
      [r?.profile?.givenName, r?.profile?.familyName].filter(Boolean).join(' ').trim();
    const existingProfile = await loadUserProfile().catch(() => null);
    const displayName =
      appleName ||
      (data.user.user_metadata?.full_name as string | undefined) ||
      existingProfile?.name ||
      data.user.email ||
      'Apple User';

    // Persist Apple-provided name to Supabase user_metadata (one-shot) so we
    // never need to ask the user to type their name again.
    if (appleName && !data.user.user_metadata?.full_name) {
      try {
        await supabase.auth.updateUser({ data: { full_name: appleName, name: appleName } });
      } catch (profileError) {
        console.warn('[AppleAuth] Could not persist Apple display name', profileError);
      }
    }

    // Seed the local user profile so Profile screen shows the name immediately.
    if (!existingProfile?.name && displayName) {
      try {
        await saveUserProfile({
          name: displayName,
          avatarUrl: existingProfile?.avatarUrl || '',
          coverUrl: existingProfile?.coverUrl || '',
        });
      } catch (profileError) {
        console.warn('[AppleAuth] Could not seed local Apple profile', profileError);
      }
    }

    const appUser: GoogleUser = {
      email: data.user.email || r?.profile?.email || '',
      name: displayName,
      picture: '',
      accessToken: '',
      uid: data.user.id,
      accessTokenExpiresAt: 0,
      expiresAt: Date.now() + 365 * 24 * 3600 * 1000,
    };

    await setSetting('googleUser', appUser);
    window.dispatchEvent(new CustomEvent('googleAuthStateChanged', { detail: { user: appUser } }));
    window.dispatchEvent(new CustomEvent('syncReconnected'));
  }
  return data?.user ?? null;
};
