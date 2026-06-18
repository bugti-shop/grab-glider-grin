/**
 * Persistence helpers for the per-habit Start Focus timer.
 *
 * Two layers of state live in localStorage:
 *  - `focus:habit:<id>` — per-habit timer (running endAt / paused remaining)
 *  - `focus:active`     — pointer to the habit whose focus dialog should
 *                         re-open after a refresh, regardless of which route
 *                         the user lands on first.
 *
 * Stale entries (finished, abandoned, or older than MAX_AGE_MS with no
 * running timer) are cleaned up on app mount.
 */

export interface FocusEntry {
  running?: boolean;
  endAt?: number;       // epoch ms when a running timer completes
  remaining?: number;   // seconds left for a paused timer
  duration?: number;    // originally selected duration in seconds
  updatedAt?: number;   // epoch ms when this entry was last written
}

export interface ActiveFocus {
  habitId: string;
  endAt?: number;
  updatedAt: number;
}

const PREFIX = 'focus:habit:';
const ACTIVE_KEY = 'focus:active';
// Drop paused/idle entries that haven't been touched for >24h.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const focusKeyFor = (habitId: string) => `${PREFIX}${habitId}`;

export function readFocus(habitId: string): FocusEntry | null {
  try {
    const raw = localStorage.getItem(focusKeyFor(habitId));
    return raw ? (JSON.parse(raw) as FocusEntry) : null;
  } catch {
    return null;
  }
}

export function writeFocus(habitId: string, entry: FocusEntry): void {
  try {
    localStorage.setItem(
      focusKeyFor(habitId),
      JSON.stringify({ ...entry, updatedAt: Date.now() }),
    );
  } catch {}
}

export function clearFocus(habitId: string): void {
  try { localStorage.removeItem(focusKeyFor(habitId)); } catch {}
}

export function setActiveFocus(habitId: string, endAt?: number): void {
  try {
    localStorage.setItem(
      ACTIVE_KEY,
      JSON.stringify({ habitId, endAt, updatedAt: Date.now() } satisfies ActiveFocus),
    );
  } catch {}
}

export function readActiveFocus(): ActiveFocus | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    return raw ? (JSON.parse(raw) as ActiveFocus) : null;
  } catch {
    return null;
  }
}

export function clearActiveFocus(): void {
  try { localStorage.removeItem(ACTIVE_KEY); } catch {}
}

/**
 * Sweep localStorage and drop any per-habit focus entries that are finished,
 * expired (running endAt is in the past), or stale (paused longer than
 * MAX_AGE_MS). Also clears the active pointer if its target is gone.
 */
export function cleanupStaleFocusKeys(): void {
  if (typeof localStorage === 'undefined') return;
  const now = Date.now();
  const removed = new Set<string>();
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      let entry: FocusEntry | null = null;
      try { entry = JSON.parse(localStorage.getItem(k) || 'null'); } catch {}
      if (!entry) { localStorage.removeItem(k); removed.add(k.slice(PREFIX.length)); continue; }
      const isRunningExpired = entry.running && entry.endAt && entry.endAt <= now;
      const isFinished = !entry.running && (entry.remaining ?? 0) <= 0;
      const isStale = !entry.running && entry.updatedAt && now - entry.updatedAt > MAX_AGE_MS;
      if (isRunningExpired || isFinished || isStale) {
        localStorage.removeItem(k);
        removed.add(k.slice(PREFIX.length));
      }
    }
    const active = readActiveFocus();
    if (active) {
      if (removed.has(active.habitId)) {
        clearActiveFocus();
      } else if (active.endAt && active.endAt <= now && !localStorage.getItem(focusKeyFor(active.habitId))) {
        clearActiveFocus();
      }
    }
  } catch {}
}
