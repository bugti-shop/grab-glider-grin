/**
 * Header safe-top calibration.
 *
 * - Auto-measures the actual notch / status-bar inset reported by the WebView
 *   via `env(safe-area-inset-top)` and applies a platform-aware baseline.
 * - Applies a user-adjustable offset (persisted in localStorage) on top of the
 *   measured baseline so users can fine-tune header position per device.
 * - Overrides the static `--safe-top` set in index.css by writing an inline
 *   CSS variable on the document root (highest priority).
 */

const OFFSET_KEY = 'flowist_safe_top_offset_px';
const MEASURED_KEY = 'flowist_safe_top_measured_px';

export const SAFE_TOP_OFFSET_MIN = -12;
export const SAFE_TOP_OFFSET_MAX = 24;
export const SAFE_TOP_OFFSET_DEFAULT = 0;

const isAndroid = () => typeof document !== 'undefined' && document.body.classList.contains('android-app');
const isIOS = () => typeof document !== 'undefined' && document.body.classList.contains('ios-app');

/** Measure the real env(safe-area-inset-top) reported by the WebView. */
export function measureSafeAreaInsetTop(): number {
  if (typeof document === 'undefined') return 0;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);';
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return px;
}

export function getUserOffset(): number {
  try {
    const raw = localStorage.getItem(OFFSET_KEY);
    if (raw == null) return SAFE_TOP_OFFSET_DEFAULT;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return SAFE_TOP_OFFSET_DEFAULT;
    return Math.max(SAFE_TOP_OFFSET_MIN, Math.min(SAFE_TOP_OFFSET_MAX, n));
  } catch {
    return SAFE_TOP_OFFSET_DEFAULT;
  }
}

export function setUserOffset(px: number) {
  const clamped = Math.max(SAFE_TOP_OFFSET_MIN, Math.min(SAFE_TOP_OFFSET_MAX, Math.round(px)));
  try { localStorage.setItem(OFFSET_KEY, String(clamped)); } catch {}
  applySafeTop();
}

export function resetUserOffset() {
  try { localStorage.removeItem(OFFSET_KEY); } catch {}
  applySafeTop();
}

export function getLastMeasuredInset(): number {
  try {
    const raw = localStorage.getItem(MEASURED_KEY);
    return raw ? parseFloat(raw) || 0 : 0;
  } catch { return 0; }
}

/**
 * Compute + apply --safe-top to the document root.
 * Baseline = max(measured inset, platform floor). Then + user offset.
 * We keep the CSS in index.css as a fallback, but write inline for override.
 */
export function applySafeTop(): { measured: number; baseline: number; final: number } {
  const measured = measureSafeAreaInsetTop();
  try { localStorage.setItem(MEASURED_KEY, String(measured)); } catch {}

  let floor = 0;
  if (isAndroid()) floor = 24;   // devices w/o env() reporting still need this
  else if (isIOS()) floor = 20;

  const baseline = Math.max(measured, floor);
  const offset = getUserOffset();
  const final = Math.max(0, baseline + offset);

  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--safe-top', `${final}px`);
  }
  return { measured, baseline, final };
}

/**
 * Auto-calibrate at boot and on orientation / viewport changes (which can
 * change the effective inset when the status bar mode changes).
 */
export function initSafeTopCalibration() {
  if (typeof window === 'undefined') return;
  const run = () => { try { applySafeTop(); } catch {} };
  // Wait a tick so body platform classes are set.
  setTimeout(run, 0);
  window.addEventListener('resize', run);
  window.addEventListener('orientationchange', run);
  // Re-measure once fonts / layout settle.
  setTimeout(run, 500);
}
