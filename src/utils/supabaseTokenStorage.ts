/**
 * Supabase-based refresh token storage.
 * Stores Google refresh tokens in the `user_refresh_tokens` table
 * so they survive app data clears and work across devices.
 */

import { supabase } from '@/lib/supabase';

// Cast to bypass strict typing for tables not yet in generated types
const db: any = supabase;

export const saveRefreshTokenToSupabase = async (
  refreshToken: string,
  _email?: string,
): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.warn('Cannot save refresh token — no Supabase user');
    return;
  }

  console.log(`[TokenDB] Saving refresh token for user ${user.id.slice(0, 8)}…`);

  const { error } = await db
    .from('user_refresh_tokens')
    .upsert(
      { user_id: user.id, google_refresh_token: refreshToken },
      { onConflict: 'user_id' },
    );

  if (error) {
    console.error('[TokenDB] ❌ SAVE FAILED:', error.message, error.details, error.hint);
  } else {
    console.log('[TokenDB] ✅ Refresh token saved to secure backend storage');
  }
};

export const loadRefreshTokenFromSupabase = async (): Promise<string | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.warn('[TokenDB] Cannot load refresh token — no Supabase user');
    return null;
  }

  console.log(`[TokenDB] Loading refresh token for user ${user.id.slice(0, 8)}…`);

  const { data, error } = await db
    .from('user_refresh_tokens')
    .select('google_refresh_token')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[TokenDB] ❌ LOAD FAILED:', error.message, error.details, error.hint);
    return null;
  }

  const token = data?.google_refresh_token || null;
  console.log(`[TokenDB] ${token ? '✅ Token LOADED from DB (length: ' + token.length + ')' : '⚠️ No token found in DB'}`);
  return token;
};
