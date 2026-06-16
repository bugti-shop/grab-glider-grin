// Global AI concurrency lock.
//
// Why: Running multiple heavy AI calls (image scan + voice transcribe) at
// the same time on Android causes the WebView to OOM/crash (white screen).
// Each AI call uploads a base64 image/audio (often 500KB–2MB) and decodes a
// large response — doing 2–3 in parallel exceeds the WebView memory budget.
//
// Rule: Only ONE AI call may run at a time across the whole app. Additional
// callers get a friendly "busy" rejection so they can retry — never crash.
//
// Safety net: every acquired lock auto-releases after MAX_HOLD_MS even if
// the caller forgets to call release() (e.g., sheet closed mid-request, or
// an unhandled promise rejection). Prevents the app getting stuck "busy".

let inFlight = 0;
const MAX_CONCURRENT = 1;
const MAX_HOLD_MS = 60_000; // hard ceiling — any single AI call must finish in 60s

export const isAiBusy = () => inFlight >= MAX_CONCURRENT;

/**
 * Acquire the AI lock. Returns a release function, or `null` if another AI
 * call is already in progress (caller should show a "busy" toast).
 *
 * The release function is idempotent and is also called automatically after
 * MAX_HOLD_MS as a safety net — so a forgotten release can never permanently
 * jam the app in a "busy" state.
 */
export const acquireAiLock = (): (() => void) | null => {
  if (inFlight >= MAX_CONCURRENT) return null;
  inFlight++;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    inFlight = Math.max(0, inFlight - 1);
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    if (!released) {
      console.warn('[aiLock] auto-released after timeout');
      release();
    }
  }, MAX_HOLD_MS);
  return release;
};

/** Force-release ALL locks (escape hatch for sheet-close cleanup). */
export const releaseAllAiLocks = () => {
  if (inFlight > 0) {
    console.warn('[aiLock] force-releasing all locks');
    inFlight = 0;
  }
};

export const getAiBusyMessage = () =>
  'Another AI task is still running. Please wait a moment and try again.';
