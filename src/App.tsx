import React, { useEffect, useState, lazy, Suspense, startTransition, useRef, useCallback } from "react";
import { LazyMotion, domAnimation } from "framer-motion";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { supabase } from "@/integrations/supabase/client";

import { SubscriptionProvider, useSubscription } from "@/contexts/SubscriptionContext";
import { NotesProvider } from "@/contexts/NotesContext";
import { GoogleAuthProvider } from "@/contexts/GoogleAuthContext";
import { useGoogleDriveSync } from "@/hooks/useGoogleDriveSync";
import { useCloudSync } from "@/hooks/useCloudSync";
const PremiumPaywall = lazy(() => import("@/components/PremiumPaywall").then(m => ({ default: m.PremiumPaywall })));
const OnboardingFlow = lazy(() => import("@/components/OnboardingFlow").then(m => ({ default: m.OnboardingFlow })));


import { NavigationLoader } from "@/components/NavigationLoader";

import { NavigationBackProvider } from "@/components/NavigationBackProvider";
import { getSetting, setSetting } from "@/utils/settingsStorage";
import { shouldAppBeLocked, updateLastUnlockTime } from "@/utils/appLockStorage";
import { useJourneyAdvancement } from "@/hooks/useJourneyAdvancement";
import { RouteSkeleton } from "@/components/skeletons/RouteSkeleton";

import { useAchievementToasts } from "@/hooks/useAchievementToasts";

import { useCertificateToasts } from "@/hooks/useCertificateToasts";
import { useSubscriptionExpiry } from "@/hooks/useSubscriptionExpiry";
const AppLockScreen = lazy(() => import("@/components/AppLockScreen").then(m => ({ default: m.AppLockScreen })));
import { useNotificationListener } from "@/hooks/useNotificationListener";
import { widgetDataSync } from "@/utils/widgetDataSync";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useShareIntent } from "@/hooks/useShareIntent";
import { PerfDiagnosticsPanel } from "@/components/PerfDiagnosticsPanel";
import { DesktopSidebar } from "@/components/desktop/DesktopSidebar";
import { WidgetAddTask, WidgetNewSticky, WidgetNewLined, WidgetNewRegular, WidgetNewSketch } from "@/pages/WidgetEntry";

const StreakMilestoneCelebration = lazy(() => import("@/components/StreakMilestoneCelebration").then(m => ({ default: m.StreakMilestoneCelebration })));
const StreakTierCelebration = lazy(() => import("@/components/StreakTierCelebration").then(m => ({ default: m.StreakTierCelebration })));
const SmartReviewPrompt = lazy(() => import("@/components/SmartReviewPrompt").then(m => ({ default: m.SmartReviewPrompt })));

const ComboOverlay = lazy(() => import("@/components/ComboOverlay").then(m => ({ default: m.ComboOverlay })));
const EncouragementOverlay = lazy(() => import("@/components/EncouragementOverlay").then(m => ({ default: m.EncouragementOverlay })));
const UrgentReminderOverlay = lazy(() => import("@/components/UrgentReminderOverlay").then(m => ({ default: m.UrgentReminderOverlay })));
const SyncConflictSheet = lazy(() => import("@/components/SyncConflictSheet").then(m => ({ default: m.SyncConflictSheet })));
const SyncProgressSheet = lazy(() => import("@/components/SyncProgressSheet").then(m => ({ default: m.SyncProgressSheet })));
const preloadTodayPage = () => import("./pages/todo/Today");
const preloadNotesDashboardPage = () => import("./pages/Index");
const Today = lazy(preloadTodayPage);

const Index = lazy(preloadNotesDashboardPage);
void preloadTodayPage();

// Lazy load everything else - they load in background after first paint
const Notes = lazy(() => import("./pages/Notes"));
const NotesCalendar = lazy(() => import("./pages/NotesCalendar"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const SyncDiagnostics = lazy(() => import("./pages/SyncDiagnostics"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsAndConditions = lazy(() => import("./pages/TermsAndConditions"));
const Progress = lazy(() => import("./pages/todo/Progress"));
const JourneyHistory = lazy(() => import("./pages/todo/JourneyHistory"));
const JourneyBadges = lazy(() => import("./pages/todo/JourneyBadges"));
const TodoCalendar = lazy(() => import("./pages/todo/TodoCalendar"));
const TodoSettings = lazy(() => import("./pages/todo/TodoSettings"));
const Habits = lazy(() => import("./pages/todo/Habits"));
const EisenhowerMatrix = lazy(() => import("./pages/todo/EisenhowerMatrix"));
const Countdown = lazy(() => import("./pages/todo/Countdown"));
const CountdownDetail = lazy(() => import("./pages/todo/CountdownDetail"));

const HabitNew = lazy(() => import("./pages/todo/HabitNew"));
const HabitDetail = lazy(() => import("./pages/todo/HabitDetail"));
const HabitSections = lazy(() => import("./pages/todo/HabitSections"));
const HabitGallery = lazy(() => import("./pages/todo/HabitGallery"));
const WebClipper = lazy(() => import("./pages/WebClipper"));
const Reminders = lazy(() => import("./pages/Reminders"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AdminOnboarding = lazy(() => import("./pages/AdminOnboarding"));
const Landing = lazy(() => import("./pages/Landing"));
const PremiumUnlock = lazy(() => import("./pages/PremiumUnlock"));


const queryClient = new QueryClient();

// IMPORTANT: Only decide the initial dashboard once per app session.
// This prevents slow async IndexedDB reads every time the user taps "Home".
let hasResolvedInitialDashboard = false;

// Minimal fallback — keeps layout stable during chunk load
const EmptyFallback = () => null;

// Branded fallback — silent (no spinner), but never leaves a blank white root.
const BrandedFallback = () => <div className="min-h-screen bg-background" aria-hidden="true" />;
// Detect stale chunk errors and auto-reload once
const isChunkError = (error: any): boolean => {
  const msg = String(error?.message || error || '');
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk')
  );
};

const handleChunkError = () => {
  const key = 'chunk_reload_ts';
  const last = Number(sessionStorage.getItem(key) || 0);
  // Only auto-reload once per 30 seconds to avoid infinite loops
  if (Date.now() - last > 30_000) {
    sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
    return true;
  }
  return false;
};

// Global error handler for unhandled errors (prevents white screen on mobile)
if (typeof window !== 'undefined') {
  // Show user-friendly toast for unhandled errors instead of silent crashes
  const showGlobalError = async (error: any) => {
    try {
      const { showErrorToast } = await import('@/lib/errorHandling');
      showErrorToast(error, { title: '⚠️ Error', log: false });
    } catch {
      // Fallback if errorHandling module fails
      console.error('Unhandled error:', error);
    }
  };

  window.onerror = (message, source, lineno, colno, error) => {
    if (isChunkError(error || message)) {
      if (handleChunkError()) return true;
    }
    console.error('Global error:', { message, source, lineno, colno, error });
    showGlobalError(error || message);
    return false;
  };
  
  window.onunhandledrejection = (event) => {
    // Auto-reload on stale chunk imports
    if (isChunkError(event?.reason)) {
      event.preventDefault();
      if (handleChunkError()) return;
    }
    // Suppress "not implemented" errors from Capacitor plugins (web + android + ios)
    const msg = String(event?.reason?.message || event?.reason || '');
    if (msg.includes('not implemented') || msg.includes('UNIMPLEMENTED') || msg.includes('not available')) {
      event.preventDefault();
      return;
    }
    console.error('Unhandled promise rejection:', event.reason);
    showGlobalError(event.reason);
  };
}

// Component to track and save last visited dashboard
const DashboardTracker = () => {
  const location = useLocation();
  
  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/todo') || path === '/') {
      setSetting('lastDashboard', 'todo');
    } else if (path === '/notesdashboard' || path === '/calendar' || path === '/settings') {
      setSetting('lastDashboard', 'notes');
    }
  }, [location.pathname]);
  
  return null;
};

// Listen for tour navigation events and navigate accordingly
const TourNavigationListener = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    const handleTourNavigate = (e: CustomEvent<{ path: string }>) => {
      navigate(e.detail.path);
    };
    window.addEventListener('tourNavigate', handleTourNavigate as EventListener);
    return () => window.removeEventListener('tourNavigate', handleTourNavigate as EventListener);
  }, [navigate]);
  
  return null;
};


// Intercept clicks/taps on @mention chips inside any editor and SPA-navigate.
// Works for both legacy <a class="rt-mention" href="..."> and the new
// <span class="rt-mention" data-mention-href="..."> (native-safe — no <a> means
// Capacitor/iOS/Android WebViews won't try to open it externally).
const MentionClickListener = () => {
  const navigate = useNavigate();
  useEffect(() => {
    let lastNav = 0;
    let pendingPointer: { id: number; x: number; y: number; target: HTMLElement } | null = null;
    let pendingTouch: { x: number; y: number; target: HTMLElement } | null = null;
    const getMentionTarget = (eventTarget: EventTarget | null) => {
      const node = eventTarget instanceof Node ? eventTarget : null;
      const targetElement = node instanceof Element ? node : node?.parentElement;
      return targetElement?.closest?.('.rt-mention, .note-link') as HTMLElement | null;
    };
    const openMention = (e: Event, target: HTMLElement) => {
      const rawHref =
        target.getAttribute('data-mention-path') ||
        target.getAttribute('data-mention-href') ||
        target.getAttribute('href') ||
        '';
      let hrefUrl: URL | null = null;
      try {
        hrefUrl = rawHref ? new URL(rawHref, window.location.origin) : null;
      } catch {
        hrefUrl = null;
      }
      const rawPath = `${hrefUrl?.pathname || ''}?${hrefUrl?.search || ''}`;
      const inferredType =
        hrefUrl?.searchParams.get('openTask') || rawPath.includes('/todo/') ? 'task' :
          hrefUrl?.searchParams.get('openNote') || rawPath.includes('/notes') ? 'note' : '';
      const legacyNoteId = target.getAttribute('data-note-id') || '';
      const legacyTaskId = target.getAttribute('data-task-id') || '';
      const rawType = legacyTaskId ? 'task' : legacyNoteId ? 'note' : target.getAttribute('data-mention-type') || target.getAttribute('data-type') || inferredType;
      const type = rawType === 'note' || rawType === 'task' ? rawType : '';
      const mentionId =
        target.getAttribute('data-mention-id') ||
        target.getAttribute('data-id') ||
        legacyTaskId ||
        legacyNoteId ||
        hrefUrl?.searchParams.get('openTask') ||
        hrefUrl?.searchParams.get('openNote') ||
        '';
      if (!type || !mentionId) return;
      e.preventDefault?.();
      e.stopPropagation?.();
      (e as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
      // De-dupe pointerdown + click firing back-to-back on the same chip.
      const now = Date.now();
      if (now - lastNav < 400) return;
      lastNav = now;
      const targetPath = type === 'note' ? '/notesdashboard' : '/todo/today';
      const queryKey = type === 'note' ? 'openNote' : 'openTask';
      const targetHref = `${targetPath}?${queryKey}=${encodeURIComponent(mentionId)}`;
      const detail = { type, id: mentionId, href: targetHref };
      try {
        sessionStorage.setItem('lovable:pendingMention', JSON.stringify({ type, id: mentionId, href: targetHref, ts: now }));
      } catch {}
      // Emit now for already-mounted target pages, then navigate with an internal
      // query param so cross-page mentions open after the lazy route mounts too.
      window.dispatchEvent(new CustomEvent('lovable:openMention', { detail }));
      navigate(targetHref, { replace: false, state: { mentionOpen: detail } });
      window.setTimeout(() => {
        if (window.location.pathname !== targetPath) {
          window.location.assign(targetHref);
        }
      }, 300);
      [80, 250, 700].forEach((delay) => {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('lovable:openMention', { detail }));
        }, delay);
      });
    };
    const handler = (e: Event) => {
      const target = getMentionTarget(e.target);
      if (target) openMention(e, target);
    };
    const pointerDownHandler = (e: PointerEvent) => {
      const target = getMentionTarget(e.target);
      if (!target) return;
      if (e.pointerType === 'mouse') {
        openMention(e, target);
        return;
      }
      pendingPointer = { id: e.pointerId, x: e.clientX, y: e.clientY, target };
    };
    const pointerUpHandler = (e: PointerEvent) => {
      const pending = pendingPointer;
      pendingPointer = null;
      if (!pending || pending.id !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - pending.x, e.clientY - pending.y);
      if (moved < 12) openMention(e, pending.target);
    };
    const pointerCancelHandler = () => {
      pendingPointer = null;
    };
    const touchStartHandler = (e: TouchEvent) => {
      const target = getMentionTarget(e.target);
      const touch = e.touches[0];
      if (!target || !touch) return;
      pendingTouch = { x: touch.clientX, y: touch.clientY, target };
    };
    const touchEndHandler = (e: TouchEvent) => {
      const pending = pendingTouch;
      pendingTouch = null;
      const touch = e.changedTouches[0];
      if (!pending || !touch) return;
      const moved = Math.hypot(touch.clientX - pending.x, touch.clientY - pending.y);
      if (moved < 12) openMention(e, pending.target);
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') handler(e);
    };
    // Use pointer-up for touch/pen so scrolling from a mention chip does not navigate.
    // Mouse still opens on pointer-down; click is kept as the legacy fallback.
    document.addEventListener('pointerdown', pointerDownHandler, true);
    document.addEventListener('pointerup', pointerUpHandler, true);
    document.addEventListener('pointercancel', pointerCancelHandler, true);
    document.addEventListener('touchstart', touchStartHandler, true);
    document.addEventListener('touchend', touchEndHandler, true);
    document.addEventListener('touchcancel', pointerCancelHandler, true);
    document.addEventListener('click', handler, true);
    document.addEventListener('keydown', keyHandler, true);
    return () => {
      document.removeEventListener('pointerdown', pointerDownHandler, true);
      document.removeEventListener('pointerup', pointerUpHandler, true);
      document.removeEventListener('pointercancel', pointerCancelHandler, true);
      document.removeEventListener('touchstart', touchStartHandler, true);
      document.removeEventListener('touchend', touchEndHandler, true);
      document.removeEventListener('touchcancel', pointerCancelHandler, true);
      document.removeEventListener('click', handler, true);
      document.removeEventListener('keydown', keyHandler, true);
    };
  }, [navigate]);
  return null;
};

// Show inline-comment text when a user clicks/taps a commented span
const CommentClickListener = () => {
  useEffect(() => {
    let toastFn: ((msg: string) => void) | null = null;
    import('sonner').then(m => { toastFn = (msg) => m.toast(msg, { duration: 4500 }); });
    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.('.rt-comment') as HTMLElement | null;
      if (!target) return;
      const text = target.getAttribute('data-comment');
      if (!text) return;
      e.preventDefault();
      e.stopPropagation();
      if (toastFn) toastFn(`💬 ${text}`);
      else alert(text);
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);
  return null;
};

const WidgetRouteListener = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleWidgetRoute = (event: CustomEvent<{ path: string }>) => {
      const path = event.detail?.path;
      if (!path?.startsWith('/')) return;
      const target = `${location.pathname}${location.search}`;
      if (path !== target) navigate(path, { replace: false });
    };
    window.addEventListener('widgetRouteOpen', handleWidgetRoute as EventListener);
    return () => window.removeEventListener('widgetRouteOpen', handleWidgetRoute as EventListener);
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void widgetDataSync.initialize().then(() => {
      const actual = `${window.location.pathname}${window.location.search}`;
      const routed = `${location.pathname}${location.search}`;
      if (actual.startsWith('/') && actual !== routed) {
        navigate(actual, { replace: true });
      }
    });
  }, []);

  return null;
};

// Root redirect component that redirects to Todo dashboard by default
const RootRedirect = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    // If we've already resolved once, skip
    if (hasResolvedInitialDashboard) return;
    hasResolvedInitialDashboard = true;
    
    const checkLastDashboard = async () => {
      try {
        const lastDashboard = await getSetting<string>('lastDashboard', 'todo');
        if (lastDashboard === 'notes') {
          startTransition(() => {
            navigate('/notesdashboard', { replace: true });
          });
        }
      } catch (e) {
        console.warn('Failed to check last dashboard:', e);
      }
    };
    
    checkLastDashboard();
  }, [navigate]);
  
  // Always render Today (Todo) immediately - no loading screen
  return <Today />;
};

const ShareIntentBridge = () => {
  useShareIntent();
  return null;
};

const AppRoutes = () => {
  useGlobalShortcuts();
  return (
    <BrowserRouter>
      <ShareIntentBridge />
      <NavigationBackProvider>
        <NavigationLoader />
        <DashboardTracker />
        <TourNavigationListener />
        <WidgetRouteListener />
        <MentionClickListener />
        <CommentClickListener />
          <Suspense fallback={<RouteSkeleton />}>
          <DesktopSidebar />
          <div className="md:pl-[var(--desktop-sidebar-width,0px)] transition-[padding] duration-200">
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/notesdashboard" element={<Index />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/calendar" element={<NotesCalendar />} />
            <Route path="/clip" element={<WebClipper />} />
            <Route path="/webclipper" element={<WebClipper />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/sync-diagnostics" element={<SyncDiagnostics />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/todo/today" element={<Today />} />
            <Route path="/todo/calendar" element={<TodoCalendar />} />
            <Route path="/todo/settings" element={<TodoSettings />} />
            <Route path="/todo/progress" element={<Progress />} />
            <Route path="/todo/habits" element={<Habits />} />
            <Route path="/todo/matrix" element={<EisenhowerMatrix />} />
            <Route path="/todo/countdown" element={<Countdown />} />
            <Route path="/todo/countdown/:id" element={<CountdownDetail />} />

            <Route path="/todo/habits/gallery" element={<HabitGallery />} />
            <Route path="/todo/habits/new" element={<HabitNew />} />
            <Route path="/todo/habits/sections" element={<HabitSections />} />
            <Route path="/todo/habits/:id" element={<HabitDetail />} />
            <Route path="/todo/journey-history" element={<JourneyHistory />} />
            <Route path="/todo/journey-badges" element={<JourneyBadges />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            
            <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
            <Route path="/admin/onboarding" element={<AdminOnboarding />} />
            <Route path="/w/add-task" element={<WidgetAddTask />} />
            <Route path="/w/new/sticky" element={<WidgetNewSticky />} />
            <Route path="/w/new/lined" element={<WidgetNewLined />} />
            <Route path="/w/new/regular" element={<WidgetNewRegular />} />
            <Route path="/w/new/sketch" element={<WidgetNewSketch />} />
            <Route path="/mustafabugti890" element={<PremiumUnlock />} />
            <Route path="*" element={<NotFound />} />

          </Routes>
          </div>
        </Suspense>
      </NavigationBackProvider>
    </BrowserRouter>
  );
};

const DriveSyncBootstrapInner = () => {
  useGoogleDriveSync();
  return null;
};

const DriveSyncBootstrap = () => (
  <ErrorBoundary fallback={null}>
    <DriveSyncBootstrapInner />
  </ErrorBoundary>
);

const AppContent = () => {
  useCloudSync();
  const [isAppLocked, setIsAppLocked] = useState<boolean | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(() => {
    try {
      return localStorage.getItem('onboarding_completed_flag') === 'true' ? false : null;
    } catch {
      return null;
    }
  });
  
  // Web-only landing page gate. Native apps NEVER show landing.
  // Multi-signal native detection (Capacitor.isNativePlatform can be false during very early boot
  // before the bridge attaches; we also sniff the UA + window.Capacitor as belt-and-suspenders).
  const isNative = (() => {
    try {
      if (Capacitor.isNativePlatform()) return true;
      if (typeof window !== 'undefined') {
        const w: any = window;
        if (w.Capacitor?.isNativePlatform?.()) return true;
        if (w.Capacitor?.platform && w.Capacitor.platform !== 'web') return true;
        const ua = navigator?.userAgent || '';
        if (/CapacitorWebView|Capacitor\//i.test(ua)) return true;
      }
    } catch {}
    return false;
  })();
  const [showLanding, setShowLanding] = useState<boolean>(() => {
    if (isNative) return false;
    try {
      // If user previously engaged (signed in or paid) — never show landing again until logout/expiry
      if (localStorage.getItem('flowist_user_engaged') === 'true') return false;
      // If they already clicked "Get Started" (session OR persisted across reload), skip
      if (sessionStorage.getItem('flowist_landing_acknowledged') === 'true') return false;
      if (localStorage.getItem('flowist_landing_acknowledged') === 'true') return false;
      // If onboarding was already completed before, treat as engaged user — go straight to app
      if (localStorage.getItem('onboarding_completed_flag') === 'true') return false;
    } catch {}
    return true;
  });

  const { isPro, isLoading: subLoading, isVerifyingCheckout, isNewFreeUser, openPaywall } = useSubscription();
  const awaitingSubscriptionChoice = useRef(
    sessionStorage.getItem('awaitingSubscriptionChoice') === 'true'
  );

  // Check onboarding status
  useEffect(() => {
    const check = async () => {
      // Read from BOTH IndexedDB-backed settings AND Capacitor Preferences (native).
      // On iOS WKWebView, IndexedDB can occasionally be cleared by the system under
      // storage pressure — Preferences (UserDefaults-backed) is the durable source.
      let completed = await getSetting<boolean>('onboarding_completed', false);
      if (!completed && Capacitor.isNativePlatform()) {
        try {
          const { value } = await Preferences.get({ key: 'onboarding_completed' });
          if (value === 'true') {
            completed = true;
            // Re-hydrate IndexedDB so the rest of the app sees the flag too
            await setSetting('onboarding_completed', true);
            try { localStorage.setItem('onboarding_completed_flag', 'true'); } catch {}
          }
        } catch {}
      }
      setShowOnboarding(!completed);
    };
    check();

    // Listen for onboarding reset (e.g. sign out, subscription cancel)
    const handleReset = () => {
      awaitingSubscriptionChoice.current = false;
      sessionStorage.removeItem('awaitingSubscriptionChoice');
      // Only force a returning user through onboarding/language again if they
      // truly have never completed it. Otherwise it's a frustrating dead-end.
      const alreadyOnboarded = (() => {
        try { return localStorage.getItem('onboarding_completed_flag') === 'true'; } catch { return false; }
      })();
      if (!alreadyOnboarded) setShowOnboarding(true);
      // Web: send signed-out users back to landing, but KEEP onboarding flag
      // so they don't get dumped into the language picker again on re-login.
      if (!isNative) {
        try {
          localStorage.removeItem('flowist_user_engaged');
          localStorage.removeItem('flowist_landing_acknowledged');
          sessionStorage.removeItem('flowist_landing_acknowledged');
        } catch {}
        setShowLanding(true);
      }
    };
    window.addEventListener('flowistOnboardingReset', handleReset);
    
    // Listen for landing dismissal (user clicked Get Started)
    const handleLandingDismissed = () => setShowLanding(false);
    window.addEventListener('flowistLandingDismissed', handleLandingDismissed);

    // Listen for explicit "show landing" request (e.g. back from onboarding language step)
    const handleShowLanding = () => {
      setShowOnboarding(false);
      setShowLanding(true);
    };
    window.addEventListener('flowistShowLanding', handleShowLanding);

    return () => {
      window.removeEventListener('flowistOnboardingReset', handleReset);
      window.removeEventListener('flowistLandingDismissed', handleLandingDismissed);
      window.removeEventListener('flowistShowLanding', handleShowLanding);
    };
  }, [isNative]);
  
  // Mark user as "engaged" once they're signed in or subscribed (web only)
  // This persists across refreshes so they skip landing on return visits
  useEffect(() => {
    if (isNative) return;
    if (isPro) {
      try { localStorage.setItem('flowist_user_engaged', 'true'); } catch {}
      setShowLanding(false);
      return;
    }
    // Also engage on sign-in (even without subscription)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        try { localStorage.setItem('flowist_user_engaged', 'true'); } catch {}
        setShowLanding(false);
      } else if (event === 'SIGNED_OUT') {
        try {
          localStorage.removeItem('flowist_user_engaged');
          localStorage.removeItem('flowist_landing_acknowledged');
          sessionStorage.removeItem('flowist_landing_acknowledged');
        } catch {}
        setShowLanding(true);
      }
    });
    // Initial check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        try { localStorage.setItem('flowist_user_engaged', 'true'); } catch {}
        setShowLanding(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [isPro, isNative]);

  // Track whether user was ever granted access this session to prevent white flash
  const wasEverPro = useRef(false);
  if (isPro) wasEverPro.current = true;

  // Handle subscription state
  useEffect(() => {
    if (subLoading || isVerifyingCheckout) return;
    
    if (isPro) {
      awaitingSubscriptionChoice.current = false;
      sessionStorage.removeItem('awaitingSubscriptionChoice');
      
      // If user is verified Pro but onboarding is still showing, auto-skip it
      // This handles: subscribed user on web who refreshes or returns after sign-out grace
      if (showOnboarding) {
        console.log('[App] Subscribed user detected — auto-skipping onboarding');
        setSetting('onboarding_completed', true).then(() => {
          startTransition(() => setShowOnboarding(false));
        });
      }
      return;
    }
    
    // Don't process non-pro logic while onboarding is active (user is going through it)
    if (showOnboarding) return;
    // Don't reset if onboarding just completed (trial/subscription state still propagating)
    if (onboardingJustCompleted.current) return;
    // Don't reset while the user is intentionally moving from onboarding to paywall/checkout
    if (awaitingSubscriptionChoice.current) return;
    // On native: if user was ever pro this session, don't reset — RC may just be slow
    if (wasEverPro.current) return;
    // Soft-paywall: brand-new free users get to use the app with limits — don't kick them back to onboarding
    if (isNewFreeUser) return;
    // No active subscription — but if the user previously completed onboarding,
    // DO NOT wipe their progress and dump them back into language selection.
    // The paywall (gated per-feature inside the app) is the correct gate for
    // non-pro users. Wiping onboarding on every cold start was the root cause
    // of "app restarts onboarding after sign-in + reopen" on iOS.
    (async () => {
      const alreadyOnboarded =
        (typeof localStorage !== 'undefined' &&
          localStorage.getItem('onboarding_completed_flag') === 'true') ||
        (await getSetting<boolean>('onboarding_completed', false));
      if (alreadyOnboarded) return; // keep them in the app; paywall will gate Pro features
      await setSetting('onboarding_completed', false);
      setShowOnboarding(true);
    })();
  }, [isPro, subLoading, showOnboarding, isVerifyingCheckout, isNewFreeUser]);

  useEffect(() => {
    if (subLoading || isVerifyingCheckout || isPro || showOnboarding !== false || showLanding) return;
    openPaywall('daily_free_reminder', { daily: true });
  }, [isPro, subLoading, isVerifyingCheckout, showOnboarding, showLanding, openPaywall]);

  // Grace period after onboarding completes — prevents the subscription effect
  // from immediately resetting onboarding before trial/subscription state propagates
  const onboardingJustCompleted = useRef(false);

  const handleOnboardingComplete = useCallback(() => {
    onboardingJustCompleted.current = true;
    awaitingSubscriptionChoice.current = true;
    sessionStorage.setItem('awaitingSubscriptionChoice', 'true');
    // Persist engagement so refresh / cold start lands directly on the dashboard,
    // never the landing page again (until sign-out or subscription expiry).
    try {
      localStorage.setItem('flowist_user_engaged', 'true');
      localStorage.setItem('onboarding_completed_flag', 'true');
      sessionStorage.setItem('flowist_landing_acknowledged', 'true');
    } catch {}
    // Native: mirror to Capacitor Preferences (UserDefaults / SharedPrefs) so the
    // flag survives WKWebView storage purges and WebView resets.
    if (Capacitor.isNativePlatform()) {
      Preferences.set({ key: 'onboarding_completed', value: 'true' }).catch(() => {});
    }
    startTransition(() => {
      setShowLanding(false);
      setShowOnboarding(false);
    });
    // Ensure Notes dashboard reloads folders created during onboarding
    setTimeout(() => {
      window.dispatchEvent(new Event('foldersUpdated'));
    }, 300);
    // Clear the grace flag after subscription state has had time to update
    setTimeout(() => {
      onboardingJustCompleted.current = false;
    }, 5000);
  }, []);

  // Initialize keyboard height detection for mobile toolbar positioning
  useKeyboardHeight();
  
  // Global journey advancement - listens for task completions from any page
  useJourneyAdvancement();
  useAchievementToasts();
  useCertificateToasts();
  
  // Subscription expiry watcher — warnings + notifications
  useSubscriptionExpiry();
  
  // In-app notification listener — captures events from all sources
  useNotificationListener();

  // Share-target listener is mounted inside <BrowserRouter> (see ShareIntentBridge
  // in AppRoutes) because useShareIntent uses useNavigate, which requires Router context.

  // Listen for "secure your subscription" message (purchase without sign-up)
  useEffect(() => {
    const handler = async () => {
      try {
        const { toast: uiToast } = await import('@/components/ui/use-toast');
        uiToast({
          title: '🔒 Secure Your Subscription',
          description: 'If you want to secure your subscription, please sign up with your Google account in Profile.',
          duration: 15000,
        });
      } catch {}
    };
    window.addEventListener('showSecureSubscriptionMessage', handler);
    return () => window.removeEventListener('showSecureSubscriptionMessage', handler);
  }, []);

  // Defer non-critical sync hooks until after first paint
  const deferredInit = useRef(false);
  useEffect(() => {
    if (deferredInit.current) return;
    deferredInit.current = true;

    const init = async () => {
      const { widgetDataSync } = await import('@/utils/widgetDataSync');
      widgetDataSync.initialize().catch(console.error);
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => init(), { timeout: 2000 });
    } else {
      setTimeout(init, 200);
    }
  }, []);

  // App lock check
  useEffect(() => {
    const checkLock = async () => {
      const locked = await shouldAppBeLocked();
      setIsAppLocked(locked);
    };
    checkLock();
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Handle unlock
  const handleUnlock = async () => {
    await updateLastUnlockTime();
    setIsAppLocked(false);
  };

  // Show lock screen if locked (but not while checking)
  if (isAppLocked === true) {
    return (
      <>
        <Toaster />
        <Sonner />
        <AppLockScreen onUnlock={handleUnlock} />
      </>
    );
  }

  // Render the dashboard as soon as onboarding is complete. Free users stay in-app with
  // soft limits; don't unmount the app during subscription rechecks (causes white screen).
  const canRenderProtectedApp = showOnboarding === false;

  // Web-only: show landing page first for guests who haven't engaged yet.
  // HARD GUARD: never on native — even if state somehow became true, the platform check wins.
  if (showLanding && !isNative) {
    return (
      <>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<BrandedFallback />}>
            <Routes>
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
              <Route path="/mustafabugti890" element={<PremiumUnlock />} />
              <Route path="*" element={<Landing />} />

            </Routes>
          </Suspense>
        </BrowserRouter>
      </>
    );
  }

  return (
    <>
      <Toaster />
      <Sonner />
      <PerfDiagnosticsPanel />
      
      {showOnboarding && (
        <Suspense fallback={<BrandedFallback />}>
          <OnboardingFlow onComplete={handleOnboardingComplete} />
        </Suspense>
      )}

      
      <Suspense fallback={null}>
        <PremiumPaywall />
      </Suspense>
      

      {/* Only render app content after subscription access is fully verified */}
      {showOnboarding === null && !showLanding && <BrandedFallback />}

      {canRenderProtectedApp && (
        <>
          <Suspense fallback={null}>
            <StreakMilestoneCelebration />
            <StreakTierCelebration />
            <SmartReviewPrompt />
            <ComboOverlay />
            <EncouragementOverlay />
            <UrgentReminderOverlay />
            <SyncConflictSheet />
            <SyncProgressSheet />
          </Suspense>
          <DeferredSyncInit />
          <AppRoutes />
        </>
      )}
    </>
  );
};

// Deferred sync hooks - lazy loaded after first paint
const DeferredSyncInit = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = 'requestIdleCallback' in window
      ? requestIdleCallback(() => setReady(true), { timeout: 2000 })
      : setTimeout(() => setReady(true), 200);
    return () => {
      if ('requestIdleCallback' in window) cancelIdleCallback(id as number);
      else clearTimeout(id as ReturnType<typeof setTimeout>);
    };
  }, []);

  if (!ready) return null;
  return null;
};

 

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <LazyMotion features={domAnimation}>
        <TooltipProvider>
          <GoogleAuthProvider>
            <DriveSyncBootstrap />
            <NotesProvider>
              <SubscriptionProvider>
                <AppContent />
              </SubscriptionProvider>
            </NotesProvider>
          </GoogleAuthProvider>
        </TooltipProvider>
      </LazyMotion>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
