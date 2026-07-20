// Singleton coach-mark orchestrator built on driver.js.
// - Only one tour can be active at a time; extra requests queue.
// - Auto-navigates to the tour's `route`, waits for the first selector to mount,
//   then drives step-by-step with Flowist-branded popovers.
// - Skip / Next / "Don't show again" all persist via TourStateStore.

import { driver, type Driver, type DriveStep, type Config as DriverConfig } from 'driver.js';
import 'driver.js/dist/driver.css';

/**
 * GLOBAL DRIVER.JS SINGLETON MUTEX
 * --------------------------------
 * driver.js mounts its overlay/popover directly to <body>. If two instances
 * are alive at the same time — even briefly — their overlays stack, event
 * handlers double-fire, and on low-memory Android WebViews the second mount
 * OOM-crashes the app (root cause of the first-install crash reported on
 * Android). This module-level mutex guarantees that only ONE driver.js
 * instance can exist in the DOM at any time, across every tour, tooltip,
 * and code path that touches driver.js.
 *
 * Every driver() call in this file MUST go through `mountSingletonDriver()`.
 * Do not import `driver` from 'driver.js' anywhere else in the app; route
 * through TourManager so this invariant holds.
 */
let __activeDriverInstance: Driver | null = null;

function sweepStaleDriverDom() {
  if (typeof document === 'undefined') return;
  try {
    document.querySelectorAll('.driver-popover, .driver-overlay, .driver-active-element')
      .forEach((n) => { try { n.remove(); } catch {} });
    document.body.classList.remove('driver-active', 'driver-fade');
  } catch {}
}

function mountSingletonDriver(config: DriverConfig): Driver {
  // Tear down any previously-live instance BEFORE constructing a new one.
  if (__activeDriverInstance) {
    try { __activeDriverInstance.destroy(); } catch {}
    __activeDriverInstance = null;
  }
  // Belt-and-braces: kill any orphaned DOM from a prior instance whose
  // destroy() was never called (e.g. route unmounted the host component).
  sweepStaleDriverDom();

  const userOnDestroyed = config.onDestroyed;
  const wrapped: DriverConfig = {
    ...config,
    onDestroyed: async (element, step, options) => {
      // Clear the singleton ref FIRST so any onDestroyed side-effects
      // (which may synchronously start a new tour) can mount freely.
      if (__activeDriverInstance === instance) __activeDriverInstance = null;
      if (userOnDestroyed) {
        try { await userOnDestroyed(element, step, options); } catch {}
      }
      // Final sweep for any DOM the destroy call may have missed.
      sweepStaleDriverDom();
    },
  };
  const instance = driver(wrapped);
  __activeDriverInstance = instance;
  return instance;
}

export function __getActiveDriverInstance(): Driver | null {
  return __activeDriverInstance;
}


import { getTour, nextOnboardingTourId, previousOnboardingTourId, type FeatureTour, type FeatureTourStep } from './tourRegistry';
import {
  hasSeenTour,
  isDismissedForever,
  markTourSeen,
  resetTour,
} from './TourStateStore';
import { emitTourActiveChange } from './useIsTourActive';


type NavigateFn = (path: string) => void;

const ROUTE_SETTLE_DELAY_MS = 80;
const BETWEEN_CHAIN_TOURS_DELAY_MS = 160;
const ACTION_CHAIN_DELAY_MS = 220;
const QUEUE_DRAIN_DELAY_MS = 100;
const PRE_ACTION_SETTLE_DELAY_MS = 180;
const TOUR_TARGET_WAIT_MS = 10 * 60 * 1000;

class TourManagerImpl {
  private navigate: NavigateFn | null = null;
  private activeDriver: Driver | null = null;
  private activeTourId: string | null = null;
  private queue: string[] = [];
  private autoChainCount = 0;
  private forcedActive = false;
  private forcedGuard: ReturnType<typeof setInterval> | null = null;
  private remountCurrentStep: (() => void) | null = null;
  private activeRoute: string | null = null;
  // Re-entrancy guard: prevents concurrent startTour() calls from stacking
  // multiple driver.js instances on top of each other (root cause of the
  // Android WebView crash on first install — chain advance + watchdog +
  // pointer/keydown activity watchdog all raced to mount tours).
  private starting = false;
  private chainScheduled = false;

  /** Called once by <TourProvider/> so we can navigate before starting a tour. */
  setNavigate(fn: NavigateFn) {
    this.navigate = fn;
  }


  isActive() {
    return !!this.activeDriver;
  }

  isForced() {
    return this.forcedActive;
  }

  /** True while a chained tour has been scheduled but not yet mounted. */
  isChainScheduled() {
    return this.chainScheduled || this.starting;
  }



  activeId() {
    return this.activeTourId;
  }


  /** Start a tour immediately (or queue it if another one is running). */
  async startTour(tourId: string, opts: { force?: boolean; auto?: boolean; chain?: boolean; forced?: boolean } = {}) {
    const tour = getTour(tourId);
    if (!tour) return;

    // Re-entrancy guard — see field comment. If another startTour is already
    // in-flight, queue this request (unless force) and bail so we don't
    // mount a second driver on top of the first.
    if (this.starting) {
      if (!opts.force && !this.queue.includes(tourId)) this.queue.push(tourId);
      return;
    }
    this.starting = true;
    this.chainScheduled = false;
    try {
      return await this._startTourInner(tourId, tour, opts);
    } finally {
      this.starting = false;
    }
  }

  private async _startTourInner(tourId: string, tour: FeatureTour, opts: { force?: boolean; auto?: boolean; chain?: boolean; forced?: boolean }) {
    // Tooltip tutorials are enabled on both web and native. Auto/chain/forced
    // runs proceed everywhere unless the caller explicitly opts out.



    // A previous driver instance can occasionally remain referenced after its
    // DOM has already been removed. That made every later tutorial request sit
    // in the queue forever. Clear that stale state before deciding to queue.
    if (this.activeDriver && typeof document !== 'undefined') {
      const driverStillMounted = !!document.querySelector('.driver-popover, .driver-overlay');
      if (!driverStillMounted) this.clearActiveTourState();
    }

    if (!opts.force) {
      if (await isDismissedForever(tourId)) return;
      if ((opts.auto || opts.chain) && (await hasSeenTour(tourId))) return;
      // Chain runs are exempt from the auto-chain cap — the entire onboarding
      // sequence is intentional. Cap only unrelated auto-fires.
      if (opts.auto && !opts.chain && this.autoChainCount >= 1) return;
    }

    if (this.activeDriver) {
      if (opts.force) {
        try { this.activeDriver.destroy(); } catch {}
        this.clearActiveTourState();
      } else {
        if (!this.queue.includes(tourId)) this.queue.push(tourId);
        return;
      }
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
      await this.closeTransientUi();
      await this.wait(80);
    }

    // Navigate to the correct screen first, then wait for the first target.
    if (this.navigate && typeof window !== 'undefined' && window.location.pathname !== tour.route) {
      this.navigate(tour.route);
      await this.wait(ROUTE_SETTLE_DELAY_MS);
    }


    // Optional pre-actions: click one or more triggers (e.g. open task detail,
    // then open its ⋮ menu) so the real target becomes visible before highlight.
    const firstTargetSelector = tour.steps[0]?.elementSelector;
    const firstTargetAlreadyVisible = firstTargetSelector
      ? !!this.getVisibleElement(firstTargetSelector)
      : false;
    if (tour.beforeStart && !firstTargetAlreadyVisible) {
      const preSelectors = Array.isArray(tour.beforeStart) ? tour.beforeStart : [tour.beforeStart];
      for (const sel of preSelectors) {
        if (sel.startsWith('event:')) {
          window.dispatchEvent(new CustomEvent(sel.slice('event:'.length)));
          await this.wait(PRE_ACTION_SETTLE_DELAY_MS);
          continue;
        }
        const trigger = await this.waitForSelector(sel, TOUR_TARGET_WAIT_MS);
        if (trigger instanceof HTMLElement) {
          try { this.simulateActivation(trigger); } catch {}
          await this.wait(PRE_ACTION_SETTLE_DELAY_MS);
        }
      }
    }


    const steps = await this.buildSteps(tour);
    if (steps.length === 0) {
      // Target still did not appear; do not mark as seen so the tutorial can retry.
      return;
    }

    this.activeTourId = tourId;
    this.activeRoute = tour.route;
    this.forcedActive = !!opts.forced;
    try { document.body.dataset.tourActive = 'true'; } catch {}
    try { document.body.dataset.tourId = tourId; } catch {}
    try {
      if (this.forcedActive) document.body.dataset.tourForced = 'true';
      else delete document.body.dataset.tourForced;
    } catch {}
    emitTourActiveChange(true);

    // Flag lets us tear down a per-step driver without triggering the
    // "tour is over" side-effects (mark seen, drain queue).
    let suppressDestroy = false;
    let currentIndex = 0;
    let currentDrv: Driver | null = null;
    let disposeStepA11y: (() => void) | null = null;
    const forced = this.forcedActive;

    // If this tour is part of the onboarding chain, teach the popover that
    // "Next" means "advance to the next feature" rather than "done".
    const chainedNextId = nextOnboardingTourId(tourId);
    const inChain = !!chainedNextId;

    const finalize = async (opts: { advanceChain?: boolean } = {}) => {
      try { disposeStepA11y?.(); disposeStepA11y = null; } catch {}
      try { delete document.body.dataset.tourActive; } catch {}
      try { delete document.body.dataset.tourId; } catch {}
      try { delete document.body.dataset.tourForced; } catch {}
      emitTourActiveChange(false);
      this.activeDriver = null;
      currentDrv = null;
      this.remountCurrentStep = null;
      this.activeRoute = null;
      this.forcedActive = false;
      if (this.forcedGuard) { clearInterval(this.forcedGuard); this.forcedGuard = null; }
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
          // navigate to and highlight the next feature. Set chainScheduled
          // so the activity watchdog can't race and start a duplicate.
          this.chainScheduled = true;
          await this.closeTransientUi();
          setTimeout(() => {
            this.chainScheduled = false;
            this.startTour(nextId, { chain: true, forced });
          }, BETWEEN_CHAIN_TOURS_DELAY_MS);
          return;
        }
      }
      this.drainQueue();
    };

    const buildDriver = (stepIndex: number): Driver => {
      const step = tour.steps[stepIndex];
      const isLast = stepIndex === tour.steps.length - 1;
      const isFirst = stepIndex === 0;
      const prevChainId = previousOnboardingTourId(tourId);
      // Show a Back button whenever we can go somewhere: previous step OR
      // (at first step in a chained tour) the previous chained tour.
      const canGoBack = !isFirst || (inChain && !!prevChainId);
      // Popover button label: use "Next" whenever there's more to walk the
      // user through — either more steps in this tour, or another chained
      // tour queued up after it. "Got it" only appears at the very end.
      const nextLabel = !isLast || inChain ? 'Next' : 'Got it';
      const buttons: Array<'previous' | 'next' | 'close'> = [];
      if (canGoBack) buttons.push('previous');
      buttons.push('next');
      if (!forced) buttons.push('close');
      return mountSingletonDriver({
        // Forced tours cannot be dismissed by ✕ or overlay tap — user must
        // walk through every step.
        allowClose: !forced,
        // Block clicks on the highlighted target too — during the mini sheet
        // only the "Next" button should be interactive. Prevents the user
        // from firing Create Note / Create Task / Create Notebook / etc.
        // by tapping the pulsing element behind the popover.
        disableActiveInteraction: true,
        overlayOpacity: 0.55,
        stagePadding: 6,
        stageRadius: 10,
        smoothScroll: true,
        popoverClass: forced ? 'flowist-tour-popover flowist-tour-forced' : 'flowist-tour-popover',
        showButtons: buttons,
        nextBtnText: nextLabel,
        doneBtnText: nextLabel,
        prevBtnText: 'Back',
        steps: [this.toDriverStep(step)],
        onPrevClick: canGoBack
          ? () => {
              if (!isFirst) {
                // Multi-step tour: go one step back.
                suppressDestroy = true;
                try { currentDrv?.destroy(); } catch {}
                this.activeDriver = null;
                void runStep(stepIndex - 1);
                return;
              }
              // First step: jump back to the previous tour in the onboarding
              // chain. Reset its "seen" flag so startTour() actually re-runs
              // it (chain-mode skips already-seen tours).
              const backId = prevChainId!;
              suppressDestroy = true;
              try { currentDrv?.destroy(); } catch {}
              this.activeDriver = null;
              this.activeTourId = null;
              try { delete document.body.dataset.tourActive; } catch {}
              try { delete document.body.dataset.tourId; } catch {}
              try { delete document.body.dataset.tourForced; } catch {}
              if (this.forcedGuard) { clearInterval(this.forcedGuard); this.forcedGuard = null; }
              this.forcedActive = false;
              emitTourActiveChange(false);
              (async () => {
                try { await resetTour(backId); } catch {}
                await this.closeTransientUi();
                setTimeout(() => this.startTour(backId, { chain: true, forced, force: true }), BETWEEN_CHAIN_TOURS_DELAY_MS);
              })();
            }
          : undefined,
        onNextClick: isLast
          ? () => {
              // Last step: mark done + advance onboarding chain if applicable.
              suppressDestroy = true;
              try { currentDrv?.destroy(); } catch {}
              this.activeDriver = null;
              void finalize({ advanceChain: inChain });
            }
          : () => {
              // Multi-step tour: advance to next step of the same tour.
              suppressDestroy = true;
              try { currentDrv?.destroy(); } catch {}
              this.activeDriver = null;
              void runStep(stepIndex + 1);
            },
        onDestroyed: async () => {
          if (suppressDestroy) {
            suppressDestroy = false;
            return;
          }
          // Forced tours refuse dismissal: re-mount the same step instead of
          // ending the tour.
          if (forced && this.activeTourId === tourId) {
            setTimeout(() => { void runStep(currentIndex); }, 60);
            return;
          }
          await finalize();
        },
      });
    };

    let disposeStepA11y: (() => void) | null = null;

    const runStep = async (stepIndex: number) => {
      currentIndex = stepIndex;
      const step = tour.steps[stepIndex];
      const target = step ? await this.waitForSelector(step.elementSelector, TOUR_TARGET_WAIT_MS) : null;
      if (!target) {
        void finalize();
        return;
      }
      await this.scrollElementIntoView(target, step.scrollBlock ?? 'center');
      const drv = buildDriver(stepIndex);
      currentDrv = drv;
      this.activeDriver = drv;
      try {
        drv.drive();
      } catch {
        finalize();
      }
      // Tear down the previous step's a11y wiring before installing the new one.
      try { disposeStepA11y?.(); } catch {}
      disposeStepA11y = this.enhancePopoverA11y({
        titleId: `flowist-tour-title-${tourId}-${stepIndex}`,
        descId: `flowist-tour-desc-${tourId}-${stepIndex}`,
        isFirst: stepIndex === 0,
        isLast: stepIndex === tour.steps.length - 1,
        inChain,
        forced,
        onNext: () => {
          const nextBtn = document.querySelector<HTMLElement>('.driver-popover .driver-popover-next-btn');
          nextBtn?.click();
        },
        onPrev: () => {
          const prevBtn = document.querySelector<HTMLElement>('.driver-popover .driver-popover-prev-btn');
          prevBtn?.click();
        },
        onClose: () => {
          if (forced) return;
          const closeBtn = document.querySelector<HTMLElement>('.driver-popover .driver-popover-close-btn');
          if (closeBtn) closeBtn.click();
          else { try { currentDrv?.destroy(); } catch {} }
        },
      });
    };

    this.remountCurrentStep = () => { void runStep(currentIndex); };

    // Ensure per-step a11y wiring is disposed whenever the tour ends.
    const origFinalize = finalize;
    (finalize as unknown) = async (o?: { advanceChain?: boolean }) => {
      try { disposeStepA11y?.(); disposeStepA11y = null; } catch {}
      return origFinalize(o);
    };

    void runStep(0);

    // Forced-mode watchdog: (a) if the user navigates away from the tour's
    // route, snap them back; (b) if the current step's target disappears
    // (sheet closed, section still loading), re-run the pre-actions and
    // remount the step. This is what keeps the tutorial locked on the
    // target no matter what else the user tries to do.
    if (forced) {
      if (this.forcedGuard) clearInterval(this.forcedGuard);
      this.forcedGuard = setInterval(async () => {
        if (!this.activeDriver || this.activeTourId !== tourId) return;
        // Route guard: pull the user back to the tour's screen.
        if (this.navigate && typeof window !== 'undefined' && window.location.pathname !== tour.route) {
          try { this.navigate(tour.route); } catch {}
          return;
        }
        const step = tour.steps[currentIndex];
        if (!step) return;
        const el = this.getVisibleElement(step.elementSelector);

        // Foreign-sheet interceptor: if any Radix Sheet / Dialog / Drawer /
        // DropdownMenu is open that does NOT contain the tour's target
        // element, the user has wandered off into some other UI while the
        // tutorial is still pending. Close it and force them back onto the
        // tour-required sheet.
        const foreignSheetOpen = this.hasForeignOverlayOpen(step.elementSelector);
        if (foreignSheetOpen) {
          await this.closeTransientUi();
          // Fall through so the beforeStart pulse below re-opens the
          // tour-required sheet in the same tick.
        }

        if (el && !foreignSheetOpen) return;

        // Target missing (or a foreign sheet was just closed) → re-open
        // whatever the tour needs open, then wait (up to 10 min) for the
        // selector to reappear and remount the current step.
        if (tour.beforeStart) {
          const preSelectors = Array.isArray(tour.beforeStart) ? tour.beforeStart : [tour.beforeStart];
          for (const sel of preSelectors) {
            if (sel.startsWith('event:')) {
              try { window.dispatchEvent(new CustomEvent(sel.slice('event:'.length))); } catch {}
              continue;
            }
            const trigger = this.getVisibleElement(sel);
            if (trigger instanceof HTMLElement) {
              try { this.simulateActivation(trigger); } catch {}
            }
          }
        }
        const appeared = await this.waitForSelector(step.elementSelector, TOUR_TARGET_WAIT_MS);
        if (appeared && this.activeTourId === tourId) {
          suppressDestroy = true;
          try { currentDrv?.destroy(); } catch {}
          this.activeDriver = null;
          void runStep(currentIndex);
        }
      }, 700);
    }


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

        this.waitForSelector(nextStep.elementSelector, TOUR_TARGET_WAIT_MS).then((el) => {
          if (!el) {
            // Target never appeared — end the tour gracefully.
            finalize();
            return;
          }
          void runStep(idx + 1);
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

    const wasForced = this.forcedActive && this.activeTourId === completedTourId;

    // If a popover is currently pointing at this tour's target, kill it so
    // the newly-created task/note/etc. isn't hidden behind the coach-mark.
    if (this.activeDriver && this.activeTourId === completedTourId) {
      try { this.activeDriver.destroy(); } catch {}
      this.activeDriver = null;
      this.activeTourId = null;
      this.forcedActive = false;
      if (this.forcedGuard) { clearInterval(this.forcedGuard); this.forcedGuard = null; }
      try { delete document.body.dataset.tourActive; } catch {}
      try { delete document.body.dataset.tourId; } catch {}
      try { delete document.body.dataset.tourForced; } catch {}
      emitTourActiveChange(false);
    }

    const nextId = nextOnboardingTourId(completedTourId);
    if (!nextId) return;
    // Give the just-completed action's UI a moment to render (e.g. task row
    // appears in the list) before highlighting the next feature.
    this.chainScheduled = true;
    await this.closeTransientUi();
    setTimeout(() => {
      this.chainScheduled = false;
      this.startTour(nextId, { chain: true, forced: wasForced });
    }, ACTION_CHAIN_DELAY_MS);
  }


  private drainQueue() {
    const next = this.queue.shift();
    if (next) {
      // Small delay so DOM settles between tours.
      setTimeout(() => this.startTour(next, { auto: true }), QUEUE_DRAIN_DELAY_MS);
    }
  }

  private async buildSteps(tour: FeatureTour): Promise<DriveStep[]> {
    const built: DriveStep[] = [];
    for (const step of tour.steps) {
      const el = await this.waitForSelector(step.elementSelector, TOUR_TARGET_WAIT_MS);
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
      const found = this.getVisibleElement(selector);
      if (found) return resolve(found);
      const started = Date.now();
      const observer = new MutationObserver(() => {
        const el = this.getVisibleElement(selector);
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
        resolve(this.getVisibleElement(selector));
      }, timeoutMs);
    });
  }

  /**
   * Forced-mode helper: detect whether any Radix Sheet / Dialog / Drawer /
   * DropdownMenu / Popover is currently open that does NOT contain the
   * tour's required target. If so, the user has navigated into some other
   * UI while the tutorial is still pending and we need to intercept.
   */
  private hasForeignOverlayOpen(targetSelector: string): boolean {
    if (typeof document === 'undefined') return false;
    const openWrappers = document.querySelectorAll<HTMLElement>(
      '[data-state="open"][role="dialog"], ' +
      '[data-state="open"][role="alertdialog"], ' +
      '[data-state="open"][role="menu"], ' +
      '[data-state="open"][data-radix-popper-content-wrapper], ' +
      '[data-vaul-drawer][data-state="open"]',
    );
    for (const w of Array.from(openWrappers)) {
      if (w.querySelector(targetSelector)) continue;
      if (w.closest('.driver-popover')) continue;
      return true;
    }
    return false;
  }

  private getVisibleElement(selector: string): Element | null {
    const elements = Array.from(document.querySelectorAll(selector));
    return elements.find((el) => {
      if (!(el instanceof HTMLElement)) return true;
      let node: HTMLElement | null = el;
      while (node && node !== document.body) {
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        node = node.parentElement;
      }
      const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
      if (!isJsdom) {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0 || el.getClientRects().length === 0) return false;
      }
      return true;
    }) ?? null;
  }

  private async scrollElementIntoView(el: Element, block: ScrollLogicalPosition = 'center') {
    if (!(el instanceof HTMLElement)) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const safeTop = 96;
    const safeBottom = Math.max(safeTop, viewportHeight - 140);
    const needsScroll = rect.top < safeTop || rect.bottom > safeBottom;
    if (!needsScroll) return;
    try {
      el.scrollIntoView({ behavior: 'smooth', block, inline: 'nearest' });
    } catch {
      try { el.scrollIntoView(true); } catch {}
    }
    await this.wait(260);
  }

  private wait(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private clearActiveTourState() {
    this.activeDriver = null;
    this.activeTourId = null;
    try { delete document.body.dataset.tourActive; } catch {}
    try { delete document.body.dataset.tourId; } catch {}
    emitTourActiveChange(false);
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
  private async closeTransientUi() {
    if (typeof window === 'undefined') return;

    const dispatchCloseEvents = () => {
      try { window.dispatchEvent(new CustomEvent('flowist-tour:close-overlays')); } catch {}
      try { window.dispatchEvent(new CustomEvent('flowist-tour:close-task-overlays')); } catch {}
    };

    const fireEscapeOn = (target: EventTarget | null) => {
      if (!target) return;
      const opts: KeyboardEventInit = {
        key: 'Escape', code: 'Escape', keyCode: 27, which: 27,
        bubbles: true, cancelable: true, composed: true,
      };
      try { target.dispatchEvent(new KeyboardEvent('keydown', opts)); } catch {}
      try { target.dispatchEvent(new KeyboardEvent('keyup', opts)); } catch {}
    };

    const pulse = () => {
      dispatchCloseEvents();

      // Radix DismissableLayer listens on `document`; some primitives on `window`.
      // Also fire on the active element (usually a focused button inside the sheet)
      // so the event isn't swallowed by focus trapping.
      fireEscapeOn(document);
      fireEscapeOn(window);
      fireEscapeOn(document.activeElement);

      // Belt-and-braces: physically click every visible Radix close button in any
      // currently-open sheet / dialog / drawer / popover. Radix marks the wrapper
      // with data-state="open" and the close ✕ carries a `data-radix-*` prop or
      // an aria-label of "Close".
      const openWrappers = document.querySelectorAll<HTMLElement>(
        '[data-state="open"][role="dialog"], ' +
        '[data-state="open"][role="alertdialog"], ' +
        '[data-state="open"][role="menu"], ' +
        '[data-state="open"][data-radix-popper-content-wrapper], ' +
        '[data-vaul-drawer][data-state="open"]',
      );
      openWrappers.forEach((wrapper) => {
        const closeBtn = wrapper.querySelector<HTMLElement>(
          'button[aria-label="Close"], button[aria-label="close"], ' +
          '[data-radix-collection-item][data-close], [data-close-button]',
        );
        if (closeBtn) {
          try { this.simulateActivation(closeBtn); } catch {}
        }
      });

      // Any outstanding overlay backdrop — clicking it usually closes Radix
      // primitives configured with pointer-outside dismiss.
      const overlays = document.querySelectorAll<HTMLElement>(
        '[data-radix-dialog-overlay], [data-radix-alert-dialog-overlay], [data-vaul-overlay]',
      );
      overlays.forEach((ov) => {
        try {
          const rect = ov.getBoundingClientRect();
          const evt = new MouseEvent('pointerdown', {
            bubbles: true, cancelable: true, clientX: rect.left + 4, clientY: rect.top + 4,
          });
          ov.dispatchEvent(evt);
        } catch {}
      });
    };

    // Pulse several times to peel nested overlays (menu inside sheet inside dialog).
    // Keep the pulses awaited here; if they are left as free setTimeouts they can
    // fire after `beforeStart` opens the next tutorial sheet and immediately close
    // the very UI the tour is trying to teach.
    pulse();
    await this.wait(80);
    pulse();
    await this.wait(100);
    pulse();
    await this.wait(140);
    pulse();
  }
}

export const TourManager = new TourManagerImpl();
