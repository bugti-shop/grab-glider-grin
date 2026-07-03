// Singleton coach-mark orchestrator built on driver.js.
// - Only one tour can be active at a time; extra requests queue.
// - Auto-navigates to the tour's `route`, waits for the first selector to mount,
//   then drives step-by-step with Flowist-branded popovers.
// - Skip / Next / "Don't show again" all persist via TourStateStore.

import { driver, type Driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

import { getTour, type FeatureTour, type FeatureTourStep } from './tourRegistry';
import {
  dismissTourForever,
  hasSeenTour,
  isDismissedForever,
  markTourSeen,
} from './TourStateStore';

type NavigateFn = (path: string) => void;

class TourManagerImpl {
  private navigate: NavigateFn | null = null;
  private activeDriver: Driver | null = null;
  private activeTourId: string | null = null;
  private queue: string[] = [];
  private autoChainCount = 0;

  /** Called once by <TourProvider/> so we can navigate before starting a tour. */
  setNavigate(fn: NavigateFn) {
    this.navigate = fn;
  }

  isActive() {
    return !!this.activeDriver;
  }

  activeId() {
    return this.activeTourId;
  }

  /** Start a tour immediately (or queue it if another one is running). */
  async startTour(tourId: string, opts: { force?: boolean; auto?: boolean } = {}) {
    const tour = getTour(tourId);
    if (!tour) return;

    if (!opts.force) {
      if (await isDismissedForever(tourId)) return;
      if (opts.auto && (await hasSeenTour(tourId))) return;
      // Prevent noisy auto-chains: cap at 1 auto-tour per session boot.
      if (opts.auto && this.autoChainCount >= 1) return;
    }

    if (this.activeDriver) {
      if (!this.queue.includes(tourId)) this.queue.push(tourId);
      return;
    }

    if (opts.auto) this.autoChainCount += 1;

    // Navigate to the correct screen first, then wait for the first target.
    if (this.navigate && typeof window !== 'undefined' && window.location.pathname !== tour.route) {
      this.navigate(tour.route);
      await this.wait(250);
    }

    const steps = await this.buildSteps(tour);
    if (steps.length === 0) {
      // Nothing to show — treat as seen so we don't retry every visit.
      await markTourSeen(tourId);
      return;
    }

    this.activeTourId = tourId;
    let dismissForever = false;

    const drv = driver({
      showProgress: steps.length > 1,
      allowClose: true,
      overlayOpacity: 0.55,
      stagePadding: 6,
      stageRadius: 10,
      smoothScroll: true,
      popoverClass: 'flowist-tour-popover',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Got it',
      progressText: '{{current}} of {{total}}',
      steps,
      onDestroyed: async () => {
        this.activeDriver = null;
        const finishedId = this.activeTourId;
        this.activeTourId = null;
        if (finishedId) {
          if (dismissForever) await dismissTourForever(finishedId);
          else await markTourSeen(finishedId);
        }
        this.drainQueue();
      },
    });

    // Inject a "Don't show tips like this again" link into the popover.
    // driver.js re-renders the popover per step, so re-inject on highlight.
    const injectDismissLink = () => {
      const pop = document.querySelector('.driver-popover');
      if (!pop || pop.querySelector('.flowist-tour-dismiss')) return;
      const footer = pop.querySelector('.driver-popover-footer');
      if (!footer) return;
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'flowist-tour-dismiss';
      link.textContent = "Don't show tips like this again";
      link.addEventListener('click', () => {
        dismissForever = true;
        try { drv.destroy(); } catch {}
      });
      footer.prepend(link);
    };

    // Patch each step's onHighlighted to inject our extra link (and preserve any prior handler).
    for (const step of steps) {
      const prev = step.onHighlighted;
      step.onHighlighted = (el, s, opts2) => {
        try { prev?.(el, s, opts2); } catch {}
        setTimeout(injectDismissLink, 0);
      };
    }

    this.activeDriver = drv;
    try {
      drv.drive();
    } catch {
      this.activeDriver = null;
      this.activeTourId = null;
      this.drainQueue();
    }
  }

  /** Queue a tour to run after the current one finishes (or immediately if idle). */
  queueTour(tourId: string) {
    if (!this.activeDriver) {
      this.startTour(tourId, { auto: true });
      return;
    }
    if (!this.queue.includes(tourId)) this.queue.push(tourId);
  }

  private drainQueue() {
    const next = this.queue.shift();
    if (next) {
      // Small delay so DOM settles between tours.
      setTimeout(() => this.startTour(next, { auto: true }), 200);
    }
  }

  private async buildSteps(tour: FeatureTour): Promise<DriveStep[]> {
    const built: DriveStep[] = [];
    for (const step of tour.steps) {
      const el = await this.waitForSelector(step.elementSelector, step.optional ? 400 : 1500);
      if (!el) {
        if (step.optional) continue;
        // Required target missing — bail out gracefully.
        return [];
      }
      built.push(this.toDriverStep(step));
    }
    return built;
  }

  private toDriverStep(step: FeatureTourStep): DriveStep {
    return {
      element: step.elementSelector,
      popover: {
        title: step.title,
        description: step.description,
        side: step.side ?? 'bottom',
        align: 'center',
      },
    };
  }

  private waitForSelector(selector: string, timeoutMs: number): Promise<Element | null> {
    return new Promise((resolve) => {
      const found = document.querySelector(selector);
      if (found) return resolve(found);
      const started = Date.now();
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        } else if (Date.now() - started > timeoutMs) {
          observer.disconnect();
          resolve(null);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      // Absolute timeout in case DOM never changes.
      setTimeout(() => {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }, timeoutMs);
    });
  }

  private wait(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}

export const TourManager = new TourManagerImpl();
