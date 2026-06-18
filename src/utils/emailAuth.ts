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
 * Resend the signup confirmation OTP if it expired or wasn't delivered.
 */
export const resendSignupOtp = async (email: string): Promise<void> => {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
  });
  if (error) throw error;
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
