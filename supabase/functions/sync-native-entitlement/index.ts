import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const REVENUECAT_SECRET_API_KEY = Deno.env.get("REVENUECAT_SECRET_API_KEY") || "";
const ENTITLEMENT_ID = "Pro";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const userClient = (authHeader: string) =>
  createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

const toIso = (value: unknown): string | null => {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const activeFromEntitlement = (entitlement: any) => {
  if (!entitlement) return false;
  const expiresAt = entitlement.expires_date ? new Date(entitlement.expires_date).getTime() : Infinity;
  return expiresAt > Date.now();
};

const fetchSubscriber = async (identifier: string) => {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(identifier)}`,
    {
      headers: {
        Authorization: `Bearer ${REVENUECAT_SECRET_API_KEY}`,
        Accept: "application/json",
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`RevenueCat ${res.status}`);
  return await res.json();
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!REVENUECAT_SECRET_API_KEY) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Sign in required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = userClient(authHeader);
    const { data: userData, error: userError } = await client.auth.getUser();
    const user = userData?.user;
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Sign in required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only trust identifiers derived from the authenticated session.
    // A client-supplied appUserID is intentionally ignored — otherwise an
    // attacker could reference someone else's active RevenueCat subscriber
    // and have entitlements written for their own user.id / email.
    await req.json().catch(() => ({}));
    const trustedIdentifiers = Array.from(
      new Set([user.id, user.email?.trim().toLowerCase()].filter(Boolean) as string[]),
    );

    if (trustedIdentifiers.length === 0) {
      return new Response(JSON.stringify({ error: "No identifier" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let matchedIdentifier = "";
    let entitlement: any = null;
    for (const identifier of trustedIdentifiers) {
      const data = await fetchSubscriber(identifier).catch((e) => {
        console.warn("RevenueCat lookup failed", String(e));
        return null;
      });
      const candidate = data?.subscriber?.entitlements?.[ENTITLEMENT_ID];
      if (activeFromEntitlement(candidate)) {
        matchedIdentifier = identifier;
        entitlement = candidate;
        break;
      }
    }

    if (!entitlement) {
      return new Response(JSON.stringify({ subscribed: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only write rows for the trusted (session-derived) identifiers.
    const payloads = trustedIdentifiers.map((identifier) => ({
      app_user_id: identifier,
      is_active: true,
      product_id: entitlement.product_identifier || entitlement.product_id || "revenuecat_pro",
      expires_at: toIso(entitlement.expires_date),
      grace_period_expires_at: null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await admin
      .from("user_entitlements")
      .upsert(payloads, { onConflict: "app_user_id" });


    if (error) {
      console.error("Native entitlement sync upsert failed", error);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ subscribed: true, matchedIdentifier, expires_at: toIso(entitlement.expires_date) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Native entitlement sync error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});