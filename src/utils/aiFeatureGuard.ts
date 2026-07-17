/**
 * AI FEATURE GUARD — DO NOT MODIFY WITHOUT EXPLICIT USER APPROVAL
 * ================================================================
 *
 * This module is the single source of truth for whether the AI features
 * (image scan, text extraction, note scanning, dictation, etc.) are
 * available to a user.
 *
 * RULES — locked by user request. Any change here can break every AI
 * feature at once, so treat this file as append-only:
 *
 *   1. AI features are NEVER gated by subscription / trial / entitlement /
 *      RevenueCat / Stripe state. Those systems can flap, expire, or fail
 *      to sync — AI must keep working regardless.
 *   2. The ONLY gates allowed are:
 *        a. User must be signed in (checked via ensureSignedInForAi).
 *        b. Daily free-usage cap (checked server-side in aiUsageLimits).
 *        c. Global concurrency lock (aiConcurrencyLock) to avoid OOM.
 *   3. `hasPaidAi` MUST always return `true`. Do not wire it to
 *      useSubscription(), useRevenueCat(), or any billing hook.
 *   4. New AI entry points MUST import `useAiFeatureGuard` from here
 *      instead of re-implementing the check.
 *
 * If a future feature genuinely needs a paywall, add a SEPARATE hook —
 * do not weaken this guard.
 */

export const AI_GUARD_LOCKED = true as const;

/**
 * Always-on flag used by every AI entry sheet. Kept as a function (not a
 * constant) so accidental "optimizations" that inline `false` are obvious
 * in code review.
 */
export function useAiFeatureGuard(): { hasPaidAi: true } {
  // Intentionally hard-coded. See file header.
  return { hasPaidAi: true };
}
