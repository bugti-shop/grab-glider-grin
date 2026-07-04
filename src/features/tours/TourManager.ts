// Singleton coach-mark orchestrator built on driver.js.
// - Only one tour can be active at a time; extra requests queue.
// - Auto-navigates to the tour's `route`, waits for the first selector to mount,
//   then drives step-by-step with Flowist-branded popovers.
// - Skip / Next / "Don't show again" all persist via TourStateStore.

import { driver, type Driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

import { getTour, nextOnboardingTourId, type FeatureTour, type FeatureTourStep } from './tourRegistry';
import {
  hasSeenTour,
  isDismissedForever,
  markTourSeen,
} from './TourStateStore';
import { emitTourActiveChange } from './useIsTourActive';


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
  async startTour(tourId: string, opts: { force?: boolean; auto?: boolean; chain?: boolean } = {}) {
    const tour = getTour(tourId);
    if (!tour) return;

    if (!opts.force) {
      if (await isDismissedForever(tourId)) return;
      if ((opts.auto || opts.chain) && (await hasSeenTour(tourId))) return;
      // Chain runs are exempt from the auto-chain cap — the entire onboarding
      // sequence is intentional. Cap only unrelated auto-fires.
      if (opts.auto && !opts.chain && this.autoChainCount >= 1) return;
    }

    if (this.activeDriver) {
      if (!this.queue.includes(tourId)) this.queue.push(tourId);
      return;
    }

    if (opts.auto) this.autoChainCount += 1;

    // Chained / auto-fired tours must start from a clean slate — close any
    // sheets, dropdowns, popovers, or dialogs the previous tour left open so
    // the next feature isn't hidden behind a stale overlay.
    if (opts.chain || opts.auto) {
      this.closeTransientUi();
      await this.wait(180);
    }

    // Navigate to the correct screen first, then wait for the first target.
    if (this.navigate && typeof window !== 'undefined' && window.location.pathname !== tour.route) {
      this.navigate(tour.route);
      await this.wait(250);
    }


    // Optional pre-actions: click one or more triggers (e.g. open task detail,
    // then open its ⋮ menu) so the real target becomes visible before highlight.
    if (tour.beforeStart) {
      const preSelectors = Array.isArray(tour.beforeStart) ? tour.beforeStart : [tour.beforeStart];
      for (const sel of preSelectors) {
        if (sel.startsWith('event:')) {
          window.dispatchEvent(new CustomEvent(sel.slice('event:'.length)));
          await this.wait(420);
          continue;
        }
        const trigger = await this.waitForSelector(sel, 2000);
        if (trigger instanceof HTMLElement) {
          try { this.simulateActivation(trigger); } catch {}
          await this.wait(320);
        }
      }
    }


    const steps = await this.buildSteps(tour);
    if (steps.length === 0) {
      // Nothing to show — treat as seen so we don't retry every visit.
      await markTourSeen(tourId);
      return;
    }

    this.activeTourId = tourId;
    try { document.body.dataset.tourActive = 'true'; } catch {}
    emitTourActiveChange(true);

    // Flag lets us tear down a per-step driver without triggering the
    // "tour is over" side-effects (mark seen, drain queue).
    let suppressDestroy = false;
    let currentIndex = 0;
    let currentDrv: Driver | null = null;

    // If this tour is part of the onboarding chain, teach the popover that
    // "Next" means "advance to the next feature" rather than "done".
    const chainedNextId = nextOnboardingTourId(tourId);
    const inChain = !!chainedNextId;

    const finalize = async (opts: { advanceChain?: boolean } = {}) => {
      try { delete document.body.dataset.tourActive; } catch {}
      emitTourActiveChange(false);
      this.activeDriver = null;
      currentDrv = null;
      const finishedId = this.activeTourId;
      this.activeTourId = null;
      if (finishedId) await markTourSeen(finishedId);
      // Auto-advance the onboarding chain when a chained tour completes
      // (Next click or action-completion path). We do NOT auto-advance when
      // the user explicitly dismissed via the ✕ / overlay tap.
      if (opts.advanceChain && finishedId) {
        const nextId = nextOnboardingTourId(finishedId);
        if (nextId) {
          // Close whatever sheet/menu the previous tour opened before we
          // navigate to and highlight the next feature.
          this.closeTransientUi();
          setTimeout(() => this.startTour(nextId, { chain: true }), 400);
          return;
        }
      }
      this.drainQueue();
    };

    const buildDriver = (stepIndex: number): Driver => {
      const step = tour.steps[stepIndex];
      const isLast = stepIndex === tour.steps.length - 1;
      // Popover button label: use "Next" whenever there's more to walk the
      // user through — either more steps in this tour, or another chained
      // tour queued up after it. "Got it" only appears at the very end.
      const nextLabel = !isLast || inChain ? 'Next' : 'Got it';
      return driver({
        allowClose: true,
        overlayOpacity: 0.55,
        stagePadding: 6,
        stageRadius: 10,
        smoothScroll: true,
        popoverClass: 'flowist-tour-popover',
        showButtons: ['next', 'close'],
        nextBtnText: nextLabel,
        doneBtnText: nextLabel,
        steps: [this.toDriverStep(step)],
        onNextClick: isLast
          ? () => {
              // Last step: mark done + advance onboarding chain if applicable.
              suppressDestroy = true;
              try { currentDrv?.destroy(); } catch {}
              this.activeDriver = null;
              void finalize({ advanceChain: inChain });
            }
          : undefined,
        onDestroyed: async () => {
          if (suppressDestroy) {
            suppressDestroy = false;
            return;
          }
          await finalize();
        },
      });
    };

    const runStep = (stepIndex: number) => {
      currentIndex = stepIndex;
      const drv = buildDriver(stepIndex);
      currentDrv = drv;
      this.activeDriver = drv;
      try {
        drv.drive();
      } catch {
        finalize();
      }
    };

    runStep(0);

    // Global click handler: interactive step → advance to next by tearing
    // down the current per-step driver and mounting a fresh one on the new
    // target. Non-interactive step → dismiss so tour UI doesn't linger.
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
        // Immediately kill the current popover so it doesn't cover the
        // sheet/menu the user just opened. Suppress the destroy side-effect
        // so the tour isn't marked as finished mid-flow.
        suppressDestroy = true;
        try { currentDrv?.destroy(); } catch {}
        this.activeDriver = null;

        this.waitForSelector(nextStep.elementSelector, 4000).then((el) => {
          if (!el) {
            // Target never appeared — end the tour gracefully.
            finalize();
            return;
          }
          runStep(idx + 1);
        });
      } else {
        try { currentDrv?.destroy(); } catch {}
      }
    };
    window.addEventListener('click', onTargetClick, true);
    const cleanup = () => window.removeEventListener('click', onTargetClick, true);
    const check = setInterval(() => {
      if (!this.activeDriver) { cleanup(); clearInterval(check); }
    }, 500);
  }



  /** Queue a tour to run after the current one finishes (or immediately if idle). */
  queueTour(tourId: string) {
    if (!this.activeDriver) {
      this.startTour(tourId, { auto: true });
      return;
    }
    if (!this.queue.includes(tourId)) this.queue.push(tourId);
  }

  /**
   * Advance the onboarding chain because the user just completed the action
   * for `completedTourId` (e.g. added their first task). If that tour is
   * currently visible, tear down its popover; then start the next chained
   * tour with a small delay so the UI can settle first.
   */
  async advanceOnboardingChain(completedTourId: string) {
    // Mark the completed tour as seen — even if it wasn't the active one, the
    // user just performed the underlying action so they've clearly learned it.
    try { await markTourSeen(completedTourId); } catch {}

    // If a popover is currently pointing at this tour's target, kill it so
    // the newly-created task/note/etc. isn't hidden behind the coach-mark.
    if (this.activeDriver && this.activeTourId === completedTourId) {
      try { this.activeDriver.destroy(); } catch {}
      this.activeDriver = null;
      this.activeTourId = null;
      try { delete document.body.dataset.tourActive; } catch {}
      emitTourActiveChange(false);
    }

    const nextId = nextOnboardingTourId(completedTourId);
    if (!nextId) return;
    // Give the just-completed action's UI a moment to render (e.g. task row
    // appears in the list) before highlighting the next feature.
    setTimeout(() => this.startTour(nextId, { chain: true }), 700);
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

  /**
   * Radix triggers (DropdownMenu, Popover) open on pointerdown, not click.
   * A bare `.click()` won't open them, so dispatch a full pointer sequence.
   */
  private simulateActivation(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const opts: PointerEventInit = {
      bubbles: true, cancelable: true, composed: true,
      pointerType: 'mouse', isPrimary: true, button: 0, clientX: x, clientY: y,
    };
    try { el.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch {}
    try { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y })); } catch {}
    try { el.dispatchEvent(new PointerEvent('pointerup', opts)); } catch {}
    try { el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y })); } catch {}
    try { el.click(); } catch {}
  }


  /**
   * Close any Radix / app overlays a previous tour may have left mounted
   * (Sheet, Dialog, DropdownMenu, Popover, Drawer, command menu, etc.) so the
   * next chained tour begins on a clean screen.
   *
   * Strategy:
   *   1. Dispatch Escape at document — Radix primitives all listen for it and
   *      call their onOpenChange(false), which cleanly unmounts state.
   *   2. Fire a custom event any app-level sheet can subscribe to as a
   *      belt-and-braces close signal.
   *   3. Repeat a couple of times to catch nested overlays (dropdown inside a
   *      sheet inside a dialog).
   */
  private closeTransientUi() {
    if (typeof window === 'undefined') return;
    const fireEscape = () => {
      const opts: KeyboardEventInit = {
        key: 'Escape', code: 'Escape', keyCode: 27, which: 27,
        bubbles: true, cancelable: true, composed: true,
      };
      try { document.body.dispatchEvent(new KeyboardEvent('keydown', opts)); } catch {}
      try { document.body.dispatchEvent(new KeyboardEvent('keyup', opts)); } catch {}
    };
    // Nested overlays: Radix closes one layer per Escape, so pulse a few times.
    fireEscape();
    setTimeout(fireEscape, 60);
    setTimeout(fireEscape, 140);
    try {
      window.dispatchEvent(new CustomEvent('flowist-tour:close-overlays'));
    } catch {}
  }
}

export const TourManager = new TourManagerImpl();
