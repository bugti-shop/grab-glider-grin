/**
 * AI FEATURE GUARD — PREMIUM GATED
 * ================================================================
 *
 * Per user request (2026-07-20): AI features (image scan, text extraction,
 * note scanning, dictation, etc.) are now a PAID feature.
 *
 * Access requires ALL of:
 *   1. User is signed in (enforced separately via `ensureSignedInForAi`).
 *   2. User has an active Pro entitlement OR an active free trial
 *      (RevenueCat / SubscriptionContext `isPro`).
 *
 * When the user is not premium, call sites already open the paywall via
 * `requireFeature('ai_dictation')`. This hook simply returns
 * `hasPaidAi: false` so that branch fires on Android, iOS, and Web.
 *
 * NOTE: Users cannot use AI without signing in — the entitlement must be
 * tied to a real account so it works across devices.
 */

import { useSubscription } from '@/contexts/SubscriptionContext';

export const AI_GUARD_LOCKED = true as const;

export function useAiFeatureGuard(): { hasPaidAi: boolean } {
  const { isPro } = useSubscription();
  return { hasPaidAi: !!isPro };
}
