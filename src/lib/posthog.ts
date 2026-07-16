import posthog from "posthog-js";

const POSTHOG_KEY = "phc_yRhqpnfGRUkT36Rsnf4tAhr2rFxWjinm7QmRJCyaeyq9";
const POSTHOG_HOST = "https://us.i.posthog.com";

let initialized = false;

const shouldEnable = () => {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  // Skip preview + localhost so dev traffic doesn't pollute analytics.
  if (
    host.includes("id-preview--") ||
    host.includes("lovableproject.com") ||
    host === "localhost" ||
    host === "127.0.0.1"
  ) {
    return false;
  }
  return true;
};

export const initPostHog = () => {
  if (initialized || !shouldEnable()) return;
  try {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
      rageclick: true,
      persistence: "localStorage+cookie",
      session_recording: {
        maskAllInputs: true,
      },
      disable_session_recording: false,
      loaded: () => {
        initialized = true;
      },
    });
    initialized = true;
  } catch (e) {
    console.warn("[PostHog] init failed", e);
  }
};

export const identifyUser = (userId: string, props?: Record<string, unknown>) => {
  if (!initialized) return;
  try {
    posthog.identify(userId, props);
  } catch {}
};

export const resetPostHog = () => {
  if (!initialized) return;
  try {
    posthog.reset();
  } catch {}
};

export const capturePageview = (path?: string) => {
  if (!initialized) return;
  try {
    posthog.capture("$pageview", path ? { $current_url: window.location.origin + path } : undefined);
  } catch {}
};

export { posthog };
