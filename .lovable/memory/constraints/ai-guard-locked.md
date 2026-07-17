---
name: AI feature guard is locked
description: AI features (image scan, text extract, scan note, dictation) must never be gated by subscription/trial/RevenueCat/Stripe state. Only sign-in + daily usage cap + concurrency lock.
type: constraint
---
`src/utils/aiFeatureGuard.ts` is the single source of truth. `hasPaidAi` must always be `true`. Every AI entry sheet imports `useAiFeatureGuard` — do not replace with `useSubscription`, `useRevenueCat`, or any billing hook.

**Why:** Billing state flaps and previously broke every AI feature (buttons became unclickable, camera never opened). User locked this guard after the fix — treat aiFeatureGuard.ts as append-only.

**Allowed gates only:**
1. `ensureSignedInForAi()` (sign-in required)
2. Server-side daily cap in `aiUsageLimits.ts`
3. `acquireAiLock()` concurrency lock (prevents WebView OOM)

If a new feature needs a paywall, add a SEPARATE hook — never weaken this guard.
