/**
 * useQuickAddSync — main-app side of the Quick-Add overlay realtime channel.
 *
 * Mount ONCE at the top of the authenticated app tree (inside AppContent).
 * It listens for signals fired by src/pages/QuickAdd.tsx when a task is added
 * from the Android home-screen widget overlay, then:
 *
 *   1. Forces the Today page to reload tasks from IndexedDB immediately
 *      (fires the same `tasksRestored` event the cloud-sync restore uses).
 *   2. Navigates to /todo/today so the user lands on the task they just
 *      created — regardless of where they were when they tapped the widget.
 *   3. Handles cold-start too: if the overlay wrote a pending-navigation
 *      marker while the main app was closed, we drain it on first mount.
 *
 * Channels consumed (any one is enough):
 *   • BroadcastChannel("flowist:tasks")  — instant, same-device
 *   • window "storage" event on quickAdd:lastAddedAt — cross-WebView
 *   • Capacitor App `appStateChange` (isActive)      — native resume
 *   • localStorage "quickAdd:pendingNavigation"      — cold-start pickup
 */
import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const PENDING_NAV_KEY = "quickAdd:pendingNavigation";
const LAST_ADDED_AT_KEY = "quickAdd:lastAddedAt";
const NAV_MAX_AGE_MS = 5 * 60 * 1000; // Ignore markers older than 5 min

export const useQuickAddSync = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  useEffect(() => {
    let disposed = false;

    const reloadTasks = () => {
      // The Today page listens for `tasksRestored` and reloads from IDB
      // without re-uploading (avoids the sync loop).
      try {
        window.dispatchEvent(new Event("tasksRestored"));
      } catch {}
      // Also fire the generic event so counters / other listeners refresh.
      try {
        window.dispatchEvent(new Event("tasksUpdated"));
      } catch {}
    };

    const goToToday = (taskId?: string) => {
      const target = "/todo/today";
      if (locationRef.current !== target) {
        try {
          navigate(target, { state: taskId ? { highlightTaskId: taskId } : undefined });
        } catch {
          // Fallback to hard nav if router isn't ready yet.
          try { window.location.assign(target); } catch {}
        }
      }
    };

    const drainPendingNavigation = () => {
      try {
        const raw = localStorage.getItem(PENDING_NAV_KEY);
        if (!raw) return;
        localStorage.removeItem(PENDING_NAV_KEY);
        const parsed = JSON.parse(raw) as {
          route?: string;
          taskId?: string;
          at?: number;
        };
        if (!parsed || typeof parsed.at !== "number") return;
        if (Date.now() - parsed.at > NAV_MAX_AGE_MS) return;
        reloadTasks();
        goToToday(parsed.taskId);
      } catch {
        // Corrupt marker — just clear it silently.
        try { localStorage.removeItem(PENDING_NAV_KEY); } catch {}
      }
    };

    // Fallback: even without a pending marker, if the overlay recently wrote
    // its lastAddedAt timestamp we still force a reload so tasks written by
    // the isolated overlay WebView surface in Today.
    const drainRecentAdd = () => {
      try {
        const raw = localStorage.getItem(LAST_ADDED_AT_KEY);
        if (!raw) return;
        const at = Number(raw);
        if (!Number.isFinite(at)) return;
        if (Date.now() - at > NAV_MAX_AGE_MS) return;
        const consumedKey = "quickAdd:lastAddedAt:consumed";
        if (localStorage.getItem(consumedKey) === raw) return;
        localStorage.setItem(consumedKey, raw);
        reloadTasks();
        const taskId = localStorage.getItem("quickAdd:lastAddedId") ?? undefined;
        goToToday(taskId);
      } catch {}
    };

    const handleSignal = (taskId?: string) => {
      if (disposed) return;
      reloadTasks();
      goToToday(taskId);
    };

    // 1) BroadcastChannel — instant same-device push
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("flowist:tasks");
      bc.onmessage = (ev) => {
        const msg = ev.data as { type?: string; id?: string; source?: string };
        if (msg?.type === "task-added" && msg.source === "quick-add") {
          handleSignal(msg.id);
        }
      };
    } catch {}

    // 2) storage event — cross-WebView on Android (shared origin)
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_ADDED_AT_KEY) handleSignal(localStorage.getItem("quickAdd:lastAddedId") ?? undefined);
      if (e.key === PENDING_NAV_KEY && e.newValue) drainPendingNavigation();
    };
    window.addEventListener("storage", onStorage);

    // 3) Native resume — pickup markers written while main app was paused
    let capResumeSub: { remove: () => void } | null = null;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import("@capacitor/app");
        const sub = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            drainPendingNavigation();
            drainRecentAdd();
          }
        });
        if (disposed) sub.remove();
        else capResumeSub = sub;
      } catch {}
    })();

    // 4) Browser focus / visibility — every time the user comes back to the
    //    main-app WebView, re-check for a task the overlay may have written.
    const onFocus = () => { drainPendingNavigation(); drainRecentAdd(); };
    const onVisibility = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    // 5) Cold-start drain (both markers)
    drainPendingNavigation();
    drainRecentAdd();


    return () => {
      disposed = true;
      window.removeEventListener("storage", onStorage);
      try { bc?.close(); } catch {}
      capResumeSub?.remove();
    };
  }, [navigate]);
};
