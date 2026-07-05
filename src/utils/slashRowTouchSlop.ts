/**
 * Configurable touch-move threshold (in CSS px) that a finger may drift
 * between pointerdown and pointerup before a cheat-sheet slash row tap is
 * treated as a scroll instead of a tap.
 *
 * Higher values make taps more forgiving (good for large phones / gloves).
 * Lower values scroll more easily without accidentally firing a row.
 */
const KEY = 'flowist:slashRowTouchSlop';
export const SLASH_ROW_TOUCH_SLOP_MIN = 2;
export const SLASH_ROW_TOUCH_SLOP_MAX = 32;
export const SLASH_ROW_TOUCH_SLOP_DEFAULT = 8;

export function getSlashRowTouchSlop(): number {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return SLASH_ROW_TOUCH_SLOP_DEFAULT;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return SLASH_ROW_TOUCH_SLOP_DEFAULT;
    return Math.min(SLASH_ROW_TOUCH_SLOP_MAX, Math.max(SLASH_ROW_TOUCH_SLOP_MIN, n));
  } catch {
    return SLASH_ROW_TOUCH_SLOP_DEFAULT;
  }
}

export function setSlashRowTouchSlop(px: number): void {
  const clamped = Math.min(SLASH_ROW_TOUCH_SLOP_MAX, Math.max(SLASH_ROW_TOUCH_SLOP_MIN, Math.round(px)));
  try {
    window.localStorage.setItem(KEY, String(clamped));
    window.dispatchEvent(new CustomEvent('flowist:slash-touch-slop-changed', { detail: clamped }));
  } catch {}
}
