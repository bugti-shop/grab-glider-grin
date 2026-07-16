import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type LovableAnalyticsWindow = Window & {
  Tinybird?: {
    trackEvent?: (name: string, payload: Record<string, unknown>) => void;
  };
};

const SESSION_KEY = "flowist-analytics-session";
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min inactivity window

const isAnalyticsHost = () => {
  const host = window.location.hostname;
  return !(
    host.includes("id-preview--") ||
    host.includes("lovableproject.com") ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
};

const randomId = () => {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

type StoredSession = { id: string; ts: number };

const readStoredSession = (): StoredSession | null => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.id || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > SESSION_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeStoredSession = (s: StoredSession) => {
  try {
    const raw = JSON.stringify(s);
    sessionStorage.setItem(SESSION_KEY, raw);
    localStorage.setItem(SESSION_KEY, raw);
  } catch {}
};

const getSessionId = () => {
  const existing = readStoredSession();
  if (existing) {
    writeStoredSession({ id: existing.id, ts: Date.now() });
    return existing.id;
  }
  const fresh = { id: `flowist-${Date.now()}-${randomId()}`, ts: Date.now() };
  writeStoredSession(fresh);
  return fresh.id;
};

const getProxyUrl = () => {
  const script = document.querySelector<HTMLScriptElement>('script[src*="/~flock.js"]');
  return script?.getAttribute("data-proxy-url") || "/~api/analytics";
};

const normalizePath = (path: string) =>
  path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/[A-Za-z0-9_-]{16,}/g, "/:id")
    .replace(/\/\d+(?=\/|$)/g, "/:n");

const getPageviewPayload = (): Record<string, unknown> => {
  const pathname = normalizePath(window.location.pathname);
  return {
    "user-agent": window.navigator.userAgent,
    locale: window.navigator.languages?.[0] || window.navigator.language || "en",
    referrer: document.referrer,
    pathname,
    href: window.location.origin + pathname + window.location.search,
    title: document.title,
  };
};

const postDirectPageview = (payload: Record<string, unknown>) => {
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

  if (attempt < 5) {
    window.setTimeout(() => trackPageview(attempt + 1), 300);
    return;
  }

  // Fallback only if Tinybird never loaded
  postDirectPageview(payload);
};

const detectDevice = (): string => {
  const ua = navigator.userAgent.toLowerCase();
  if (/ipad|tablet|kindle|silk/i.test(ua)) return "tablet";
  if (/mobile|iphone|android/i.test(ua)) return "mobile";
  return "desktop";
};

const detectSource = (referrer: string): string => {
  if (!referrer) return "Direct";
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    if (host === window.location.hostname) return "Direct";
    return host;
  } catch {
    return "Direct";
  }
};

const logToOwnAnalytics = async (path: string) => {
  try {
    await supabase.from("page_events").insert({
      session_id: getSessionId(),
      path,
      referrer: document.referrer || null,
      source: detectSource(document.referrer),
      user_agent: navigator.userAgent,
      device: detectDevice(),
    });
  } catch {}
};

/**
 * SPA pageview tracker. Fires ONCE per real route change with a stable
 * session id so a single browser visit isn't multiplied into dozens of hits.
 */
export const AnalyticsRouteTracker = () => {
  const location = useLocation();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!isAnalyticsHost()) return;
    const path = location.pathname + location.search;
    if (lastPath.current === path) return;
    lastPath.current = path;
    trackPageview();
    void logToOwnAnalytics(normalizePath(location.pathname));
  }, [location.pathname, location.search]);

  return null;
};

export default AnalyticsRouteTracker;

