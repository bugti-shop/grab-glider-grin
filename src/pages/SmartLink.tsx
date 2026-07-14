import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const APP_STORE_URL = "https://apps.apple.com/us/app/flowist-notes-tasks-habits/id6772996510";
const PLAY_STORE_PKG = "nota.npd.com";
const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PLAY_STORE_PKG}`;
const WEB_FALLBACK_URL = "https://flowist.me/";

function detectTarget(): { target: "ios" | "android" | "other"; url: string } {
  if (typeof navigator === "undefined") return { target: "other", url: WEB_FALLBACK_URL };
  const ua = navigator.userAgent || "";
  const isIPadOS =
    /Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/i.test(ua) || isIPadOS) return { target: "ios", url: APP_STORE_URL };
  if (/Android/i.test(ua)) return { target: "android", url: PLAY_STORE_URL };
  return { target: "other", url: WEB_FALLBACK_URL };
}

// RFC4122 v4 — small, no dependency.
function uuidv4(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    // @ts-ignore
    return crypto.randomUUID();
  }
  const b = new Uint8Array(16);
  (crypto || (globalThis as any).msCrypto).getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10, 16).join("")}`;
}

function buildRedirectUrl(target: "ios" | "android" | "other", clickId: string, params: URLSearchParams): string {
  const utm_source = params.get("utm_source") || "flowist_smart_link";
  const utm_campaign = params.get("utm_campaign") || "smart_link";
  if (target === "android") {
    // Google Play install referrer — reachable in the app via InstallReferrerClient.
    const ref = `click_id=${clickId}&utm_source=${encodeURIComponent(utm_source)}&utm_medium=smart_link&utm_campaign=${encodeURIComponent(utm_campaign)}`;
    return `https://play.google.com/store/apps/details?id=${PLAY_STORE_PKG}&referrer=${encodeURIComponent(ref)}`;
  }
  if (target === "ios") {
    // App Store passes ct/pt through to Apple Search Ads / attribution SDKs.
    const u = new URL(APP_STORE_URL);
    u.searchParams.set("ct", clickId);
    u.searchParams.set("pt", "flowist");
    return u.toString();
  }
  return WEB_FALLBACK_URL;
}

export default function SmartLink() {
  useEffect(() => {
    const { target } = detectTarget();
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("s") || "default";

    // Generate the click_id up front so we can attach it to the store URL immediately —
    // no need to wait for a server round-trip before redirecting.
    const clickId = uuidv4();
    try { localStorage.setItem("flowist_last_click_id", clickId); } catch {}

    const url = buildRedirectUrl(target, clickId, params);

    // Fire-and-forget tracking. Do NOT await — redirect must feel instant.
    try {
      supabase.functions
        .invoke("smart-link-track", {
          body: {
            click_id: clickId,
            slug,
            target,
            reached_store: target !== "other",
            referrer: document.referrer || null,
            utm_source: params.get("utm_source"),
            utm_medium: params.get("utm_medium"),
            utm_campaign: params.get("utm_campaign"),
          },
        })
        .catch(() => {});
    } catch {}

    // Redirect immediately.
    window.location.replace(url);
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#fff",
      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      color: "#111",
      padding: 24,
      textAlign: "center",
    }}>
      <div>
        <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Opening Flowist…</h1>
        <p style={{ fontSize: 14, color: "#666", margin: "0 0 20px" }}>
          If nothing happens, choose your store:
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a href={APP_STORE_URL} style={{ background: "#111", color: "#fff", padding: "10px 18px", borderRadius: 10, textDecoration: "none", fontSize: 14 }}>App Store</a>
          <a href={PLAY_STORE_URL} style={{ background: "#3c78f0", color: "#fff", padding: "10px 18px", borderRadius: 10, textDecoration: "none", fontSize: 14 }}>Google Play</a>
        </div>
      </div>
    </div>
  );
}
