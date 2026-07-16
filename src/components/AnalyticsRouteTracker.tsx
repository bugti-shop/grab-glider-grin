import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Belt-and-suspenders SPA pageview tracker for Lovable's built-in
 * analytics (flock.js → Tinybird). flock already hooks history.pushState
 * so React Router navigations fire automatically, but on some browsers
 * (in-app WebViews, back/forward cache) the hook can be bypassed.
 * We call Tinybird.trackEvent directly on every route change as a fallback.
 */
export const AnalyticsRouteTracker = () => {
  const location = useLocation();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    const path = location.pathname + location.search;
    if (lastPath.current === path) return;
    lastPath.current = path;

    // Skip preview / localhost — analytics script only loads on published domain
    try {
      const host = window.location.hostname;
      if (
        host.includes("id-preview--") ||
        host.includes("lovableproject.com") ||
        host === "localhost" ||
        host === "127.0.0.1"
      ) {
        return;
      }
    } catch {}

    try {
      const w = window as unknown as {
        Tinybird?: { trackEvent?: (name?: string) => void };
      };
      if (w.Tinybird && typeof w.Tinybird.trackEvent === "function") {
        w.Tinybird.trackEvent("page_hit");
      }
    } catch {}
  }, [location.pathname, location.search]);

  return null;
};

export default AnalyticsRouteTracker;
