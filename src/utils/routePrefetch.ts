/**
 * Route prefetching — preloads lazy route chunks on hover/touch/idle.
 * Maps route paths to their dynamic import() so the chunk loads before navigation.
 *
 * Adaptive: respects Save-Data, 2G/3G, deviceMemory, and tab visibility.
 * See `adaptivePrefetch.ts`.
 */
import { canPrefetch, runOnAdaptiveIdle, getNetworkTier, onNetworkChange } from './adaptivePrefetch';

const prefetchedRoutes = new Set<string>();
const prefetchPromises = new Map<string, Promise<void>>();

const ROUTE_IMPORTS: Record<string, () => Promise<any>> = {
  '/notes': () => import('@/pages/Notes'),
  '/notesdashboard': () => import('@/pages/Index'),
  '/notebooks': () => import('@/pages/Notebooks'),
  '/calendar': () => import('@/pages/NotesCalendar'),
  '/profile': () => import('@/pages/Profile'),
  '/settings': () => import('@/pages/Settings'),
  '/todo/today': () => import('@/pages/todo/Today'),
  '/todo/progress': () => import('@/pages/todo/Progress'),
  '/todo/calendar': () => import('@/pages/todo/TodoCalendar'),
  '/todo/settings': () => import('@/pages/todo/TodoSettings'),
  '/': () => import('@/pages/todo/Today'),
};

/** Prefetch a single route chunk (idempotent, no-op if already loaded).
 *  `intent` controls adaptive gating — hover/touch always wins. */
export function prefetchRoute(
  path: string,
  intent: 'hover' | 'idle' = 'hover'
): Promise<void> {
  if (prefetchedRoutes.has(path)) return Promise.resolve();
  const existingPromise = prefetchPromises.get(path);
  if (existingPromise) return existingPromise;
  const loader = ROUTE_IMPORTS[path];
  if (!loader) return Promise.resolve();
  if (!canPrefetch(intent)) return Promise.resolve();

  const promise = loader()
    .then(() => {
      prefetchedRoutes.add(path);
      prefetchPromises.delete(path);
    })
    .catch(() => {
      prefetchPromises.delete(path);
      prefetchedRoutes.delete(path);
    });

  prefetchPromises.set(path, promise);
  return promise;
}

/** Prefetch all lazy routes — adaptive: bottom-nav tabs on idle, rest later.
 *  On slow networks / low-memory devices this becomes a no-op and we rely on
 *  hover/touch prefetch instead. */
export function prefetchAllOnIdle(): void {
  if (!canPrefetch('idle')) {
    // Re-try if the user's connection improves later in the session
    const off = onNetworkChange(() => {
      if (canPrefetch('idle')) {
        off();
        prefetchAllOnIdle();
      }
    });
    return;
  }

  const bottomNavRoutes = [
    '/notes', '/notesdashboard', '/profile', '/settings', '/calendar',
    '/todo/today', '/todo/progress', '/todo/calendar', '/todo/settings',
  ];
  const tier = getNetworkTier();

  // Bottom-nav tabs: always — but still scheduled on idle to avoid jank
  runOnAdaptiveIdle(() => {
    bottomNavRoutes.forEach((p) => void prefetchRoute(p, 'idle'));
  });

  // Secondary routes: only on fast networks, with a longer idle budget
  if (tier === 'fast') {
    runOnAdaptiveIdle(() => {
      Object.keys(ROUTE_IMPORTS).forEach((p) => void prefetchRoute(p, 'idle'));
    });
  }
}

/** onPointerEnter / onTouchStart handler factory for nav items */
export function createPrefetchHandler(path: string) {
  return () => prefetchRoute(path);
}
