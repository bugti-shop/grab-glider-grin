// Reactive hook that reports whether a Flowist feature tour is currently
// running. Backed by `document.body.dataset.tourActive`, which TourManager
// toggles and broadcasts via the `flowist-tour-active-change` event.

import { useSyncExternalStore } from 'react';

const EVENT_NAME = 'flowist-tour-active-change';

export function readTourActive(): boolean {
  if (typeof document === 'undefined') return false;
  return document.body?.dataset.tourActive === 'true';
}

export function emitTourActiveChange(active: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { active } }));
  } catch {}
}

export function useIsTourActive(): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
      window.addEventListener(EVENT_NAME, notify);
      // Fallback: mutation observer on <body> in case something else toggles
      // the dataset (defensive; TourManager is the sole writer today).
      const observer = new MutationObserver(notify);
      if (document.body) {
        observer.observe(document.body, { attributes: true, attributeFilter: ['data-tour-active'] });
      }
      return () => {
        window.removeEventListener(EVENT_NAME, notify);
        observer.disconnect();
      };
    },
    readTourActive,
    () => false,
  );
}
