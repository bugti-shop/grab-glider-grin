/**
 * Adaptive prefetching — decides HOW MUCH to prefetch based on the user's
 * device + network so we never burn data on a slow 3G phone or thrash a
 * low-memory device, while still feeling instant on a fast laptop.
 *
 * Signals:
 *   - navigator.connection.saveData / effectiveType  (Network Information API)
 *   - navigator.deviceMemory                         (Device Memory API)
 *   - navigator.hardwareConcurrency                  (cheap CPU proxy)
 *   - document.visibilityState                       (don't prefetch in bg)
 */

type NetworkTier = 'offline' | 'slow' | 'medium' | 'fast';

interface NavigatorConnectionLike {
  saveData?: boolean;
  effectiveType?: '2g' | '3g' | '4g' | 'slow-2g';
  downlink?: number;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

const getConnection = (): NavigatorConnectionLike | null => {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & {
    connection?: NavigatorConnectionLike;
    mozConnection?: NavigatorConnectionLike;
    webkitConnection?: NavigatorConnectionLike;
  };
  return nav.connection || nav.mozConnection || nav.webkitConnection || null;
};

export const getNetworkTier = (): NetworkTier => {
  if (typeof navigator === 'undefined') return 'fast';
  if ('onLine' in navigator && !navigator.onLine) return 'offline';
  const c = getConnection();
  if (!c) return 'fast';
  if (c.saveData) return 'slow';
  switch (c.effectiveType) {
    case 'slow-2g':
    case '2g':
      return 'slow';
    case '3g':
      return 'medium';
    case '4g':
    default:
      return 'fast';
  }
};

export const getDeviceMemoryGB = (): number => {
  if (typeof navigator === 'undefined') return 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof mem === 'number' ? mem : 4;
};

/**
 * The single source of truth: is it OK to opportunistically prefetch right now?
 * `intent === 'hover'` always wins (the user is telegraphing the next nav).
 * `intent === 'idle'`  is gated by network + device + visibility.
 */
export const canPrefetch = (intent: 'hover' | 'idle' = 'idle'): boolean => {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return false;
  }
  const tier = getNetworkTier();
  if (tier === 'offline') return false;
  if (intent === 'hover') return true;          // user intent overrides everything else
  if (tier === 'slow') return false;            // never bulk-prefetch on 2G / Save-Data
  if (getDeviceMemoryGB() < 1) return false;    // very constrained device
  return true;
};

/**
 * Run a callback when the browser is idle, with a budget that adapts to
 * the network tier. Falls back to setTimeout where rIC isn't available.
 */
export const runOnAdaptiveIdle = (fn: () => void): void => {
  const tier = getNetworkTier();
  const timeout = tier === 'fast' ? 1500 : tier === 'medium' ? 4000 : 8000;
  const ric = (window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (typeof ric === 'function') {
    ric(fn, { timeout });
  } else {
    setTimeout(fn, tier === 'fast' ? 600 : 2000);
  }
};

/** Subscribe to network changes so callers can re-evaluate (e.g. wifi → cellular). */
export const onNetworkChange = (cb: () => void): (() => void) => {
  const c = getConnection();
  if (c?.addEventListener) {
    c.addEventListener('change', cb);
    return () => c.removeEventListener?.('change', cb);
  }
  return () => {};
};