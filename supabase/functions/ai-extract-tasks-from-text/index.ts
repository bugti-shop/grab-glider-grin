// Edge function: extract a structured list of tasks from arbitrary input text
// (pasted notes, email body, PDF text extracted client-side) using Lovable AI Gateway.
// Paid Pro users only.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ExtractRequest {
  text: string;
  sourceLabel?: string; // "email" | "pdf" | "text"
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
const MAX_INPUT_CHARS = 400_000;   // ~100 pages — anything above is truncated
const CHUNK_SIZE = 24_000;         // characters per AI call
const CHUNK_OVERLAP = 1_200;       // overlap so tasks spanning a boundary aren't lost
const MAX_PARALLEL_CHUNKS = 4;     // upper bound on concurrent AI calls

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

const hasActiveProAccess = async (
  admin: any,
  userId: string,
  userEmail: string,
  extraIdentifiers: string[] = [],
) => {
  const merged = [userId, userEmail, ...extraIdentifiers]
    .filter((v): v is string => typeof v === "string" && v.length > 0 && v.length < 256)
    .map((v) => v.trim())
    .filter(Boolean);
  const identifiers = Array.from(new Set(merged)).slice(0, 10);
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

/**
 * Split a long text into overlapping chunks, preferring paragraph/line boundaries
 * so tasks aren't sliced mid-sentence. Always returns at least one chunk.
 */
function chunkText(input: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  if (input.length <= size) return [input];
  const chunks: string[] = [];
  let start = 0;
  while (start < input.length) {
    let end = Math.min(start + size, input.length);
    if (end < input.length) {
      // try to back off to a natural boundary within the last 1500 chars
      const window = input.slice(Math.max(end - 1500, start), end);
      const candidates = [window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(". ")];
      const best = Math.max(...candidates);
      if (best > 200) end = Math.max(end - 1500, start) + best + 1;
    }
    chunks.push(input.slice(start, end));
    if (end >= input.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

/** Normalize a task title for dedupe across chunks. */
function normTitle(s: string): string {
  return (s || "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, " ").trim();
}

/**
 * Merge two extractions of the (likely) same task — keep the richer value for
 * each field so dates/priorities/repeat rules survive when one chunk had less
 * context than another.
 */
function mergeTask(a: any, b: any): any {
  const pick = <T,>(x: T, y: T): T => (x !== null && x !== undefined && x !== "" ? x : y);
  const priRank: Record<string, number> = { high: 3, medium: 2, low: 1, none: 0 };
  const repeatRank = (r: string) => (r && r !== "none" ? 1 : 0);
  const mergedTags = Array.from(new Set([...(a.tags || []), ...(b.tags || [])])).filter(Boolean);
  const mergedRepeatDays = Array.from(new Set([...(a.repeatDays || []), ...(b.repeatDays || [])])).sort();
  const aDesc = (a.description || "").length;
  const bDesc = (b.description || "").length;
  return {
    title: a.title.length >= b.title.length ? a.title : b.title,
    description: aDesc >= bDesc ? a.description : b.description,
    dueDateIso: pick(a.dueDateIso, b.dueDateIso),
    reminderIso: pick(a.reminderIso, b.reminderIso),
    deadlineIso: pick(a.deadlineIso, b.deadlineIso),
    priority: (priRank[a.priority] ?? 0) >= (priRank[b.priority] ?? 0) ? a.priority : b.priority,
    isUrgent: Boolean(a.isUrgent || b.isUrgent),
    folderId: pick(a.folderId, b.folderId),
    folderName: pick(a.folderName, b.folderName),
    sectionId: pick(a.sectionId, b.sectionId),
    sectionName: pick(a.sectionName, b.sectionName),
    repeatType: repeatRank(a.repeatType) >= repeatRank(b.repeatType) ? a.repeatType : b.repeatType,
    repeatDays: mergedRepeatDays.length ? mergedRepeatDays : undefined,
    tags: mergedTags.length ? mergedTags : undefined,
    location: pick(a.location, b.location),
  };
}

function dedupeAndMerge(all: any[]): any[] {
  const map = new Map<string, any>();
  for (const t of all) {
    if (!t || typeof t.title !== "string" || !t.title.trim()) continue;
    const key = normTitle(t.title);
    if (!key) continue;
    const prev = map.get(key);
    map.set(key, prev ? mergeTask(prev, t) : t);
  }
  return Array.from(map.values());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json()) as ExtractRequest;
    const clientIdentifiers = Array.isArray((body as any)?.clientIdentifiers)
      ? ((body as any).clientIdentifiers as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    const isPro = await hasActiveProAccess(admin, userId, userEmail, clientIdentifiers);
    if (!isPro) {
      return new Response(
        JSON.stringify({ error: "AI task extraction is a Pro feature. Please upgrade to continue." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rawText = (body.text || "").trim();
    if (!rawText) {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const text = rawText.length > MAX_INPUT_CHARS ? rawText.slice(0, MAX_INPUT_CHARS) : rawText;

    const folders = body.folders || [];
    const sections = body.sections || [];
    const now = body.nowIso || new Date().toISOString();
    const tz = body.timezone || "UTC";
    const langCode = body.languageCode || "en";
    const langName = body.languageName || "auto";
    const sourceLabel = body.sourceLabel || "text";

    const chunks = chunkText(text);
    const isChunked = chunks.length > 1;

    const buildSystemPrompt = (chunkIndex: number, chunkCount: number) => `You are an expert multilingual task extractor. The user has pasted ${sourceLabel === "email" ? "an EMAIL" : sourceLabel === "pdf" ? "TEXT EXTRACTED FROM A PDF" : "TEXT"}. Read it carefully and produce a clean, deduplicated list of every actionable task it implies, with full metadata.${chunkCount > 1 ? `\n\nNOTE: This is part ${chunkIndex + 1} of ${chunkCount} of a long document. Adjacent parts overlap; just extract every task you can see here — the server will merge duplicates across parts. Always carry forward dates, priorities, and repeat rules when you see them.` : ""}

Current datetime (ISO): ${now}
User timezone: ${tz}
Primary language hint: ${langName} (${langCode}) — preserve each task in its ORIGINAL language.

Available folders:
${folders.length ? folders.map((f) => `- ${f.name} (id: ${f.id})`).join("\n") : "(none)"}

Available sections:
${sections.length ? sections.map((s) => `- ${s.name} (id: ${s.id})`).join("\n") : "(none)"}

Rules:
- Extract EVERY actionable item. Treat requests, asks, follow-ups, deadlines, meeting prep, reply requirements, attachments to send, and reminders as tasks.
- For emails: extract sender's name from signature/From line into description if useful. Detect "by Friday", "before EOD", "reply by tomorrow", meeting times, etc.
- For PDFs: extract action items, agenda points, deliverables, due dates listed in tables/sections.
- "title": short, action-oriented imperative ("Reply to John about Q3 budget"). Strip dates/times/priorities from the title.
- "description": 1-3 sentence context pulled from the source; null if title is fully self-explanatory.
- "dueDateIso": ISO 8601 with user timezone offset. Date-only → 09:00 local. Use context to resolve relative dates.
- "reminderIso": only when source explicitly mentions a reminder/alarm.
- "deadlineIso": only when source uses words like deadline, due by, must finish by.
- "priority": high (URGENT/ASAP/!!!/critical/P1), medium (important/!/P2/should), low (someday/later/P3), none.
- "isUrgent": true only for strongest cues (URGENT, ASAP, !!!, critical).
- "repeatType": none|hourly|daily|weekly|weekdays|weekends|monthly|yearly. Detect "every Monday", "daily standup", "monthly report", etc.
- "repeatDays": 0-6 (Sun=0..Sat=6) for weekly/weekdays/weekends with specific days.
- FOLDER / SECTION: fuzzy match to available lists → return "folderId"/"sectionId". If the source clearly implies a NEW folder/section (project name, subject line, category heading) that is not in the lists, leave the id null AND set "folderName"/"sectionName" so the app can auto-create it. Keep the name short (≤ 30 chars). If no grouping cue exists, leave all four null.
- "tags": hashtags (#work), @mentions of contexts (@home), or topical keywords. No # or @ prefix.
- "location": any place mentioned. Null otherwise.
- Return [] if nothing actionable is found.
- Return strictly via the tool call.`;

    const callOnce = async (chunk: string, idx: number) => {
      const systemPrompt = buildSystemPrompt(idx, chunks.length);
      const res = await fetch(
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
            { role: "user", content: `Source type: ${sourceLabel}${chunks.length > 1 ? ` (part ${idx + 1}/${chunks.length})` : ""}\n\n---\n${chunk}\n---\n\nExtract every actionable task with full metadata.` },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_tasks",
                description: "Return all tasks detected with full metadata.",
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
                          priority: { type: "string", enum: ["high", "medium", "low", "none"] },
                          isUrgent: { type: "boolean" },
                          folderId: { type: ["string", "null"] },
                          folderName: { type: ["string", "null"] },
                          sectionId: { type: ["string", "null"] },
                          sectionName: { type: ["string", "null"] },
                          repeatType: {
                            type: "string",
                            enum: ["none","hourly","daily","weekly","weekdays","weekends","monthly","yearly"],
                          },
                          repeatDays: {
                            type: "array",
                            items: { type: "integer", minimum: 0, maximum: 6 },
                          },
                          tags: { type: "array", items: { type: "string" } },
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
          tool_choice: { type: "function", function: { name: "extract_tasks" } },
          }),
        },
      );
      return res;
    };

    // Run chunks with bounded concurrency.
    const results: any[][] = new Array(chunks.length);
    let cursor = 0;
    let fatal: { status: number; error: string } | null = null;
    const workers = Array.from({ length: Math.min(MAX_PARALLEL_CHUNKS, chunks.length) }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= chunks.length || fatal) return;
        try {
          const res = await callOnce(chunks[i], i);
          if (!res.ok) {
            if (res.status === 429) fatal = { status: 429, error: "Rate limit exceeded. Try again shortly." };
            else if (res.status === 402) fatal = { status: 402, error: "AI credits exhausted." };
            else {
              const txt = await res.text().catch(() => "");
              console.error("AI gateway error", res.status, txt, "chunk", i);
              results[i] = [];
            }
            continue;
          }
          const data = await res.json();
          const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
          if (!toolCall) { results[i] = []; continue; }
          let parsed: { tasks?: unknown[] } = {};
          try { parsed = JSON.parse(toolCall.function.arguments); }
          catch (e) { console.error("Failed to parse tool args (chunk", i, ")", e); results[i] = []; continue; }
          results[i] = Array.isArray(parsed.tasks) ? (parsed.tasks as any[]) : [];
        } catch (e) {
          console.error("chunk call failed", i, e);
          results[i] = [];
        }
      }
    });
    await Promise.all(workers);

    if (fatal) {
      return new Response(JSON.stringify({ error: fatal.error }), {
        status: fatal.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const flat = results.flat().filter(Boolean);
    const tasks = isChunked ? dedupeAndMerge(flat) : flat;
    return new Response(JSON.stringify({ tasks, chunks: chunks.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-extract-tasks-from-text error", e);
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return new Response(
      JSON.stringify({ error: timedOut ? "AI extraction timed out" : "An unexpected error occurred" }),
      { status: timedOut ? 504 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});