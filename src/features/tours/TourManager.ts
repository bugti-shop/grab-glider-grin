// Singleton coach-mark orchestrator built on driver.js.
// - Only one tour can be active at a time; extra requests queue.
// - Auto-navigates to the tour's `route`, waits for the first selector to mount,
//   then drives step-by-step with Flowist-branded popovers.
// - Skip / Next / "Don't show again" all persist via TourStateStore.

import { driver, type Driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

import { getTour, type FeatureTour, type FeatureTourStep } from './tourRegistry';
import {
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

    // Optional pre-action: click a trigger (e.g. open a dropdown menu) so the
    // real target becomes visible before we highlight it.
    if (tour.beforeStart) {
      const trigger = await this.waitForSelector(tour.beforeStart, 1500);
      if (trigger instanceof HTMLElement) {
        try { trigger.click(); } catch {}
        await this.wait(200);
      }
    }

    const steps = await this.buildSteps(tour);
    if (steps.length === 0) {
      // Nothing to show — treat as seen so we don't retry every visit.
      await markTourSeen(tourId);
      return;
    }

    this.activeTourId = tourId;

    const drv = driver({
      showProgress: steps.length > 1,
      allowClose: true,
      overlayOpacity: 0.55,
      stagePadding: 6,
      stageRadius: 10,
      smoothScroll: true,
      popoverClass: 'flowist-tour-popover',
      // Hide the Back button per user preference — only Next + Close.
      showButtons: ['next', 'close'],
      nextBtnText: 'Next',
      doneBtnText: 'Got it',
      progressText: '{{current}} of {{total}}',
      steps,
      onDestroyed: async () => {
        this.activeDriver = null;
        const finishedId = this.activeTourId;
        this.activeTourId = null;
        if (finishedId) await markTourSeen(finishedId);
        this.drainQueue();
      },
    });

    this.activeDriver = drv;
    // Track which step index we're on so click handler can advance reliably.
    let currentIndex = 0;
    try {
      drv.drive();
      // Click handler: advance for interactive steps, dismiss for the rest,
      // so tour UI never lingers over a sheet the user just opened.
      const onTargetClick = (ev: MouseEvent) => {
        if (!this.activeDriver) return;
        const target = ev.target as Element | null;
        if (!target) return;
        if (target.closest('.driver-popover')) return;

        const idx = currentIndex;
        const currentStep = tour.steps[idx];
        if (!currentStep) return;
        const sel = currentStep.elementSelector;
        if (!sel || !target.closest(sel)) return;

        if (currentStep.interactive && idx < tour.steps.length - 1) {
          const nextStep = tour.steps[idx + 1];
          const nextSel = nextStep.elementSelector;
          // Hide the current popover immediately so it doesn't linger
          // over the sheet/menu the user just opened.
          const popEl = document.querySelector('.driver-popover') as HTMLElement | null;
          if (popEl) popEl.style.visibility = 'hidden';
          // Poll for the next target and re-highlight as soon as it exists,
          // without waiting for driver.js's internal transition timers.
          this.waitForSelector(nextSel, 4000).then((el) => {
            if (!this.activeDriver) return;
            if (!el) {
              try { drv.destroy(); } catch {}
              return;
            }
            currentIndex = idx + 1;
            try {
              drv.highlight({
                element: nextSel,
                popover: {
                  title: nextStep.title,
                  description: nextStep.description,
                  side: nextStep.side ?? 'bottom',
                  align: 'center',
                  showButtons: ['next', 'close'],
                  nextBtnText: idx + 1 === tour.steps.length - 1 ? 'Got it' : 'Next',
                },
              });
            } catch {
              try { drv.destroy(); } catch {}
            }
          });
        } else {
          try { drv.destroy(); } catch {}
        }
      };
      window.addEventListener('click', onTargetClick, true);
      const cleanup = () => window.removeEventListener('click', onTargetClick, true);
      const check = setInterval(() => {
        if (!this.activeDriver) { cleanup(); clearInterval(check); }
      }, 500);
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
