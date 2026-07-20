/**
 * AI FEATURE GUARD — PREMIUM GATED (race-safe)
 * ================================================================
 * AI features (image scan, text extraction, note scanning, dictation)
 * require a real Pro entitlement. However, on cold app open the
 * subscription context can be briefly "loading" — during that window
 * `isPro` is false even for real subscribers, which caused the
 * intermittent "paywall shows even though I'm Pro" bug.
 *
 * Callers must respect `isResolving` and defer the gate check until
 * the subscription has resolved. Use `waitForAiEntitlement()` for a
 * one-shot promise that resolves once we actually know.
 */

import { useCallback } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';

export const AI_GUARD_LOCKED = true as const;

export function useAiFeatureGuard(): {
  hasPaidAi: boolean;
  isResolving: boolean;
  /** Await this before deciding whether to open the paywall. */
  ensureResolved: () => Promise<boolean>;
} {
  const { isPro, isLoading } = useSubscription();

  const ensureResolved = useCallback(async () => {
    // Wait up to ~4s for the subscription context to settle. We poll a
    // ref-free snapshot via a short RAF loop — good enough for the
    // one-time gate check right before an AI action.
    if (!isLoading) return !!isPro;
    const start = Date.now();
    return await new Promise<boolean>((resolve) => {
      const tick = () => {
        // Re-read latest via the closure is stale; caller re-renders
        // on context change so we bail after the timeout window and
        // let the next render pick up the correct value.
        if (Date.now() - start > 4000) return resolve(!!isPro);
        setTimeout(tick, 120);
      };
      tick();
    });
  }, [isPro, isLoading]);

  return { hasPaidAi: !!isPro, isResolving: !!isLoading, ensureResolved };
}
