// Edge function: parse a receipt photo → structured JSON + expense-note HTML.
// Uses Lovable AI Gateway (google/gemini-3-flash-preview) with vision + tool call.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ExtractRequest {
  imageBase64: string;
  webUnlockCode?: string;
}

const AI_GATEWAY_TIMEOUT_MS = 40_000;
const WEB_UNLOCK_CODE = "mustafabugti890";
const MAX_IMAGE_BASE64_BYTES = 8 * 1024 * 1024;

const escapeHtml = (v: string) =>
  String(v).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Sign in required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const accessToken = authHeader.replace("Bearer ", "");
    if (!accessToken || accessToken === anonKey) {
      return new Response(JSON.stringify({ error: "Sign in required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await sb.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = String(userData.user.id || "");
    const userEmail = String(userData.user.email || "").toLowerCase();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as ExtractRequest;
    const rawImage = (body.imageBase64 || "").trim();
    if (!rawImage) {
      return new Response(JSON.stringify({ error: "Missing image" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (rawImage.length > MAX_IMAGE_BASE64_BYTES) {
      return new Response(JSON.stringify({ error: "Image too large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: ents } = await admin
      .from("user_entitlements")
      .select("is_active, expires_at, grace_period_expires_at, in_billing_retry")
      .or(
        userEmail
          ? `app_user_id.eq.${userId},app_user_id.eq.${userEmail}`
          : `app_user_id.eq.${userId}`,
      );
    const nowMs = Date.now();
    const hasWebUnlock = body.webUnlockCode === WEB_UNLOCK_CODE;
    const isPro = hasWebUnlock || (ents || []).some((e: any) => {
      if (!e?.is_active) return false;
      const exp = e.expires_at ? new Date(e.expires_at).getTime() : Infinity;
      const grace = e.grace_period_expires_at ? new Date(e.grace_period_expires_at).getTime() : 0;
      return exp > nowMs || grace > nowMs || e.in_billing_retry;
    });
    if (!isPro) {
      return new Response(
        JSON.stringify({ error: "Receipt scanning is a Pro feature. Please upgrade to continue." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const imageUrl = rawImage.startsWith("data:")
      ? rawImage
      : `data:image/jpeg;base64,${rawImage}`;

    const systemPrompt = `You are a receipt-parsing vision model. Extract structured expense data from a photo of a receipt, bill, or invoice.

Rules:
- Detect the MERCHANT name (top of receipt, biggest text, or logo caption).
- Detect the TOTAL amount (labeled Total / Grand Total / Amount Due / Balance). Prefer the final total AFTER tax and discounts.
- Detect the CURRENCY code (ISO 4217 if visible: USD, EUR, GBP, PKR, INR, AED, etc.). If only a symbol is visible, infer the most likely code. If unknown, use "".
- Detect the DATE in ISO YYYY-MM-DD format. If only day/month is visible, guess the current year.
- Extract LINE ITEMS: each item's name, quantity (default 1), unit price if visible, and line total.
- Extract TAX amount if listed separately.
- Detect the CATEGORY (one of: Food, Groceries, Transport, Fuel, Shopping, Entertainment, Utilities, Healthcare, Travel, Business, Other).
- If a field cannot be read, leave it empty ("") or 0. Never invent values.

Return ONLY via the tool call.`;

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        signal: AbortSignal.timeout(AI_GATEWAY_TIMEOUT_MS),
        headers: { "Lovable-API-Key": LOVABLE_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: "Parse this receipt into structured expense data." },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_receipt",
                description: "Return structured receipt fields.",
                parameters: {
                  type: "object",
                  properties: {
                    merchant: { type: "string" },
                    total: { type: "number" },
                    currency: { type: "string", description: "ISO 4217 code, e.g. USD, EUR, PKR" },
                    date: { type: "string", description: "YYYY-MM-DD" },
                    tax: { type: "number" },
                    category: { type: "string" },
                    paymentMethod: { type: "string", description: "cash, card, mobile-pay, etc." },
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          qty: { type: "number" },
                          unitPrice: { type: "number" },
                          lineTotal: { type: "number" },
                        },
                        required: ["name"],
                        additionalProperties: false,
                      },
                    },
                    notes: { type: "string", description: "Anything else worth noting (max 120 chars)." },
                  },
                  required: ["merchant", "total", "currency", "date", "items"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "extract_receipt" } },
        }),
      },
    );

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const txt = await aiResponse.text();
      console.error("AI gateway error", aiResponse.status, txt);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResponse.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "Could not read receipt" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: any = {};
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool args", e);
      return new Response(JSON.stringify({ error: "Bad AI response" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const merchant = String(parsed.merchant || "").trim();
    const total = Number(parsed.total || 0);
    const currency = String(parsed.currency || "").trim().toUpperCase();
    const date = String(parsed.date || "").trim();
    const tax = Number(parsed.tax || 0);
    const category = String(parsed.category || "Other").trim();
    const paymentMethod = String(parsed.paymentMethod || "").trim();
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const notes = String(parsed.notes || "").trim();

    const money = (n: number) => `${currency ? currency + " " : ""}${Number(n).toFixed(2)}`;

    // Build a rich HTML note the editor can render directly.
    const itemsRows = items
      .map((it: any) => {
        const name = escapeHtml(String(it.name || ""));
        const qty = Number(it.qty || 1);
        const unit = Number(it.unitPrice || 0);
        const line = Number(it.lineTotal || (unit * qty) || 0);
        return `<tr><td>${name}</td><td style="text-align:center">${qty}</td><td style="text-align:right">${money(unit)}</td><td style="text-align:right">${money(line)}</td></tr>`;
      })
      .join("");

    const html =
      `<h2>${escapeHtml(merchant || "Receipt")}</h2>` +
      `<p><strong>Total:</strong> ${money(total)}` +
      (date ? ` &middot; <strong>Date:</strong> ${escapeHtml(date)}` : "") +
      (category ? ` &middot; <strong>Category:</strong> ${escapeHtml(category)}` : "") +
      (paymentMethod ? ` &middot; <strong>Paid:</strong> ${escapeHtml(paymentMethod)}` : "") +
      `</p>` +
      (items.length
        ? `<table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>${itemsRows}</tbody></table>`
        : "") +
      (tax ? `<p><em>Tax:</em> ${money(tax)}</p>` : "") +
      (notes ? `<p>${escapeHtml(notes)}</p>` : "");

    const suggestedTitle = merchant
      ? `${merchant} · ${money(total)}${date ? ` · ${date}` : ""}`
      : `Receipt · ${money(total)}${date ? ` · ${date}` : ""}`;

    return new Response(
      JSON.stringify({
        merchant, total, currency, date, tax, category, paymentMethod, items, notes,
        html, title: suggestedTitle,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ai-extract-receipt error", e);
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return new Response(
      JSON.stringify({ error: timedOut ? "Receipt scan timed out" : "An unexpected error occurred" }),
      { status: timedOut ? 504 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
