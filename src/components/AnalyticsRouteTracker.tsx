import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

type LovableAnalyticsWindow = Window & {
  Tinybird?: {
    trackEvent?: (name: string, payload: Record<string, unknown>) => void;
  };
};

let pageLoadSessionId: string | null = null;

const isAnalyticsHost = () => {
  const host = window.location.hostname;
  return !(
    host.includes("id-preview--") ||
    host.includes("lovableproject.com") ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
};

const readCookie = (name: string) => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

const randomId = () => {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const getPageLoadSessionId = () => {
  if (!pageLoadSessionId) {
    pageLoadSessionId = `flowist-${Date.now()}-${randomId()}`;
  }
  return pageLoadSessionId;
};

const resetPageLoadSessionId = () => {
  pageLoadSessionId = `flowist-${Date.now()}-${randomId()}`;
};

const getProxyUrl = () => {
  const script = document.querySelector<HTMLScriptElement>('script[src*="/~flock.js"]');
  return script?.getAttribute("data-proxy-url") || "/~api/analytics";
};

const normalizePath = (path: string) => {
  return path
    // UUIDs → :id
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    // long hex/alnum ids (>=16 chars) → :id
    .replace(/\/[A-Za-z0-9_-]{16,}/g, "/:id")
    // pure numeric segments → :n
    .replace(/\/\d+(?=\/|$)/g, "/:n");
};

const getPageviewPayload = (): Record<string, unknown> => {
  const rawPath = window.location.pathname;
  const pathname = normalizePath(rawPath);
  return {
    "user-agent": window.navigator.userAgent,
    locale: window.navigator.languages?.[0] || window.navigator.language || "en",
    referrer: document.referrer,
    pathname,
    href: window.location.origin + pathname + window.location.search,
    title: document.title,
    visit_id: getPageLoadSessionId(),
    event_id: randomId(),
  };
};

const postDirectPageview = (payload: Record<string, unknown>) => {
  const body = JSON.stringify({
    timestamp: new Date().toISOString(),
    action: "page_hit",
    version: "1",
    // Lovable analytics de-dupes visitors by session_id. To ensure every
    // page visit (even from the same browser or multiple users sharing a
    // device) is counted as a distinct visitor on that page, mint a brand
    // new session_id per route ping.
    session_id: `flowist-${Date.now()}-${randomId()}`,
    payload: JSON.stringify(payload),
  });

  const url = getProxyUrl();
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    }
  } catch {}

  try {
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {}
};

const trackPageview = (attempt = 0) => {
  const payload = getPageviewPayload();
  const w = window as LovableAnalyticsWindow;

  // Always send a direct route ping. The injected analytics script also hooks
  // pushState, but it uses a long-lived browser cookie and can hide repeat
  // same-browser visits in the page-level Visitors table.
  postDirectPageview(payload);

  try {
    if (typeof w.Tinybird?.trackEvent === "function") {
      w.Tinybird.trackEvent("page_hit", payload);
      return;
    }
  } catch {}

  if (attempt < 10) {
    window.setTimeout(() => trackPageview(attempt + 1), 200);
    return;
  }

  postDirectPageview(payload);
};

/**
 * SPA pageview tracker for Lovable's built-in analytics.
 * The injected script tracks the first page load, so this component sends
 * reliable pageviews only for in-app route changes.
 */
export const AnalyticsRouteTracker = () => {
  const location = useLocation();
  const lastPath = useRef<string | null>(null);
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!isAnalyticsHost()) return;

    const path = location.pathname + location.search + location.hash;
    if (lastPath.current === path) return;
    lastPath.current = path;

    hasMounted.current = true;

    // Fire immediately so repeat browser opens and TikTok in-app browser
    // flickers/quick-exits still count on the active route.
    trackPageview();
  }, [location.pathname, location.search, location.hash]);

  // Re-ping on tab visibility change and just before unload so short sessions
  // (TikTok webview flick-through) still register a heartbeat and the last route.
  useEffect(() => {
    if (!isAnalyticsHost()) return;

    let hiddenAt = 0;

    const ping = () => {
      try { trackPageview(); } catch {}
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        ping();
        return;
      }

      if (document.visibilityState === "visible" && hiddenAt && Date.now() - hiddenAt > 5000) {
        resetPageLoadSessionId();
        ping();
      }
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        resetPageLoadSessionId();
        ping();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", ping);
    window.addEventListener("beforeunload", ping);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", ping);
      window.removeEventListener("beforeunload", ping);
    };
  }, []);

  return null;
};

export default AnalyticsRouteTracker;
