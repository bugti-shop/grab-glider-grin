import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Stripe Price IDs (Individual plans only — Family/Team are native iOS/Android)
const PRICE_IDS: Record<string, string> = {
  weekly: "price_1TRbliFAPtKh08jGPKXWPcPG",
  monthly: "price_1TR6SoFAPtKh08jGW4lfGDYt",
  yearly: "price_1TRbljFAPtKh08jGGf1qg42c",
};



// Free trial is handled through checkout for eligible monthly/yearly plans.

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { planType } = await req.json();
    if (!planType || !PRICE_IDS[planType]) {
      throw new Error(`Invalid plan type: ${planType}. Must be one of: ${Object.keys(PRICE_IDS).join(", ")}`);
    }
    const priceId = PRICE_IDS[planType];
    const seatQty = 1;




    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Try to get authenticated user (optional)
    let userEmail: string | undefined;
    let userId: string | undefined;
    const authHeader = req.headers.get("Authorization");
    if (authHeader && authHeader !== "Bearer ") {
      try {
        const supabaseClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_ANON_KEY") ?? ""
        );
        const token = authHeader.replace("Bearer ", "");
        const { data } = await supabaseClient.auth.getUser(token);
        userEmail = data.user?.email ?? undefined;
        userId = data.user?.id ?? undefined;
      } catch {
        // Auth failed — continue without user
      }
    }

    // Check if customer already exists (only if we have an email)
    let customerId: string | undefined;

    // Check if customer already has/had a subscription (no double trial)
    let hadPreviousSubscription = false;

    if (userEmail) {
      const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        // Check if they ever had a subscription (active, canceled, trialing, etc.)
        const allSubs = await stripe.subscriptions.list({ customer: customerId, limit: 1, status: "all" as any });
        hadPreviousSubscription = allSubs.data.length > 0;
      }
    }

    const origin = req.headers.get("origin") || "https://grab-all-the-things.lovable.app";

    // Build session config — offer 3-day free trial only to new customers
    const sessionConfig: any = {
      customer: customerId,
      customer_email: customerId ? undefined : userEmail,
      line_items: [{ price: priceId, quantity: seatQty }],
      mode: "subscription",
      payment_method_collection: "always",
      allow_promotion_codes: true,
      success_url: `${origin}/?stripe_success=true&plan=${planType}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
      metadata: { user_id: userId || "anonymous", plan_type: planType, seats: String(seatQty) },
      subscription_data: {},
    };

    // Web checkout: no free trial on any plan (trial is native-only)


    const session = await stripe.checkout.sessions.create(sessionConfig);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("create-checkout error:", message);
    const safe = (message.startsWith("Invalid plan type") || message.includes("plan is not configured") || message.includes("Team plan requires"))
      ? message : "An unexpected error occurred";

    return new Response(JSON.stringify({ error: safe }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
