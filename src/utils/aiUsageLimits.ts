// Client-side soft daily caps for AI features.
//
// Tier rules:
//  - Pro (paid, non-trial)  → unlimited (callers should skip checks)
//  - Free trial users       → 3 uses/day per feature (scan, voice)
//  - Free (post-trial/none) → 3 uses/day per feature (same cap)
//
// Counters live in localStorage and reset at local midnight (per device).
// This is intentionally a soft cap to discourage abuse, not a security boundary.

export type AiFeature = 'scan' | 'voice';

// Daily cap for non-Pro users (free + free-trial).
const DAILY_LIMIT = 3;

const LIMITS: Record<AiFeature, number> = {
  scan: DAILY_LIMIT,
  voice: DAILY_LIMIT,
};

const LABELS: Record<AiFeature, string> = {
  scan: 'image scans',
  voice: 'voice parses',
};

const storageKey = (f: AiFeature) => `aiUsage_${f}_v1`;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

interface UsageRecord { date: string; count: number; }

const read = (f: AiFeature): UsageRecord => {
  try {
    const raw = localStorage.getItem(storageKey(f));
    if (!raw) return { date: todayStr(), count: 0 };
    const parsed = JSON.parse(raw) as UsageRecord;
    if (parsed.date !== todayStr()) return { date: todayStr(), count: 0 };
    return parsed;
  } catch {
    return { date: todayStr(), count: 0 };
  }
};

const write = (f: AiFeature, rec: UsageRecord) => {
  try { localStorage.setItem(storageKey(f), JSON.stringify(rec)); } catch {}
};

export const getDailyLimit = (f: AiFeature) => LIMITS[f];
export const getUsedToday = (f: AiFeature) => read(f).count;
export const getRemainingToday = (f: AiFeature) =>
  Math.max(0, LIMITS[f] - read(f).count);

/** Returns true if the user is allowed to perform this action. */
export const canUseAiFeature = (f: AiFeature): boolean =>
  read(f).count < LIMITS[f];

/** Increment usage. Call AFTER a successful action. Pushes to cloud (fire-and-forget). */
export const recordAiUsage = (f: AiFeature) => {
  const cur = read(f);
  const next = { date: cur.date, count: cur.count + 1 };
  write(f, next);
  // Lazy import to avoid circular deps and keep this util sync.
  void import('./aiUsageCloud').then(({ pushAiUsage }) => pushAiUsage(f, next.count)).catch(() => {});
};

/** Friendly message for a toast when the cap is hit. */
export const getLimitReachedMessage = (f: AiFeature) =>
  `Daily limit reached (${LIMITS[f]} ${LABELS[f]}/day on the free trial without a card). Upgrade to Pro for unlimited use, or try again tomorrow.`;
