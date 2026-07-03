// React glue for the tour system.
// - Registers the router's navigate() with the singleton TourManager.
// - Hydrates cloud-side "seen" state on mount and on sign-in.
// - Exposes reactive `seenSet` so the FeatureGuideModal can show badges.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { TourManager } from './TourManager';
import {
  ensureInstallDate,
  getAllTourStates,
  getDaysSinceInstall,
  hydrateFromCloud,
  markTourSeen,
  resetTour,
  type TourStateMap,
} from './TourStateStore';
import { FEATURE_TOURS } from './tourRegistry';
import { supabase } from '@/integrations/supabase/client';

/** Mount once near the app root to wire navigation + cloud hydration. */
export const useTourBootstrap = () => {
  const navigate = useNavigate();

  useEffect(() => {
    TourManager.setNavigate((path) => navigate(path));
    ensureInstallDate().catch(() => {});
    hydrateFromCloud().catch(() => {});

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') hydrateFromCloud().catch(() => {});
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);
};

/** Consumer hook: reactive seen-state + tour actions. */
export const useFeatureTour = () => {
  const [seen, setSeen] = useState<TourStateMap>({});

  useEffect(() => {
    let mounted = true;
    getAllTourStates().then((m) => mounted && setSeen(m));
    const onChange = () => {
      getAllTourStates().then((m) => mounted && setSeen(m));
    };
    window.addEventListener('featureToursChanged', onChange);
    return () => {
      mounted = false;
      window.removeEventListener('featureToursChanged', onChange);
    };
  }, []);

  const hasSeen = useCallback(
    (tourId: string) => !!seen[tourId]?.seenAt || !!seen[tourId]?.dismissedForever,
    [seen],
  );

  const start = useCallback((tourId: string) => TourManager.startTour(tourId, { force: true }), []);
  const queue = useCallback((tourId: string) => TourManager.queueTour(tourId), []);
  const reset = useCallback((tourId: string) => resetTour(tourId), []);
  const markSeen = useCallback((tourId: string) => markTourSeen(tourId), []);

  return { seen, hasSeen, start, queue, reset, markSeen };
};

/** Fire the first-visit tour(s) for a given route, if any and not yet seen. */
export const useFirstVisitTour = (route: string) => {
  useEffect(() => {
    const eligible = FEATURE_TOURS.filter(
      (t) => t.trigger === 'first-visit' && t.route === route,
    );
    if (eligible.length === 0) return;

    (async () => {
      // days-since-install trigger honoring
      for (const tour of eligible) {
        TourManager.startTour(tour.id, { auto: true });
      }
      // Also try any days-since-install tours whose window has arrived.
      const days = await getDaysSinceInstall();
      const dueByAge = FEATURE_TOURS.filter(
        (t) =>
          t.trigger === 'days-since-install' &&
          t.route === route &&
          (t.triggerConfig?.days ?? 0) <= days,
      );
      for (const tour of dueByAge) {
        TourManager.startTour(tour.id, { auto: true });
      }
    })();
  }, [route]);
};

/** Fire an empty-state tour manually (e.g. from a Notes empty view). */
export const triggerEmptyStateTour = (tourId: string) => {
  TourManager.startTour(tourId, { auto: true });
};
