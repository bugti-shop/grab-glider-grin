// Email + password authentication via Lovable Cloud (Supabase).
// First-time signup requires a one-time OTP from a Flowist-branded email.
// After verification, the user signs in with email + password (no further OTP).
//
// All data sync hooks already key off the Supabase user/session, so signing in
// here associates the same way Google sign-in does.

import { supabase } from '@/lib/supabase';
import { setSetting, removeSetting } from './settingsStorage';
import type { GoogleUser } from './googleAuth';

const SESSION_TTL = 365 * 24 * 3600 * 1000;
const ACCESS_TOKEN_TTL = 3500 * 1000;

const toAuthUser = (
  email: string,
  name: string,
  uid: string,
  accessToken: string,
): GoogleUser => ({
  email,
  name: name || email,
  picture: '',
  accessToken,
  uid,
  accessTokenExpiresAt: Date.now() + ACCESS_TOKEN_TTL,
  expiresAt: Date.now() + SESSION_TTL,
});

const persistAuthUser = async (u: GoogleUser) => {
  await setSetting('googleUser', u);
  window.dispatchEvent(
    new CustomEvent('googleAuthStateChanged', { detail: { user: u } }),
  );
};

/**
 * Step 1 of signup — creates the account and triggers a one-time confirmation
 * email containing the OTP token. The user is NOT signed in yet; they must
 * call `verifySignupOtp` to confirm.
 */
export const startEmailSignup = async (
  email: string,
  password: string,
  name?: string,
): Promise<void> => {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: name ? { full_name: name, name } : undefined,
      emailRedirectTo: `${window.location.origin}/`,
    },
  });
  if (error) throw error;
};

/**
 * Resend the signup confirmation OTP, throttled server-side (45s min interval,
 * max 5 per 15 minutes) via the `otp-resend` edge function.
 */
export const resendSignupOtp = async (email: string): Promise<void> => {
  await callOtpResend(email, 'signup');
};

const callOtpResend = async (
  email: string,
  type: 'signup' | 'email_change',
): Promise<void> => {
  const { data, error } = await supabase.functions.invoke('otp-resend', {
    body: { email, type },
  });
  if (error) {
    // supabase-js surfaces non-2xx as FunctionsHttpError; try to extract JSON.
    let payload: any = null;
    try { payload = (error as any).context ? await (error as any).context.json() : null; } catch {}
    const msg = payload?.message || error.message || 'Could not resend code';
    const err: any = new Error(msg);
    err.code = payload?.error;
    err.retryAfter = payload?.retryAfter;
    throw err;
  }
  if (data && (data as any).error) {
    const err: any = new Error((data as any).message || 'Could not resend code');
    err.code = (data as any).error;
    err.retryAfter = (data as any).retryAfter;
    throw err;
  }
};

/**
 * Human-friendly error mapping for OTP verify + resend failures.
 * Handles Supabase error codes, cooldowns, and network timeouts.
 */
export const classifyOtpError = (err: unknown): { code: string; message: string; retryAfter?: number } => {
  const e = err as any;
  if (!e) return { code: 'unknown', message: 'Something went wrong. Please try again.' };

  if (e.name === 'AbortError' || e.name === 'TimeoutError' || /timeout/i.test(String(e.message))) {
    return { code: 'timeout', message: 'The request timed out. Check your connection and try again.' };
  }
  if (e instanceof TypeError || /Failed to fetch|NetworkError|network/i.test(String(e.message))) {
    return { code: 'network', message: 'No internet connection. Reconnect and try again.' };
  }

  const raw = String(e.message || '').toLowerCase();
  const code = String(e.code || e.error_code || '').toLowerCase();

  if (code === 'cooldown' || /wait \d+s/.test(raw)) {
    return { code: 'cooldown', message: e.message || 'Please wait a moment before requesting another code.', retryAfter: e.retryAfter };
  }
  if (code === 'too_many_requests' || code === 'over_email_send_rate_limit' || raw.includes('rate limit') || raw.includes('too many')) {
    return { code: 'rate_limited', message: 'Too many attempts. Please try again later.', retryAfter: e.retryAfter };
  }
  if (code === 'otp_expired' || raw.includes('expired')) {
    return { code: 'expired', message: 'That code has expired. Tap "Resend code" to get a new one.' };
  }
  if (code === 'otp_disabled' || raw.includes('otp')) {
    // Fall through to invalid-code default below when nothing else matches.
  }
  if (raw.includes('invalid') || raw.includes('token') || raw.includes('mismatch')) {
    return { code: 'invalid', message: 'That code isn\'t right. Double-check and try again.' };
  }
  if (raw.includes('email') && raw.includes('already')) {
    return { code: 'email_taken', message: 'That email is already in use.' };
  }
  return { code: 'unknown', message: e.message || 'Something went wrong. Please try again.' };
};


/**
 * Step 2 of signup — verify the 6-digit OTP from the Flowist email.
 * On success the user is signed in and the session is persisted.
 */
export const verifySignupOtp = async (
  email: string,
  token: string,
): Promise<GoogleUser> => {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: token.trim(),
    type: 'signup',
  });
  if (error) throw error;
  if (!data.user || !data.session) {
    throw new Error('Verification did not return a session');
  }

  const meta = (data.user.user_metadata || {}) as Record<string, unknown>;
  const name = (meta.full_name as string) || (meta.name as string) || '';
  const u = toAuthUser(email, name, data.user.id, data.session.access_token);
  await persistAuthUser(u);
  return u;
};

/**
 * Returning users — email + password sign in (no OTP, account already verified).
 */
export const signInWithEmailPassword = async (
  email: string,
  password: string,
): Promise<GoogleUser> => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  if (!data.user || !data.session) {
    throw new Error('Sign-in failed');
  }
  const meta = (data.user.user_metadata || {}) as Record<string, unknown>;
  const name = (meta.full_name as string) || (meta.name as string) || '';
  const u = toAuthUser(email, name, data.user.id, data.session.access_token);
  await persistAuthUser(u);
  return u;
};

/**
 * Send a password-reset email branded as Flowist.
 */
export const sendPasswordReset = async (email: string): Promise<void> => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
};

export const signOutEmail = async (): Promise<void> => {
  try { await supabase.auth.signOut(); } catch {}
  await removeSetting('googleUser');
  window.dispatchEvent(
    new CustomEvent('googleAuthStateChanged', { detail: { user: null } }),
  );
};

/**
 * Step 1 of changing email — sends a 6-digit OTP to the NEW address.
 * The current email is NOT updated until `verifyEmailChangeOtp` succeeds.
 */
export const startEmailChange = async (newEmail: string): Promise<void> => {
  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: `${window.location.origin}/` },
  );
  if (error) throw error;
};

/**
 * Resend the email-change OTP (server-side throttled).
 */
export const resendEmailChangeOtp = async (newEmail: string): Promise<void> => {
  await callOtpResend(newEmail, 'email_change');
};

/**
 * Step 2 of changing email — verify the 6-digit OTP that was sent to the NEW
 * address. On success the auth user's email is updated and the local session
 * cache stays consistent.
 */
export const verifyEmailChangeOtp = async (
  newEmail: string,
  token: string,
): Promise<GoogleUser> => {
  const { data, error } = await supabase.auth.verifyOtp({
    email: newEmail,
    token: token.trim(),
    type: 'email_change',
  });
  if (error) throw error;
  if (!data.user) throw new Error('Verification did not return an updated user');

  const meta = (data.user.user_metadata || {}) as Record<string, unknown>;
  const name = (meta.full_name as string) || (meta.name as string) || '';
  const session = data.session ?? (await supabase.auth.getSession()).data.session;
  const accessToken = session?.access_token || '';
  const u = toAuthUser(newEmail, name, data.user.id, accessToken);
  await persistAuthUser(u);
  return u;
};

