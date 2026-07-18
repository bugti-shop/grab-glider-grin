/**
 * Global app zoom (accessibility).
 * Scales root font-size, which cascades to every rem-based Tailwind utility
 * — fonts, padding, gap, icon sizes, sheet radii — so the entire UI grows
 * or shrinks together. Applied once on boot and whenever the user changes
 * the value from Settings.
 */
export const APP_ZOOM_STORAGE_KEY = 'accessibilityAppZoom';
export const APP_ZOOM_EVENT = 'app-zoom-change';
export const MIN_APP_ZOOM = 75;
export const MAX_APP_ZOOM = 200;
export const DEFAULT_APP_ZOOM = 100;
/** Tailwind's default root font-size — everything is scaled relative to this. */
const BASE_FONT_PX = 16;

export const readStoredAppZoom = (): number => {
  try {
    const raw = localStorage.getItem(APP_ZOOM_STORAGE_KEY);
    if (!raw) return DEFAULT_APP_ZOOM;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_APP_ZOOM;
    return Math.min(MAX_APP_ZOOM, Math.max(MIN_APP_ZOOM, Math.round(n)));
  } catch {
    return DEFAULT_APP_ZOOM;
  }
};

export const applyAppZoom = (percent: number): void => {
  if (typeof document === 'undefined') return;
  const clamped = Math.min(
    MAX_APP_ZOOM,
    Math.max(MIN_APP_ZOOM, Math.round(percent || DEFAULT_APP_ZOOM)),
  );
  const px = (BASE_FONT_PX * clamped) / 100;
  document.documentElement.style.fontSize = `${px}px`;
  document.documentElement.style.setProperty('--app-zoom', String(clamped / 100));
};

/** Call once at app boot (main.tsx) to restore the user's saved zoom. */
export const initAppZoom = (): void => {
  const value = readStoredAppZoom();
  applyAppZoom(value);
  if (typeof window === 'undefined') return;
  window.addEventListener(APP_ZOOM_EVENT, (e: Event) => {
    const detail = (e as CustomEvent<number>).detail;
    if (typeof detail === 'number') applyAppZoom(detail);
  });
  // Cross-tab sync
  window.addEventListener('storage', (e) => {
    if (e.key === APP_ZOOM_STORAGE_KEY) applyAppZoom(readStoredAppZoom());
  });
};
