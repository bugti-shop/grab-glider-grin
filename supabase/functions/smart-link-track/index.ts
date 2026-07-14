// Logs a smart-link click (Flowist download redirect page).
// verify_jwt is enabled by default for Lovable Cloud managed edge functions;
// this endpoint doesn't touch user data, so it works fine with the anon key
// the browser client uses via supabase.functions.invoke.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseUA(ua: string) {
  const u = ua || "";
  let os: string | null = null;
  let os_version: string | null = null;
  let device_type: string | null = "desktop";
  let device_vendor: string | null = null;
  let device_model: string | null = null;
  let browser: string | null = null;

  if (/iPad/i.test(u)) { os = "iOS"; device_type = "tablet"; device_vendor = "Apple"; device_model = "iPad"; }
  else if (/iPhone/i.test(u)) { os = "iOS"; device_type = "mobile"; device_vendor = "Apple"; device_model = "iPhone"; }
  else if (/Android/i.test(u)) {
    os = "Android";
    device_type = /Mobile/i.test(u) ? "mobile" : "tablet";
    const m = u.match(/Android\s([0-9.]+)/i); if (m) os_version = m[1];
    const modelMatch = u.match(/;\s*([^;)]+)\s+Build\//); if (modelMatch) device_model = modelMatch[1].trim();
  }
  else if (/Windows/i.test(u)) os = "Windows";
  else if (/Mac OS X/i.test(u)) { os = "macOS"; device_vendor = "Apple"; }
  else if (/Linux/i.test(u)) os = "Linux";

  if (!os_version && /iPhone OS ([0-9_]+)/i.test(u)) os_version = (u.match(/iPhone OS ([0-9_]+)/i)![1]).replace(/_/g, ".");

  if (/Edg\//i.test(u)) browser = "Edge";
  else if (/Chrome\//i.test(u) && !/Chromium/i.test(u)) browser = "Chrome";
  else if (/Firefox\//i.test(u)) browser = "Firefox";
  else if (/Safari\//i.test(u) && !/Chrome/i.test(u)) browser = "Safari";
  else if (/OPR\//i.test(u)) browser = "Opera";

  return { os, os_version, device_type, device_vendor, device_model, browser };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const {
      slug = "default",
      target = "other",
      reached_store = false,
      referrer = null,
      utm_source = null,
      utm_medium = null,
      utm_campaign = null,
    } = body || {};

    const ua = req.headers.get("user-agent") || "";
    const parsed = parseUA(ua);
    const language = (req.headers.get("accept-language") || "").split(",")[0] || null;

    // Geo from CDN headers (works when Supabase edge fronts through Cloudflare/Deno Deploy edge)
    const country =
      req.headers.get("cf-ipcountry") ||
      req.headers.get("x-vercel-ip-country") ||
      req.headers.get("x-country") ||
      null;
    const region =
      req.headers.get("cf-region") ||
      req.headers.get("x-vercel-ip-country-region") ||
      req.headers.get("x-region") ||
      null;
    const city =
      req.headers.get("cf-ipcity") ||
      req.headers.get("x-vercel-ip-city") ||
      req.headers.get("x-city") ||
      null;

    const rawIp =
      (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      "";
    const ip_hash = rawIp ? (await sha256(rawIp + ":flowist-smart-link")).slice(0, 32) : null;

    // Accept a client-supplied click_id (so the browser can attach it to the
    // Play Store `referrer` param before we've even round-tripped) or generate one.
    const suppliedClickId = typeof body?.click_id === "string" ? body.click_id : null;
    const click_id = suppliedClickId || crypto.randomUUID();

    await supabase.from("smart_link_clicks").insert({
      click_id,
      slug,
      target,
      reached_store,
      referrer,
      user_agent: ua.slice(0, 500),
      language,
      country,
      region,
      city,
      ip_hash,
      utm_source,
      utm_medium,
      utm_campaign,
      ...parsed,
    });

    return new Response(JSON.stringify({ ok: true, click_id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200, // never block the redirect on tracking errors
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
