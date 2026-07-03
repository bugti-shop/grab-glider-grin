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

    // First-launch: open the Feature Guide modal once so new users see the map.
    (async () => {
      try {
        const { getSetting, setSetting } = await import('@/utils/settingsStorage');
        const shown = await getSetting<boolean>('feature-guide-first-launch-shown', false);
        if (!shown) {
          await setSetting('feature-guide-first-launch-shown', true, { skipCloudSync: true });
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('feature-guide:open'));
          }, 900);
        }
      } catch {}
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') hydrateFromCloud().catch(() => {});
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);
};

/**
 * Fire a milestone-based tour exactly once per user.
 * Called from feature code when the user completes an onboarding action
 * (e.g. creates their first task or note).
 */
export const notifyOnboardingMilestone = async (
  kind: 'first-task' | 'first-note' | 'first-notebook',
) => {
  try {
    const { getSetting, setSetting } = await import('@/utils/settingsStorage');
    const key = `onboarding-milestone-${kind}`;
    const done = await getSetting<boolean>(key, false);
    if (done) return;
    await setSetting(key, true, { skipCloudSync: true });

    const tourId =
      kind === 'first-task'
        ? 'task-natural-language'
        : kind === 'first-note'
        ? 'notes-create-notebook'
        : 'notes-sketch';
    // Small delay so the newly created UI has time to render.
    setTimeout(() => TourManager.startTour(tourId, { auto: true }), 600);
  } catch {}
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
export const useFirstVisitTour = (route: string, explicitTourId?: string) => {
  useEffect(() => {
    if (explicitTourId) {
      TourManager.startTour(explicitTourId, { auto: true });
      return;
    }
    const eligible = FEATURE_TOURS.filter(
      (t) => t.trigger === 'first-visit' && t.route === route,
    );
    if (eligible.length === 0) return;

    (async () => {
      for (const tour of eligible) {
        TourManager.startTour(tour.id, { auto: true });
      }
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
  }, [route, explicitTourId]);
};


/** Fire an empty-state tour manually (e.g. from a Notes empty view). */
export const triggerEmptyStateTour = (tourId: string) => {
  TourManager.startTour(tourId, { auto: true });
};
