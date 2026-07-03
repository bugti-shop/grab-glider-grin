import { useEffect, useRef } from 'react';

/**
 * Subscribe to the global `tasksUpdated` (and related) window events with a
 * stable listener that cannot be registered twice for the same hook instance.
 *
 * Why this exists:
 *   - Multiple screens listen for `tasksUpdated` to recompute counts.
 *   - Bare `useEffect(() => { addEventListener(...); return removeEventListener(...) })`
 *     with a fresh handler on every render still cleans up correctly, but a
 *     bug in a caller (missing cleanup, StrictMode double-invoke, HMR reload,
 *     or navigation transitions that don't unmount cleanly) can leak listeners
 *     and cause counts to drift.
 *   - This hook installs exactly one window listener per hook instance and
 *     routes every dispatch through a ref so the callback stays live without
 *     re-binding.
 */
const DEFAULT_EVENTS = [
  'tasksUpdated',
  'tasksRestored',
] as const;

export type TasksUpdatedEvent = typeof DEFAULT_EVENTS[number] | string;

export const useTasksUpdated = (
  callback: () => void,
  events: readonly TasksUpdatedEvent[] = DEFAULT_EVENTS,
) => {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      try {
        cbRef.current();
      } catch (err) {
        console.error('[useTasksUpdated] handler threw', err);
      }
    };

    // Deduplicate events in case a caller passes the same name twice.
    const unique = Array.from(new Set(events));
    unique.forEach((name) => window.addEventListener(name, handler));

    return () => {
      unique.forEach((name) => window.removeEventListener(name, handler));
    };
    // Intentionally exclude `callback` — we bind exactly once per event set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.join('|')]);
};
