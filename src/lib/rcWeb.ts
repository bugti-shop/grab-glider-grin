/**
 * RevenueCat Web SDK wrapper (web-only)
 *
 * Docs: https://www.revenuecat.com/docs/getting-started/installation/web-sdk
 *
 * - Uses RevenueCat Web Billing (RC-hosted Stripe checkout).
 * - Entitlement identifier is "Flowist.me Pro" (configurable below).
 * - App User ID = the signed-in Supabase user id, so the same user is
 *   consistent across Web / iOS / Android via RC.
 */

import { Purchases, type CustomerInfo, type Package, type Offering } from '@revenuecat/purchases-js';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

// Web Billing public API key (safe to ship in client)
export const RC_WEB_API_KEY = 'strp_JTRoiOQgfDgdkcKLajOoYBADhcF';

// Entitlement identifier as configured in RevenueCat dashboard
export const RC_ENTITLEMENT_ID = 'Flowist.me Pro';

let configured = false;
let configuredAppUserId: string | null = null;

/** True on the web (RC Web SDK is not usable inside the native Capacitor shell). */
export function isRcWebAvailable(): boolean {
  return !Capacitor.isNativePlatform() && typeof window !== 'undefined';
}

/**
 * Configure the RevenueCat Web SDK. Safe to call multiple times — it
 * (re)configures when the signed-in user changes.
 */
export async function configureRcWeb(): Promise<Purchases | null> {
  if (!isRcWebAvailable()) return null;

  const { data } = await supabase.auth.getUser();
  const appUserId = data.user?.id ?? Purchases.generateRevenueCatAnonymousAppUserId();

  if (configured && configuredAppUserId === appUserId) {
    return Purchases.getSharedInstance();
  }

  Purchases.configure({ apiKey: RC_WEB_API_KEY, appUserId });
  configured = true;
  configuredAppUserId = appUserId;
  return Purchases.getSharedInstance();
}

/** If the user signs in after RC was configured anonymously, re-identify. */
export async function identifyRcWebUser(userId: string): Promise<void> {
  if (!isRcWebAvailable()) return;
  if (!configured) {
    Purchases.configure({ apiKey: RC_WEB_API_KEY, appUserId: userId });
    configured = true;
  } else if (configuredAppUserId !== userId) {
    // Web SDK: reconfigure with the new appUserId
    Purchases.configure({ apiKey: RC_WEB_API_KEY, appUserId: userId });
  }
  configuredAppUserId = userId;
}

export async function getRcOfferings(): Promise<{ current: Offering | null; all: Record<string, Offering> }> {
  const rc = await configureRcWeb();
  if (!rc) return { current: null, all: {} };
  const offerings = await rc.getOfferings();
  return { current: offerings.current, all: offerings.all };
}

export async function getRcCustomerInfo(): Promise<CustomerInfo | null> {
  const rc = await configureRcWeb();
  if (!rc) return null;
  return rc.getCustomerInfo();
}

export async function isProEntitled(): Promise<boolean> {
  const info = await getRcCustomerInfo();
  return !!info?.entitlements.active[RC_ENTITLEMENT_ID];
}

/**
 * Purchase a package from the current offering.
 * The Web SDK opens RC's hosted checkout (Stripe under the hood) and
 * resolves with the updated CustomerInfo once the purchase completes.
 */
export async function purchaseRcPackage(pkg: Package): Promise<CustomerInfo> {
  const rc = await configureRcWeb();
  if (!rc) throw new Error('RevenueCat Web SDK is not available in this environment');
  const { customerInfo } = await rc.purchase({ rcPackage: pkg });
  return customerInfo;
}

/** Pick a package from the current offering by RC package identifier or product duration. */
export function pickPackage(
  offering: Offering | null,
  key: 'weekly' | 'monthly' | 'yearly',
): Package | null {
  if (!offering) return null;
  if (key === 'weekly') return offering.availablePackages.find(p => p.identifier === '$rc_weekly') ?? null;
  if (key === 'monthly') return offering.availablePackages.find(p => p.identifier === '$rc_monthly') ?? null;
  if (key === 'yearly') return offering.availablePackages.find(p => p.identifier === '$rc_annual') ?? null;
  return null;
}
