// Records a first-open "install conversion" for the Flowist smart link.
// Called by the native app (Capacitor) on its very first launch.
// Body: { click_id?, platform, install_referrer?, device_hash, app_version? }

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

// Pull click_id out of Play Store install referrer strings like:
//   "utm_source=flowist&click_id=<uuid>" or "click_id%3D<uuid>&utm_..."
function extractClickIdFromReferrer(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const decoded = (() => { try { return decodeURIComponent(ref); } catch { return ref; } })();
  const m = decoded.match(/click_id=([0-9a-fA-F-]{36})/);
  return m ? m[1] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const platform: string = String(body?.platform || "unknown").slice(0, 24);
    const install_referrer: string | null = body?.install_referrer ? String(body.install_referrer).slice(0, 500) : null;
    const app_version: string | null = body?.app_version ? String(body.app_version).slice(0, 32) : null;
    const rawDeviceHash: string | null = body?.device_hash ? String(body.device_hash).slice(0, 128) : null;
    const suppliedClickId: string | null = typeof body?.click_id === "string" && /^[0-9a-fA-F-]{36}$/.test(body.click_id) ? body.click_id : null;

    const ua = req.headers.get("user-agent") || "";
    const country = req.headers.get("cf-ipcountry") || req.headers.get("x-vercel-ip-country") || null;

    const device_hash = rawDeviceHash ? (await sha256(rawDeviceHash + ":flowist-conv")).slice(0, 32) : null;

    // Resolve click_id — prefer explicit, else parse from install referrer.
    const click_id = suppliedClickId || extractClickIdFromReferrer(install_referrer);

    let matched = false;
    if (click_id) {
      const { data: updated } = await supabase
        .from("smart_link_clicks")
        .update({
          converted_at: new Date().toISOString(),
          conversion_platform: platform,
          conversion_install_referrer: install_referrer,
          conversion_device_hash: device_hash,
        })
        .eq("click_id", click_id)
        .is("converted_at", null)
        .select("id")
        .maybeSingle();
      matched = !!updated;
    }

    await supabase.from("smart_link_conversions").insert({
      click_id,
      platform,
      install_referrer,
      device_hash,
      app_version,
      user_agent: ua.slice(0, 500),
      country,
      matched,
    });

    return new Response(JSON.stringify({ ok: true, matched, click_id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
