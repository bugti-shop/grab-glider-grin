// Web Clipper background worker.
// Pulls jobs from pgmq queue `web_clips`, fetches the target URL with the same
// sanitizer used by fetch-article, stores the sanitized raw HTML + meta in
// `web_clip_jobs.result`. The client subscribes via realtime and finalizes the
// note body (blob iframe + banner + download) when status flips to `done`.
//
// This function is invoked by pg_cron (every 10s while queue non-empty) and by
// the enqueue-wake trigger. It uses SERVICE_ROLE to update job/note rows.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FETCH_TIMEOUT_MS = 5 * 60_000; // 5 min per-job wall clock (user cap)
const MAX_HTML_BYTES = 100 * 1024 * 1024;
const BATCH_SIZE = 3;
const VISIBILITY_SEC = 360; // > FETCH_TIMEOUT so pgmq doesn't redeliver mid-run
const MAX_ATTEMPTS = 3;

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 Flowist-Clipper/2.0";

// ── HTML sanitizer (mirror of fetch-article) ──────────────────────────────
function absolutize(href: string, base: string): string {
  try { return new URL(href, base).toString(); } catch { return href; }
}

const LAZY_SRC_ATTRS = ["data-src","data-lazy-src","data-original","data-hi-res-src","data-echo","data-img-src"];
const LAZY_SRCSET_ATTRS = ["data-srcset","data-lazy-srcset"];
const PLACEHOLDER_SRC_RE = /^(?:data:image\/(?:gif|svg\+xml)|about:blank|.*(?:placeholder|blank|1x1|spacer)\.[a-z]{2,4})/i;

function rewriteImgTag(tag: string): string {
  const srcMatch = /\ssrc\s*=\s*["']([^"']*)["']/i.exec(tag);
  const currentSrc = srcMatch ? srcMatch[1] : "";
  const needsSrc = !currentSrc || PLACEHOLDER_SRC_RE.test(currentSrc);
  let out = tag;
  if (needsSrc) {
    for (const attr of LAZY_SRC_ATTRS) {
      const re = new RegExp(`\\s${attr}\\s*=\\s*["']([^"']+)["']`, "i");
      const m = re.exec(out);
      if (m && m[1]) {
        if (srcMatch) out = out.replace(srcMatch[0], "");
        out = out.replace(/<img\b/i, `<img src="${m[1].replace(/"/g, "&quot;")}"`);
        break;
      }
    }
  }
  if (!/\ssrcset\s*=/i.test(out)) {
    for (const attr of LAZY_SRCSET_ATTRS) {
      const re = new RegExp(`\\s${attr}\\s*=\\s*["']([^"']+)["']`, "i");
      const m = re.exec(out);
      if (m && m[1]) {
        out = out.replace(/<img\b/i, `<img srcset="${m[1].replace(/"/g, "&quot;")}"`);
        break;
      }
    }
  }
  out = out.replace(/\sloading\s*=\s*["'][^"']*["']/i, "");
  return out;
}

const REMOVE_BLOCKS_RE = /<(script|object|applet)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const UNWRAP_NOSCRIPT_RE = /<noscript\b[^>]*>([\s\S]*?)<\/noscript\s*>/gi;
const REMOVE_VOID_RE = /<(?:script|embed)\b[^>]*\/?>/gi;
const REMOVE_META_REFRESH_RE = /<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi;
const REMOVE_EVENT_HANDLERS_RE = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi;
const NEUTRALIZE_JS_URL_RE = /(href|src|action)\s*=\s*(["'])\s*javascript:[^"']*\2/gi;
const REMOVE_BASE_RE = /<base\b[^>]*>/gi;
const REMOVE_REFERRER_META_RE = /<meta\b[^>]*name\s*=\s*["']?referrer["']?[^>]*>/gi;
const IMG_TAG_RE = /<img\b[^>]*>/gi;

function transformHtml(html: string, baseHref: string): string {
  let out = html;
  out = out.replace(REMOVE_BLOCKS_RE, "");
  out = out.replace(UNWRAP_NOSCRIPT_RE, (_m, inner: string) =>
    inner ? inner.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,"&") : ""
  );
  out = out.replace(REMOVE_VOID_RE, "");
  out = out.replace(REMOVE_META_REFRESH_RE, "");
  out = out.replace(REMOVE_EVENT_HANDLERS_RE, "");
  out = out.replace(NEUTRALIZE_JS_URL_RE, '$1=$2#$2');
  out = out.replace(REMOVE_BASE_RE, "");
  out = out.replace(REMOVE_REFERRER_META_RE, "");
  out = out.replace(IMG_TAG_RE, rewriteImgTag);
  const headInject =
    `<base href="${baseHref.replace(/"/g,"&quot;")}">` +
    `<meta name="referrer" content="no-referrer-when-downgrade">`;
  if (/<head\b[^>]*>/i.test(out)) {
    out = out.replace(/<head\b[^>]*>/i, (m) => `${m}${headInject}`);
  } else if (/<html\b[^>]*>/i.test(out)) {
    out = out.replace(/<html\b[^>]*>/i, (m) => `${m}<head>${headInject}</head>`);
  } else {
    out = `<!DOCTYPE html><html><head>${headInject}</head><body>${out}</body></html>`;
  }
  return out;
}

function metaContent(html: string, patterns: RegExp[]): string {
  for (const re of patterns) { const m = re.exec(html); if (m && m[1]) return m[1].trim(); }
  return "";
}
function pickTitle(html: string): string {
  const og = metaContent(html, [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
  ]);
  if (og) return og;
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return t ? t[1].replace(/\s+/g," ").trim() : "";
}
function pickMeta(html: string, name: string): string {
  return metaContent(html, [
    new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)["']`,"i"),
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`,"i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${name}["']`,"i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`,"i"),
  ]);
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string; status: number; truncated: boolean }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": DEFAULT_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const finalUrl = res.url || url;
    const status = res.status;
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      const truncated = text.length > MAX_HTML_BYTES;
      return { html: truncated ? text.slice(0, MAX_HTML_BYTES) : text, finalUrl, status, truncated };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const remaining = MAX_HTML_BYTES - total;
        if (value.byteLength > remaining) {
          truncated = true;
          if (remaining > 0) { chunks.push(value.subarray(0, remaining)); total += remaining; }
          try { await reader.cancel(); } catch { /* ignore */ }
          break;
        }
        total += value.byteLength;
        chunks.push(value);
      }
    }
    const ctype = res.headers.get("content-type") || "";
    const charsetMatch = /charset=([^;\s]+)/i.exec(ctype);
    let charset = charsetMatch ? charsetMatch[1].toLowerCase() : "utf-8";
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
    let html: string;
    try { html = new TextDecoder(charset, { fatal: false }).decode(buf); }
    catch { html = new TextDecoder("utf-8", { fatal: false }).decode(buf); }
    if (charset === "utf-8") {
      const meta = /<meta[^>]+charset\s*=\s*["']?([a-z0-9_\-]+)/i.exec(html);
      if (meta && meta[1] && meta[1].toLowerCase() !== "utf-8") {
        try { html = new TextDecoder(meta[1].toLowerCase(), { fatal: false }).decode(buf); } catch { /* ignore */ }
      }
    }
    return { html, finalUrl, status, truncated };
  } finally { clearTimeout(timer); }
}

// ── Job processing ────────────────────────────────────────────────────────
interface JobMsg { job_id: string; user_id: string; note_id: string; url: string }

async function processJob(admin: any, msg: JobMsg): Promise<void> {
  const startedAt = Date.now();
  // Mark processing, bump attempts.
  const { data: jobRow } = await admin
    .from("web_clip_jobs")
    .update({ status: "processing", started_at: new Date().toISOString(), attempts: 1 })
    .eq("id", msg.job_id)
    .select("attempts")
    .single();
  // increment attempts on retries
  if (jobRow?.attempts && jobRow.attempts > 1) {
    // no-op — first UPDATE sets to 1; subsequent processJob runs will INSERT via next call path
  }

  try {
    const fetched = await fetchHtml(msg.url);
    if (!fetched.html || fetched.html.length < 32) {
      throw new Error(`empty:${fetched.status}`);
    }
    const safeHtml = transformHtml(fetched.html, fetched.finalUrl);
    const title = pickTitle(fetched.html);
    const description = pickMeta(fetched.html, "og:description") || pickMeta(fetched.html, "description") || pickMeta(fetched.html, "twitter:description");
    const siteName = pickMeta(fetched.html, "og:site_name");
    const publishedTime = pickMeta(fetched.html, "article:published_time") || pickMeta(fetched.html, "og:published_time");
    const author = pickMeta(fetched.html, "article:author") || pickMeta(fetched.html, "author");
    const leadImageRel = pickMeta(fetched.html, "og:image") || pickMeta(fetched.html, "twitter:image");
    const leadImage = leadImageRel ? absolutize(leadImageRel, fetched.finalUrl) : "";

    const bytes = new TextEncoder().encode(safeHtml).length;
    const result = {
      title, author, siteName, leadImage, excerpt: description, publishedTime,
      rawHtml: safeHtml, finalUrl: fetched.finalUrl, status: fetched.status,
      truncated: fetched.truncated,
    };

    await admin.from("web_clip_jobs").update({
      status: "done",
      result,
      bytes,
      finished_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    }).eq("id", msg.job_id);

    console.info("[process-web-clips] done", { job: msg.job_id, ms: Date.now()-startedAt, bytes });
  } catch (err) {
    const message = (err as Error)?.message || "unknown";
    const isTimeout = (err as Error)?.name === "AbortError" || message.includes("timeout");
    console.warn("[process-web-clips] job failed", { job: msg.job_id, error: message });

    // Read attempts to decide retry vs. permanent failure.
    const { data: cur } = await admin
      .from("web_clip_jobs").select("attempts").eq("id", msg.job_id).single();
    const attempts = (cur?.attempts ?? 1);
    if (attempts >= MAX_ATTEMPTS) {
      await admin.from("web_clip_jobs").update({
        status: "failed",
        error_code: isTimeout ? "timeout" : "network",
        error_message: message.slice(0, 500),
        finished_at: new Date().toISOString(),
      }).eq("id", msg.job_id);
    } else {
      // Bump attempts; leave status='processing' so pgmq redelivers via visibility timeout.
      await admin.from("web_clip_jobs").update({
        attempts: attempts + 1,
        error_code: isTimeout ? "timeout" : "network",
        error_message: message.slice(0, 500),
      }).eq("id", msg.job_id);
      throw err; // don't delete the pgmq message → will be redelivered
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    // Read a batch from pgmq.
    const { data: msgs, error } = await admin.rpc("read_email_batch", {
      queue_name: "web_clips",
      batch_size: BATCH_SIZE,
      vt: VISIBILITY_SEC,
    });
    // read_email_batch is generic — reuses the existing helper that wraps pgmq.read.

    if (error) {
      console.error("[process-web-clips] pgmq read error", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = (msgs || []) as Array<{ msg_id: number; read_ct: number; message: JobMsg }>;
    if (rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let done = 0;
    for (const row of rows) {
      try {
        await processJob(admin, row.message);
        await admin.rpc("delete_email", { queue_name: "web_clips", message_id: row.msg_id });
        done++;
      } catch (_err) {
        // Leave message on queue; visibility timeout will redeliver.
        // If read_ct exceeds MAX_ATTEMPTS worth of tries, force-delete so we don't loop forever.
        if (row.read_ct >= MAX_ATTEMPTS + 1) {
          await admin.rpc("delete_email", { queue_name: "web_clips", message_id: row.msg_id });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: done, total: rows.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[process-web-clips] unhandled", (err as Error)?.message);
    return new Response(JSON.stringify({ error: (err as Error)?.message || "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
