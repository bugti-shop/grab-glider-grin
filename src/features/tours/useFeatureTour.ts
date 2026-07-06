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

    // First-launch: open the Feature Guide modal once for EVERY user, then
    // kick off the compulsory onboarding chain as soon as the modal closes so
    // the first coach-mark ("Create your first task") appears with a Next
    // button. Bumped to v4 alongside the trimmed 10-tour compulsory chain so
    // existing installs re-run the new required flow once.
    (async () => {
      try {
        const { getSetting, setSetting } = await import('@/utils/settingsStorage');
        const KEY = 'feature-guide-first-launch-shown-v4';
        const shown = await getSetting<boolean>(KEY, false);
        if (!shown) {
          await setSetting(KEY, true, { skipCloudSync: true });
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('feature-guide:open', {
              detail: { startChainOnClose: true, compulsory: true },
            }));
          }, 900);
          return;
        }
        // Resume support: welcome sheet already shown, but if the user closed
        // the app mid-chain, auto-continue from the first not-yet-seen tour
        // on the next launch — without reopening the welcome sheet.
        await hydrateFromCloud().catch(() => {});
        const { ONBOARDING_CHAIN } = await import('./tourRegistry');
        const { hasSeenTour } = await import('./TourStateStore');
        for (const id of ONBOARDING_CHAIN) {
          if (!(await hasSeenTour(id))) {
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('flowist-onboarding:start-chain'));
            }, 1200);
            return;
          }
        }
      } catch {}
    })();

    // Whenever the welcome sheet closes AFTER a first-launch open, start the
    // onboarding chain from the first not-yet-seen tour. Individual chained
    // tours themselves skip if already marked seen, so a returning user who
    // reopens the sheet manually won't be re-walked through everything.
    const onChainRequest = () => {
      import('./tourRegistry').then(({ ONBOARDING_CHAIN }) => {
        (async () => {
          const { hasSeenTour } = await import('./TourStateStore');
          for (const id of ONBOARDING_CHAIN) {
            if (!(await hasSeenTour(id))) {
              // Compulsory: onboarding + "Start full tutorial" always run as
              // forced tours so users can't dismiss mid-flow.
              TourManager.startTour(id, { chain: true, forced: true });
              return;
            }
          }
        })();
      });
    };
    window.addEventListener('flowist-onboarding:start-chain', onChainRequest);

    // Action-completion → advance chain. Feature code fires this event with
    // { tourId } whenever the user completes the action for a chained tour.
    const onActionCompleted = (ev: Event) => {
      const detail = (ev as CustomEvent<{ tourId?: string }>).detail;
      const tourId = detail?.tourId;
      if (!tourId) return;
      TourManager.advanceOnboardingChain(tourId).catch(() => {});
    };
    window.addEventListener('flowist-onboarding:action-completed', onActionCompleted);

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') hydrateFromCloud().catch(() => {});
    });
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener('flowist-onboarding:start-chain', onChainRequest);
      window.removeEventListener('flowist-onboarding:action-completed', onActionCompleted);
    };
  }, [navigate]);
};

/**
 * Fire a milestone-based tour exactly once per user.
 * Kept for back-compat with existing call sites — internally these now feed
 * the onboarding chain so the correct next tour auto-fires.
 */
export const notifyOnboardingMilestone = async (
  kind: 'first-task' | 'first-note' | 'first-notebook',
) => {
  const tourId =
    kind === 'first-task'
      ? 'task-create-first'
      : kind === 'first-note'
      ? 'notes-create-first'
      : 'notes-create-notebook';
  window.dispatchEvent(new CustomEvent('flowist-onboarding:action-completed', {
    detail: { tourId },
  }));
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
