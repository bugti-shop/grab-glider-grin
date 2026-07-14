import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const APP_STORE_URL = "https://apps.apple.com/us/app/flowist-notes-tasks-habits/id6772996510";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=nota.npd.com";
const WEB_FALLBACK_URL = "https://flowist.me/";

function detectTarget(): { target: "ios" | "android" | "other"; url: string } {
  if (typeof navigator === "undefined") return { target: "other", url: WEB_FALLBACK_URL };
  const ua = navigator.userAgent || "";
  // iPadOS 13+ masquerades as Mac; use touch points to detect iPad.
  const isIPadOS =
    /Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/i.test(ua) || isIPadOS) return { target: "ios", url: APP_STORE_URL };
  if (/Android/i.test(ua)) return { target: "android", url: PLAY_STORE_URL };
  return { target: "other", url: WEB_FALLBACK_URL };
}

export default function SmartLink() {
  useEffect(() => {
    const { target, url } = detectTarget();
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("s") || "default";

    // Fire-and-forget tracking. Do NOT await — redirect must feel instant.
    try {
      supabase.functions
        .invoke("smart-link-track", {
          body: {
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

  // Minimal fallback UI in case redirect is blocked.
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
