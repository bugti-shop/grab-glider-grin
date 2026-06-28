/**
 * User-configurable duration (ms) that the colored "fill" stays painted on the
 * completion-ring after the user clicks it. The actual completion fires
 * instantly — this only controls the animation length.
 *
 * Default 900ms preserves the satisfying paint-fill feedback while keeping
 * the data layer optimistic. Range 0–3000ms; 0 disables the fill entirely
 * for users who prioritise raw speed.
 */
const KEY = 'task:ringFillMs';
export const RING_FILL_MS_DEFAULT = 900;
export const RING_FILL_MS_MIN = 0;
export const RING_FILL_MS_MAX = 3000;

export function getRingFillMs(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return RING_FILL_MS_DEFAULT;
    const v = Number(raw);
    if (!Number.isFinite(v)) return RING_FILL_MS_DEFAULT;
    return Math.min(RING_FILL_MS_MAX, Math.max(RING_FILL_MS_MIN, v));
  } catch {
    return RING_FILL_MS_DEFAULT;
  }
}

export function setRingFillMs(ms: number): void {
  const clamped = Math.min(RING_FILL_MS_MAX, Math.max(RING_FILL_MS_MIN, Math.round(ms)));
  try { localStorage.setItem(KEY, String(clamped)); } catch {}
  try { window.dispatchEvent(new CustomEvent('ringFillMsChanged', { detail: clamped })); } catch {}
}

export function subscribeRingFillMs(fn: (ms: number) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => fn((e as CustomEvent<number>).detail ?? getRingFillMs());
  window.addEventListener('ringFillMsChanged', handler);
  return () => window.removeEventListener('ringFillMsChanged', handler);
}
