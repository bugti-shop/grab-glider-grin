// Edge function: extract a list of tasks from an image of a paper / sticky-note board
// using Lovable AI Gateway with vision (google/gemini-3-flash-preview).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ExtractRequest {
  imageBase64: string; // data URL or raw base64 of a JPEG/PNG image
  scanMode?: "tasks" | "object_count";
  folders?: { id: string; name: string }[];
  sections?: { id: string; name: string }[];
  nowIso?: string;
  timezone?: string;
  languageCode?: string;
  languageName?: string;
  webUnlockCode?: string;
}

const AI_GATEWAY_TIMEOUT_MS = 120_000;
// Pro is verified server-side via entitlements plus web Stripe subscriptions.
const STRIPE_GRACE_PERIOD_MS = 2 * 24 * 60 * 60 * 1000;
const REVENUECAT_ENTITLEMENT_ID = "Pro";

// Allow large scans (dense pages of ~2000 tasks). Base64 grows ~1.37x
// the raw byte size, so 32 MB base64 ~ 24 MB image payload.
const MAX_IMAGE_BASE64_BYTES = 32 * 1024 * 1024;

const verifyRevenueCatAccess = async (admin: any, identifiers: string[]) => {
  const rcSecret = Deno.env.get("REVENUECAT_SECRET_API_KEY");
  if (!rcSecret || identifiers.length === 0) return false;

  for (const identifier of identifiers) {
    try {
      const res = await fetch(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(identifier)}`,
        {
          headers: {
            Authorization: `Bearer ${rcSecret}`,
            Accept: "application/json",
          },
        },
      );
      if (res.status === 404) continue;
      if (!res.ok) {
        console.warn("RevenueCat verify failed", { status: res.status });
        continue;
      }

      const data = await res.json();
      const entitlement = data?.subscriber?.entitlements?.[REVENUECAT_ENTITLEMENT_ID];
      if (!entitlement) continue;

      const expiresAt = entitlement.expires_date ? new Date(entitlement.expires_date).getTime() : Infinity;
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) continue;

      const rows = identifiers.map((appUserId) => ({
        app_user_id: appUserId,
        is_active: true,
        product_id: entitlement.product_identifier || entitlement.product_id || "revenuecat_pro",
        expires_at: entitlement.expires_date || null,
        grace_period_expires_at: null,
      }));
      await admin.from("user_entitlements").upsert(rows, { onConflict: "app_user_id" });
      return true;
    } catch (e) {
      console.warn("RevenueCat verify error", String(e));
    }
  }
  return false;
};

const hasActiveProAccess = async (admin: any, userId: string, userEmail: string) => {
  const identifiers = Array.from(new Set([userId, userEmail].filter(Boolean)));
  const nowMs = Date.now();

  if (identifiers.length) {
    const { data: ents } = await admin
      .from("user_entitlements")
      .select("is_active, expires_at, grace_period_expires_at")
      .in("app_user_id", identifiers);

    const hasEntitlement = (ents || []).some((e: any) => {
      if (!e?.is_active) return false;
      const exp = e.expires_at ? new Date(e.expires_at).getTime() : Infinity;
      const grace = e.grace_period_expires_at ? new Date(e.grace_period_expires_at).getTime() : 0;
      return exp > nowMs || grace > nowMs;
    });
    if (hasEntitlement) return true;
  }

  if (await verifyRevenueCatAccess(admin, identifiers)) return true;

  if (!userEmail) return false;
  const { data: subs } = await admin
    .from("subscriptions")
    .select("status, current_period_end")
    .eq("user_email", userEmail)
    .in("status", ["active", "trialing", "past_due"])
    .order("updated_at", { ascending: false })
    .limit(3);

  return (subs || []).some((sub: any) => {
    if (sub.status === "active" || sub.status === "trialing") return true;
    if (sub.status !== "past_due" || !sub.current_period_end) return false;
    return Date.now() < new Date(sub.current_period_end).getTime() + STRIPE_GRACE_PERIOD_MS;
  });
};

const hashIdentifier = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
};

const getAnonymousIdentifier = async (req: Request) => {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown-ip";
  const userAgent = req.headers.get("user-agent") || "unknown-agent";
  return `anon_${await hashIdentifier(`${ip}|${userAgent}`)}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Prefer authenticated users; allow legacy anonymous scans through a
    // server-derived anonymous identifier so clients cannot write counters directly.
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
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as ExtractRequest;
    const rawImage = (body.imageBase64 || "").trim();
    if (!rawImage) {
      return new Response(JSON.stringify({ error: "Missing image" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (rawImage.length > MAX_IMAGE_BASE64_BYTES) {
      return new Response(JSON.stringify({ error: "Image too large" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client for entitlement + usage enforcement
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const isPro = await hasActiveProAccess(admin, userId, userEmail);

    if (!isPro) {
      return new Response(
        JSON.stringify({ error: "AI task extraction is a Pro feature. Please upgrade to continue." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const refundUsage = async () => { /* no-op: Pro only */ };

    // Normalize to a data URL
    const imageUrl = rawImage.startsWith("data:")
      ? rawImage
      : `data:image/jpeg;base64,${rawImage}`;

    const folders = body.folders || [];
    const sections = body.sections || [];
    const now = body.nowIso || new Date().toISOString();
    const tz = body.timezone || "UTC";
    const langCode = body.languageCode || "en";
    const langName = body.languageName || "English";

    if (body.scanMode === "object_count") {
      const objectPrompt = `You are a precise vision object counter for productivity scanning.

Analyze the image and count the distinct visible physical objects. Group similar objects together with clear labels AND return a bounding box for EACH individual object instance (not each group).

Bounding box format: [ymin, xmin, ymax, xmax] normalized to 0-1000 (Gemini standard). ymin/ymax are vertical (top-to-bottom), xmin/xmax are horizontal (left-to-right).

Rules:
- Count only visible, concrete objects in the photo.
- Ignore screen UI, scanner overlays, decorative blur, shadows, and unreadable background noise.
- For handwritten sticky notes or papers, count notes/pages separately from the written tasks.
- Every object you count MUST have a corresponding bounding box in "detections".
- Keep detections tight to the object; do not include huge background regions.
- If the image is unclear, still return your best conservative estimate.
- Return strictly via the tool call.`;

      const aiResponse = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          signal: AbortSignal.timeout(AI_GATEWAY_TIMEOUT_MS),
          headers: {
            "Lovable-API-Key": LOVABLE_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: objectPrompt },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Count the visible objects in this image, group similar ones, and return a bounding box for every individual object instance.",
                  },
                  { type: "image_url", image_url: { url: imageUrl } },
                ],
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "count_objects",
                  description: "Return grouped object counts + per-instance bounding boxes for the image.",
                  parameters: {
                    type: "object",
                    properties: {
                      totalCount: { type: "integer", minimum: 0 },
                      summary: { type: "string" },
                      objectCounts: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            label: { type: "string" },
                            count: { type: "integer", minimum: 0 },
                            confidence: {
                              type: "string",
                              enum: ["high", "medium", "low"],
                            },
                          },
                          required: ["label", "count", "confidence"],
                          additionalProperties: false,
                        },
                      },
                      detections: {
                        type: "array",
                        description: "One entry per individual object instance with a bounding box.",
                        items: {
                          type: "object",
                          properties: {
                            label: { type: "string" },
                            box: {
                              type: "array",
                              description: "[ymin, xmin, ymax, xmax] normalized 0-1000",
                              items: { type: "number" },
                              minItems: 4,
                              maxItems: 4,
                            },
                          },
                          required: ["label", "box"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["totalCount", "summary", "objectCounts", "detections"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: {
              type: "function",
              function: { name: "count_objects" },
            },
          }),
        },
      );

      if (!aiResponse.ok) {
        if (aiResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        if (aiResponse.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const txt = await aiResponse.text();
        console.error("AI gateway object count error", aiResponse.status, txt);
        return new Response(JSON.stringify({ error: "AI gateway error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await aiResponse.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) {
        return new Response(JSON.stringify({ totalCount: 0, summary: "No objects counted", objectCounts: [], detections: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let parsed: { totalCount?: number; summary?: string; objectCounts?: unknown[]; detections?: unknown[] } = {};
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("Failed to parse object count tool args", e);
        return new Response(JSON.stringify({ error: "Bad AI response" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          totalCount: Number.isFinite(parsed.totalCount) ? parsed.totalCount : 0,
          summary: typeof parsed.summary === "string" ? parsed.summary : "Objects counted",
          objectCounts: Array.isArray(parsed.objectCounts) ? parsed.objectCounts : [],
          detections: Array.isArray(parsed.detections) ? parsed.detections : [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const systemPrompt = `You are an expert multilingual vision-based task extractor specialized in HANDWRITTEN notes (cursive, print, messy handwriting on paper, sticky-notes, whiteboards, planners, bullet journals).

Carefully read EVERY distinct task in the image and extract ALL metadata cues — explicit or implicit — that the writer marked down. Be thorough: people scribble dates, times, priorities, folders, tags and repeats in many shorthand ways and you must catch them.

Current datetime (ISO): ${now}
User timezone: ${tz}
Primary language hint: ${langName} (${langCode}) — but the image may contain other languages; preserve each task in its ORIGINAL language.

Available folders (match by name, case-insensitive, fuzzy ok):
${folders.length ? folders.map((f) => `- ${f.name} (id: ${f.id})`).join("\n") : "(none)"}

Available sections:
${sections.length ? sections.map((s) => `- ${s.name} (id: ${s.id})`).join("\n") : "(none)"}

Detection rules — apply ALL of them:
- One entry per distinct task. Skip pure headers, decorative doodles, page numbers.
- "title": short, action-oriented, in the ORIGINAL language. Strip out dates, times, priority markers, folder/section labels, tags, repeat words, location prefixes.
- "description": extra context written under the task (notes, sub-detail, parenthetical clarifications). Null if none.

DATE & TIME — handwritten cues across languages:
- Relative words: today/tonight, tomorrow, day after tomorrow, yesterday, next Mon/Tue/…, this weekend, next week, next month, in 3 days, EOD, EOW, kal, parso, mañana, demain, غداً, 明天, 今天, 来週, etc.
- Explicit dates in any format: 12/05, 12-05-2026, 5 Dec, Dec 5, 05.12, 12月5日, etc. Resolve year from current datetime.
- Times: "3pm", "15:00", "morning", "noon", "midnight", "evening", "afternoon", "before lunch", "subah", "shaam", "صباحاً", "下午3点".
- Combine date+time into "dueDateIso" (ISO 8601 with the user timezone offset). Date only -> 09:00 local. Time only & clearly for today -> use today.
- "reminderIso": if writer wrote a separate reminder/alarm (e.g. "remind 1h before", "alarm 7am", "🔔 8pm"). Null otherwise.
- "deadlineIso": only if note explicitly says deadline / due by / must finish by / "DL" / "by EOD".

PRIORITY — map ANY of these:
- high: "!!!", "!!", URGENT, ASAP, IMP, ★, ⭐, 🔥, heavily underlined, circled, red ink, ALL-CAPS, "P1", "critical", "अति आवश्यक", "مهم جداً".
- medium: single "!", "P2", "medium", "should do".
- low: "P3", "low", "later", "someday", "if time", "→".
- none: nothing indicating urgency.
- "isUrgent": true ONLY for strongest cues (URGENT / ASAP / multiple !!! / 🔥 / starred & circled).

REPEAT:
- "repeatType": none | hourly | daily | weekly | weekdays | weekends | monthly | yearly.
- Recognize "every day", "daily", "every Monday", "weekly", "M-F", "weekdays", "Sat & Sun", "every month", "monthly bill", "yearly", "annual", "हर रोज़", "tous les jours", "毎日".
- "repeatDays": for weekly/weekdays/weekends, return array of 0-6 (Sun=0..Sat=6) when specific days are written.

FOLDER (STRONGLY PREFER FOLDERS OVER SECTIONS — sections should almost never be used):
- Treat any heading, title, category label, or grouping cue as a FOLDER, not a section. Do NOT split tasks into multiple sections just because they appear on separate lines under the same heading.
- If the page/note has ONE top title (e.g. "To-Do List", "Groceries", "Work", "Monday Plan") written above a list of tasks, put ALL those tasks in a SINGLE folder using that title as the folder name. Never create a new folder or section per task in that case.
- If an individual task explicitly names its own folder/project (e.g. "Call John [Work]", "Buy milk — Groceries", "#Home fix door", "Personal: gym"), place ONLY that task in that named folder. Other tasks without their own explicit folder stay in the page's overall folder (or Inbox).
- If a matching folder already exists in the list above, return its id in "folderId". Otherwise leave "folderId" null and put the label in "folderName" (short ≤ 30 chars, Title Case, writer's language).
- If a task has NO grouping cue at all AND the page has no overall title, set "folderName" to "Inbox" (or return the existing Inbox folder's id if present above). Do NOT leave folder empty.
- "sectionId" / "sectionName": leave BOTH null unless the writer very clearly drew a sub-grouping *inside* an already-named folder (rare). Default is null.

TAGS:
- "tags": any hashtags or @-tags ("#work", "#errand", "@home", "@call"). Return as plain strings WITHOUT the # or @.

LOCATION:
- "location": any place mentioned ("at gym", "@office", "Walmart", "home"). Null otherwise.

- If the image has no readable tasks, return an empty array.
- Return strictly via the tool call. Be aggressive about catching metadata — better to fill a field from a clear handwritten cue than leave it null.`;

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        signal: AbortSignal.timeout(AI_GATEWAY_TIMEOUT_MS),
        headers: {
          "Lovable-API-Key": LOVABLE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    "Extract every handwritten task visible in this image. Read carefully and capture every date, time, priority, folder/section, repeat, tag, and location cue the writer marked.",
                },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_tasks",
                description:
                  "Return all tasks detected in the image as a structured list with full metadata.",
                parameters: {
                  type: "object",
                  properties: {
                    tasks: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          description: { type: ["string", "null"] },
                          dueDateIso: { type: ["string", "null"] },
                          reminderIso: { type: ["string", "null"] },
                          deadlineIso: { type: ["string", "null"] },
                          priority: {
                            type: "string",
                            enum: ["high", "medium", "low", "none"],
                          },
                          isUrgent: { type: "boolean" },
                          folderId: { type: ["string", "null"] },
                          folderName: { type: ["string", "null"] },
                          sectionId: { type: ["string", "null"] },
                          sectionName: { type: ["string", "null"] },
                          repeatType: {
                            type: "string",
                            enum: [
                              "none",
                              "hourly",
                              "daily",
                              "weekly",
                              "weekdays",
                              "weekends",
                              "monthly",
                              "yearly",
                            ],
                          },
                          repeatDays: {
                            type: "array",
                            items: { type: "integer", minimum: 0, maximum: 6 },
                          },
                          tags: {
                            type: "array",
                            items: { type: "string" },
                          },
                          location: { type: ["string", "null"] },
                        },
                        required: ["title", "priority", "repeatType"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["tasks"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "extract_tasks" },
          },
        }),
      },
    );

    if (!aiResponse.ok) {
      await refundUsage();
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const txt = await aiResponse.text();
      console.error("AI gateway error", aiResponse.status, txt);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResponse.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ tasks: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: { tasks?: unknown[] } = {};
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool args", e);
      await refundUsage();
      return new Response(JSON.stringify({ error: "Bad AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];

    return new Response(JSON.stringify({ tasks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-extract-tasks-from-image error", e);
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return new Response(
      JSON.stringify({ error: timedOut ? "AI scan timed out" : "An unexpected error occurred" }),
      {
        status: timedOut ? 504 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

