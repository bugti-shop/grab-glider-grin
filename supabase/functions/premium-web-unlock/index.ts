const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WEB_UNLOCK_CODE = "mustafabugti890";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Sign in required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { code } = await req.json().catch(() => ({ code: "" }));
    if (code !== WEB_UNLOCK_CODE) {
      return new Response(JSON.stringify({ error: "Invalid unlock link" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const accessToken = authHeader.replace("Bearer ", "");
    if (!accessToken || accessToken === anonKey) {
      return new Response(JSON.stringify({ error: "Sign in required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const expiresAt = new Date("2099-12-31T23:59:59.000Z").toISOString();
    const rows = [
      {
        app_user_id: String(userData.user.id),
        is_active: true,
        product_id: "web_premium_unlock",
        expires_at: expiresAt,
        grace_period_expires_at: null,
      },
    ];
    if (userData.user.email) {
      rows.push({
        app_user_id: String(userData.user.email).toLowerCase(),
        is_active: true,
        product_id: "web_premium_unlock",
        expires_at: expiresAt,
        grace_period_expires_at: null,
      });
    }

    const { error } = await admin
      .from("user_entitlements")
      .upsert(rows, { onConflict: "app_user_id" });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("premium-web-unlock error", e);
    return new Response(JSON.stringify({ error: "Could not unlock premium" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});