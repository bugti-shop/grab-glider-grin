/**
 * Collect all identifiers that could match a Pro entitlement server-side.
 *
 * Why: intermittent "Could not read tasks from this image" (402) happens when
 * the server looks up `user_entitlements` / RevenueCat only by
 * (auth user.id, auth email) but the RevenueCat App User ID stored against
 * the active subscription is different — e.g. an older email, a previous
 * account, a RevenueCat anonymous id ($RCAnonymousID:xxx) that owns the
 * purchase, or a Stripe email that differs from the current auth email.
 *
 * By sending every candidate identifier we know about on the client, the
 * server can find the entitlement no matter which key the purchase was
 * registered under. Users used to "fix" this by switching accounts or
 * switching plan (which forced a re-register); this makes it work first try.
 */
import { Purchases } from '@revenuecat/purchases-capacitor';
import type { CustomerInfo } from '@revenuecat/purchases-capacitor';
import { supabase } from '@/integrations/supabase/client';

export async function collectAiClientIdentifiers(
  customerInfo?: CustomerInfo | null,
): Promise<string[]> {
  const set = new Set<string>();

  // Auth session identifiers
  try {
    const { data } = await supabase.auth.getUser();
    const u = data?.user;
    if (u?.id) set.add(String(u.id));
    if (u?.email) set.add(String(u.email).trim().toLowerCase());
  } catch { /* noop */ }

  // RevenueCat current App User ID (native only)
  try {
    const r: any = await Purchases.getAppUserID();
    const id = typeof r === 'string' ? r : r?.appUserID;
    if (id) set.add(String(id));
  } catch { /* not native / not configured */ }

  // Original RC identifier from CustomerInfo (survives logIn/logOut)
  try {
    const anyInfo = customerInfo as any;
    const original = anyInfo?.originalAppUserId ?? anyInfo?.original_app_user_id;
    if (original) set.add(String(original));
  } catch { /* noop */ }

  return Array.from(set).filter(Boolean);
}
