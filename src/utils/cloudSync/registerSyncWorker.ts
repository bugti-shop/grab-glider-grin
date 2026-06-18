/**
 * Guarded registration for the background-sync worker. Skipped in Lovable
 * preview/dev/iframe contexts so we never persist a stale worker during
 * editing. Only registered in production web builds.
 */
import { syncNow } from './syncEngine';

function shouldSkip(): boolean {
  try {
    if (!('serviceWorker' in navigator)) return true;
    if (window.top !== window.self) return true;          // inside iframe preview
    if (!import.meta.env.PROD) return true;
    const h = window.location.hostname;
    if (h.startsWith('id-preview--') || h.startsWith('preview--')) return true;
    if (h === 'lovableproject.com' || h.endsWith('.lovableproject.com')) return true;
    if (h === 'lovableproject-dev.com' || h.endsWith('.lovableproject-dev.com')) return true;
    if (h === 'beta.lovable.dev' || h.endsWith('.beta.lovable.dev')) return true;
    if (new URLSearchParams(window.location.search).get('sw') === 'off') return true;
  } catch { return true; }
  return false;
}

export function registerSyncWorker(): void {
  if (shouldSkip()) return;
  navigator.serviceWorker.register('/sw-sync.js', { scope: '/' }).then((reg) => {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'flowist:sync:resync') syncNow();
    });
    // Best-effort periodic sync (Chrome/Android only — silently ignored elsewhere)
    (reg as any).periodicSync?.register?.('flowist-resync', { minInterval: 15 * 60 * 1000 }).catch(() => {});
  }).catch((err) => console.warn('[sync] sw register failed', err));
}
