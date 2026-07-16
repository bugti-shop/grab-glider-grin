import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

type LovableAnalyticsWindow = Window & {
  Tinybird?: {
    trackEvent?: (name: string, payload: Record<string, unknown>) => void;
  };
};

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

const getSessionId = () => {
  const existing = readCookie("session-id");
  if (existing) return existing;

  const id = randomId();
  document.cookie = `session-id=${encodeURIComponent(id)}; Max-Age=1800; path=/; secure; SameSite=Lax`;
  return id;
};

const getProxyUrl = () => {
  const script = document.querySelector<HTMLScriptElement>('script[src*="/~flock.js"]');
  return script?.getAttribute("data-proxy-url") || "/~api/analytics";
};

const getPageviewPayload = (): Record<string, unknown> => ({
  "user-agent": window.navigator.userAgent,
  locale: window.navigator.languages?.[0] || window.navigator.language || "en",
  referrer: document.referrer,
  pathname: window.location.pathname,
  href: window.location.href,
});

const postFallbackPageview = (payload: Record<string, unknown>) => {
  const body = JSON.stringify({
    timestamp: new Date().toISOString(),
    action: "page_hit",
    version: "1",
    session_id: getSessionId(),
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

  postFallbackPageview(payload);
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

    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    const timer = window.setTimeout(() => trackPageview(), 350);
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.search, location.hash]);

  return null;
};

export default AnalyticsRouteTracker;
