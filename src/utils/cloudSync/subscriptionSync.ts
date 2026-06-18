/**
 * Writes the local subscription state up to Supabase `subscription_status` so
 * every signed-in device (iOS / Android / Web) picks it up instantly via the
 * realtime sync engine — no manual refresh needed.
 *
 * Call this from any place that observes a purchase / renewal / cancellation
 * event (RevenueCat callback, Stripe webhook handler in-app, restore flow).
 */
import { supabase } from '@/integrations/supabase/client';
import { enqueueWrite } from '@/utils/cloudSync/writeQueue';
import { getPlatform } from '@/utils/cloudSync/deviceId';

export interface SubscriptionSyncPayload {
  is_pro: boolean;
  product_id?: string | null;
  entitlement?: string | null;
  expires_at?: string | null;     // ISO
  will_renew?: boolean | null;
  store?: 'app_store' | 'play_store' | 'stripe' | 'paddle' | 'web' | null;
  raw?: Record<string, unknown> | null;
}

export async function syncSubscriptionStatus(payload: SubscriptionSyncPayload): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;
  const userId = session.user.id;

  const row = {
    id: userId,                  // one row per user, keyed by auth.uid()
    user_id: userId,
    is_pro: payload.is_pro,
    product_id: payload.product_id ?? null,
    entitlement: payload.entitlement ?? 'Pro',
    expires_at: payload.expires_at ?? null,
    will_renew: payload.will_renew ?? null,
    store: payload.store ?? (getPlatform() === 'ios' ? 'app_store' : getPlatform() === 'android' ? 'play_store' : 'web'),
    raw: payload.raw ?? null,
    is_deleted: false,
    updated_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabase.from('subscription_status').upsert(row as any, { onConflict: 'id' });
    if (error) throw error;
  } catch (err) {
    // Offline or transient failure → queue for retry. The engine flushes on
    // reconnect / foreground / heartbeat, so the user never has to refresh.
    console.warn('[sync] subscription upsert failed, queued', err);
    enqueueWrite('subscription_status', 'upsert', row as any);
  }
}
