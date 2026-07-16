import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Fires a pageview to Lovable's built-in analytics (Umami-compatible)
 * on every client-side route change. Without this, SPA navigation is
 * invisible to the hosting analytics — only the initial landing page
 * gets counted, which inflates bounce rate and hides real usage.
 */
export const AnalyticsRouteTracker = () => {
  const location = useLocation();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    const path = location.pathname + location.search;
    if (lastPath.current === path) return;
    lastPath.current = path;

    // Skip preview / iframe hosts — analytics only runs on real published domain
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

    // Update document title-based referrer for the tracker
    try {
      // Umami (used by Lovable analytics)
      const w = window as unknown as {
        umami?: { track: (fn?: (props: Record<string, unknown>) => Record<string, unknown>) => void };
      };
      if (w.umami && typeof w.umami.track === "function") {
        w.umami.track((props) => ({
          ...props,
          url: path,
          referrer: document.referrer,
          title: document.title,
        }));
        return;
      }
    } catch {}

    // Fallback: dispatch a synthetic popstate so any listening analytics
    // script that hooks history changes gets a signal.
    try {
      window.dispatchEvent(new Event("lovable:pageview"));
    } catch {}
  }, [location.pathname, location.search]);

  return null;
};

export default AnalyticsRouteTracker;
