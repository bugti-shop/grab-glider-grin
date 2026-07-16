import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import posthog from "posthog-js";

posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_POSTHOG_HOST,
  defaults: "2026-05-30",
});

// Add platform class to body for platform-specific CSS
if (Capacitor.isNativePlatform()) {
  document.body.classList.add('native-app');
  if (Capacitor.getPlatform() === 'android') {
    document.body.classList.add('android-app');
    // Add stretch class to html for edge-to-edge height fix
    document.documentElement.classList.add('android-stretch');
  } else if (Capacitor.getPlatform() === 'ios') {
    document.body.classList.add('ios-app');
  }

  // Lock the viewport on native so an accidental pinch-zoom or double-tap-zoom
  // (a common iOS WKWebView complaint) cannot leave the UI stuck zoomed-in
  // until the user kills the app.
  try {
    let vp = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
    if (!vp) {
      vp = document.createElement('meta');
      vp.name = 'viewport';
      document.head.appendChild(vp);
    }
    vp.setAttribute(
      'content',
      'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
    );
  } catch {}

  // Belt-and-suspenders: block iOS gesture-based zoom even if a stray meta
  // viewport gets re-injected later, and snap any stuck zoom back to 1x.
  const cancelZoom = (e: Event) => { e.preventDefault(); };
  document.addEventListener('gesturestart', cancelZoom, { passive: false });
  document.addEventListener('gesturechange', cancelZoom, { passive: false });
  document.addEventListener('gestureend', cancelZoom, { passive: false });

  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        // double-tap → suppress iOS zoom
        e.preventDefault();
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );
}

// Prevent PWA service worker in preview/iframe contexts
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
}
import { migrateLocalStorageToIndexedDB, getSetting, warmSettingsCache } from "./utils/settingsStorage";
import { migrateNotesToIndexedDB } from "./utils/noteStorage";
import { initializeProtectionSettings } from "./utils/noteProtection";
import { configureStatusBar } from "./utils/statusBar";
import { initializeTaskOrder } from "./utils/taskOrderStorage";
import { initSafeTopCalibration } from "./utils/safeTopCalibration";

// Auto-calibrate header safe-top as early as possible so the very first paint
// uses the measured notch/status-bar inset (plus any user offset).
initSafeTopCalibration();

// One-time cache clear
const CACHE_CLEAR_KEY = 'nota_cache_cleared_v3';
const CACHE_CLEAR_DONE_VALUE = 'true';

const hasCacheBeenCleared = (() => {
  try {
    return localStorage.getItem(CACHE_CLEAR_KEY) === CACHE_CLEAR_DONE_VALUE;
  } catch {
    return true;
  }
})();

if (!hasCacheBeenCleared && !Capacitor.isNativePlatform()) {
  // Write flag first so a crash/reload won't re-trigger the wipe.
  try { localStorage.setItem(CACHE_CLEAR_KEY, CACHE_CLEAR_DONE_VALUE); } catch {}

  const dbNames = [
    'nota-settings-db', 'nota-notes-db', 'nota-task-db', 'nota-task-media-db',
    'nota-media-db', 'nota-tags-db', 'nota-habits-db', 'nota-receipts-db'
  ];

  // Wait for all database deletions to complete before reloading
  const deletePromises = dbNames.map(name => new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve(); // resolve even on error
      req.onblocked = () => resolve(); // resolve even if blocked
      // Safety timeout in case callbacks never fire (Android WebView edge case)
      setTimeout(resolve, 2000);
    } catch {
      resolve();
    }
  }));

  // Preserve the clear-marker key only.
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key !== CACHE_CLEAR_KEY) {
        try { localStorage.removeItem(key); } catch {}
      }
    });
  } catch {}

  Promise.all(deletePromises).then(() => {
    window.location.reload();
  }).catch(() => {
    window.location.reload();
  });
}

// No spinner, but keep the root painted so mobile/web never looks like a crashed white page.
const EmptyFallback = () => <div className="min-h-screen bg-background" aria-hidden="true" />;

// Catch uncaught synchronous errors that escape React's error boundary
window.addEventListener('error', (event) => {
  // Prevent white screen from extension-injected script errors
  if (event.filename && !event.filename.includes(window.location.origin)) {
    event.preventDefault();
    return;
  }
  // Suppress Firebase/network errors
  const msg = String(event?.message || '');
  if (msg.includes('Firebase') || msg.includes('PERMISSION_DENIED') || msg.includes('network') || msg.includes('timeout') || msg.includes('Failed to fetch')) {
    event.preventDefault();
    console.warn('Suppressed error:', msg);
    return;
  }
});

// Catch unhandled promise rejections silently
window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event?.reason?.message || event?.reason || '');
  if (
    msg.includes('QuotaExceededError') || msg.includes('quota') || msg.includes('storage') ||
    msg.includes('Firebase') || msg.includes('PERMISSION_DENIED') ||
    msg.includes('network') || msg.includes('timeout') || msg.includes('Failed to fetch') ||
    msg.includes('Loading chunk') || msg.includes('dynamically imported module') ||
    msg.includes('AbortError') || msg.includes('The operation was aborted') ||
    msg.includes('ResizeObserver') || msg.includes('removeChild') || msg.includes('insertBefore')
  ) {
    event.preventDefault();
    console.warn('Suppressed rejection:', msg.slice(0, 100));
  }
});

// Schedule non-critical work after first paint
const scheduleDeferred = (fn: () => void) => {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(fn, { timeout: 3000 });
  } else {
    setTimeout(fn, 100);
  }
};

// Start warming settings cache but DON'T block render on it.
// On native (SQLite) this is instant; on web (IndexedDB) it can take seconds.
// Race: render as soon as cache is warm OR after 150ms max.
// Patch DOM methods on root to prevent "removeChild" crashes from browser
// extensions or third-party scripts that modify React-managed DOM nodes.
const patchRootContainer = (container: HTMLElement) => {
  if ((container as HTMLElement & { __flowistPatched?: boolean }).__flowistPatched) {
    return;
  }

  const origRemoveChild = container.removeChild.bind(container);
  const origInsertBefore = container.insertBefore.bind(container);

  container.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== container) {
      console.warn('Suppressed removeChild on non-child node');
      return child;
    }
    return origRemoveChild(child);
  };

  container.insertBefore = function <T extends Node>(newNode: T, refNode: Node | null): T {
    if (refNode && refNode.parentNode !== container) {
      console.warn('Suppressed insertBefore on non-child ref node');
      return newNode;
    }
    return origInsertBefore(newNode, refNode);
  };

  (container as HTMLElement & { __flowistPatched?: boolean }).__flowistPatched = true;
};

const rootCache = globalThis as typeof globalThis & {
  __flowistAppRoot?: ReturnType<typeof createRoot>;
};

const renderApp = () => {
  const rootEl = document.getElementById("root")!;
  patchRootContainer(rootEl);
  const appRoot = rootCache.__flowistAppRoot ?? createRoot(rootEl);
  rootCache.__flowistAppRoot = appRoot;
  appRoot.render(
    <React.StrictMode>
      <Suspense fallback={<EmptyFallback />}>
        <App />
      </Suspense>
    </React.StrictMode>
  );

  if (Capacitor.isNativePlatform()) {
    requestAnimationFrame(() => {
      SplashScreen.hide({ fadeOutDuration: 250 }).catch((error) => {
        console.warn('[SplashScreen] Hide failed:', error);
      });
    });
  }
};

// Pre-boot: drain widget pending deep-link BEFORE React renders so a
// home-screen widget tap (e.g. Quick-Add) lands directly on the target
// route on the very first paint — no main-screen flash, no transition.
// We block the initial render for at most one short Preferences read.
const bootstrap = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const { value } = await Preferences.get({ key: 'widget_pending_path' });
      if (value && value.startsWith('/')) {
        await Preferences.remove({ key: 'widget_pending_path' });
        try { window.history.replaceState({}, '', value); } catch {}
      }
    } catch {}
  }
  try {
    renderApp();
  } catch (err) {
    console.error('[Boot] renderApp failed:', err);
    try {
      const rootEl = document.getElementById('root');
      if (rootEl) {
        rootEl.innerHTML =
          '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fff;color:#111;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px;text-align:center;">' +
          '<div><h1 style="font-size:18px;margin:0 0 8px;">Flowist</h1>' +
          '<p style="font-size:14px;color:#555;margin:0 0 16px;">Something went wrong starting the app.</p>' +
          '<button onclick="location.reload()" style="background:#3c78f0;color:#fff;border:0;padding:10px 18px;border-radius:8px;font-size:14px;">Reload</button>' +
          '</div></div>';
      }
    } catch {}
  }
};
bootstrap();

if (Capacitor.isNativePlatform()) {
  // Aggressive fallback: hide splash quickly on slow devices so users never
  // stare at a static splash while the JS bundle finishes hydrating.
  setTimeout(() => {
    SplashScreen.hide({ fadeOutDuration: 0 }).catch(() => {});
  }, 400);
}


// Warm settings cache in background (non-blocking)
warmSettingsCache().catch(() => {});

// When the WebView is cold-booted at /quick-add (Android widget overlay),
// skip every non-essential deferred subsystem — background sync worker,
// notification schedulers, migrations, status-bar theming. None of it is
// needed for the sub-second Task-Input-Sheet flow, and each import adds
// parse+execute time on a low-end launcher-owned WebView.
const __IS_QUICK_ADD_BOOT_MAIN__ =
  typeof window !== 'undefined' && window.location.pathname === '/quick-add';

if (!__IS_QUICK_ADD_BOOT_MAIN__) {
  // Background sync worker (web only, production builds only — guarded internally)
  import('./utils/cloudSync/registerSyncWorker').then(m => m.registerSyncWorker()).catch(() => {});

  // Initialize native social-login plugin EARLY on iOS/Android.
  // Capgo's SocialLogin requires initialize() before login() — otherwise the
  // native sheet may open but the JS callback never fires.
  if (Capacitor.isNativePlatform()) {
    Promise.all([
      import('./utils/googleAuth').then((m) => m.initNativeSocialLogin()),
      import('./utils/nativeAppleAuth').then((m) => m.initNativeApple()),
    ]).catch((e) => console.warn('[Boot] Native social-login init failed:', e));

    // Drain widget pending deep-link path EARLY so cold-start widget taps
    // (?add=1, ?newNote=sticky, etc.) land on the right route before pages mount.
    import('./utils/widgetDataSync').then((m) => m.widgetDataSync.initialize()).catch(() => {});
  }

  // Defer ALL non-critical initialization until after first paint
  scheduleDeferred(async () => {
    try {
      const [
        { startBackgroundScheduler },
        { initializeReminders },
        { initializeStreakNotifications },
        { initializeSmartNotifications },
        { initializeSmartNudges },
        { restoreHabitReminders },
        { restoreCountdownReminders },
      ] = await Promise.all([
        import("./utils/backgroundScheduler"),
        import("./utils/reminderScheduler"),
        import("./utils/streakNotifications"),
        import("./utils/smartNotifications"),
        import("./utils/smartNudges"),
        import("./utils/habitReminders"),
        import("./utils/countdownReminders"),
      ]);

      // Run migrations in parallel
      await Promise.all([
        migrateLocalStorageToIndexedDB(),
        migrateNotesToIndexedDB(),
        initializeTaskOrder(),
        initializeProtectionSettings(),
      ]);

      // Start background scheduler
      startBackgroundScheduler();

      // Fire-and-forget notification initializations
      initializeReminders().catch(console.warn);
      initializeStreakNotifications().catch(console.warn);
      initializeSmartNotifications().catch(console.warn);
      initializeSmartNudges().catch(console.warn);
      restoreHabitReminders().catch(console.warn);
      restoreCountdownReminders().catch(console.warn);

      

      // Configure status bar
      const theme = await getSetting<string>('theme', 'light');
      await configureStatusBar(theme !== 'light', theme || 'light');
    } catch (error) {
      console.error('Deferred initialization error:', error);
    }
  });
} else {
  // Quick-Add cold-open: mark the boot so the perf log in QuickAddShell has a
  // stable reference point even on browsers that don't expose navigation timing.
  try { performance.mark('quick-add:boot-main'); } catch {}
}

