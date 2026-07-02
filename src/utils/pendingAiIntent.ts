/**
 * Pending AI intent — remembers what the user was trying to do when we
 * interrupted them for sign-in, so the flow can resume automatically after
 * they authenticate.
 */
export type PendingAiIntentKind = 'scan-tasks' | 'scan-note';

export interface PendingAiIntent {
  kind: PendingAiIntentKind;
  /** Path to return to (pathname + search) so we land back on the right page. */
  path: string;
  /** Timestamp — used to drop stale intents (>10 min old). */
  ts: number;
}

const KEY = 'flowist_pending_ai_intent_v1';
const MAX_AGE_MS = 10 * 60 * 1000;

export function setPendingAiIntent(kind: PendingAiIntentKind, path?: string) {
  try {
    const p =
      path ??
      (typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : '/');
    const payload: PendingAiIntent = { kind, path: p, ts: Date.now() };
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* noop */
  }
}

export function peekPendingAiIntent(): PendingAiIntent | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAiIntent;
    if (!parsed || typeof parsed.kind !== 'string') return null;
    if (Date.now() - (parsed.ts || 0) > MAX_AGE_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function consumePendingAiIntent(): PendingAiIntent | null {
  const intent = peekPendingAiIntent();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
  return intent;
}

export function clearPendingAiIntent() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

/** URL query flag added after sign-in so the destination page auto-resumes. */
export const RESUME_SCAN_PARAM = 'resumeScan';
