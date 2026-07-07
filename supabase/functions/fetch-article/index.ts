// Edge function: Evernote-style Web Clipper.
//
// Philosophy (per user requirement, 2026-07):
//   Just fetch the page's HTML, strip JS/executable content for safety, and
//   return a read-only snapshot. NO asset inlining, NO Readability trimming,
//   NO multi-UA retry gymnastics. Images / CSS / fonts stay at their
//   original absolute URLs (via <base href>) and load lazily inside the
//   sandboxed iframe on the client — same model Evernote uses.
//
// Public — no auth required.

// deno-lint-ignore-file no-explicit-any

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Keep the app from applying its own short timeout. The platform still has a
// hard execution ceiling, but this avoids killing large HTML pages prematurely.
const FETCH_TIMEOUT_MS = 12 * 60_000;
const MAX_HTML_BYTES = 200 * 1024 * 1024; // 200MB hard cap on raw HTML
const READER_FALLBACK_TIMEOUT_MS = 90_000;

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 Flowist-Clipper/2.0";

const CHALLENGE_RE = /enable\s+javascript\s+and\s+cookies|disable\s+(?:your\s+)?ad\s*blocker|please\s+enable\s+js|checking\s+your\s+browser|verify\s+you\s+are\s+human|access\s+to\s+this\s+page\s+has\s+been\s+denied|cloudflare|perimeterx|datadome/i;

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownishToHtml(markdown: string, baseHref: string): string {
  const lines = String(markdown || "").split(/\r?\n/);
  const body: string[] = [];
  let title = "";
  let inList = false;

  const closeList = () => {
    if (inList) {
      body.push("</ul>");
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    const titleMatch = /^Title:\s*(.+)$/i.exec(line);
    if (titleMatch) {
      title = title || titleMatch[1].trim();
      continue;
    }
    if (/^(URL Source|Published Time|Markdown Content|Warning):/i.test(line)) continue;

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      closeList();
      const level = Math.min(6, heading[1].length);
      body.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      if (!inList) {
        body.push("<ul>");
        inList = true;
      }
      body.push(`<li>${escapeHtml(bullet[1])}</li>`);
      continue;
    }

    closeList();
    const linked = escapeHtml(line).replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_m, text, href) => {
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
    });
    body.push(`<p>${linked}</p>`);
  }
  closeList();

  return `<!DOCTYPE html><html><head><base href="${escapeHtml(baseHref)}"><meta name="referrer" content="no-referrer-when-downgrade"><title>${escapeHtml(title)}</title></head><body>${body.join("\n")}</body></html>`;
}

async function jsonResponse(data: unknown, init: ResponseInit = {}): Promise<Response> {
  const json = JSON.stringify(data);
  const headers = new Headers({ ...corsHeaders, "Content-Type": "application/json", ...(init.headers || {}) });
  if (json.length < 128 * 1024 || typeof CompressionStream !== "function") {
    return new Response(json, { ...init, headers });
  }
  try {
    const stream = new Blob([json], { type: "application/json" }).stream().pipeThrough(new CompressionStream("gzip"));
    headers.set("Content-Encoding", "gzip");
    headers.set("Vary", "Accept-Encoding");
    return new Response(stream, { ...init, headers });
  } catch {
    return new Response(json, { ...init, headers });
  }
}

/**
 * Fallback: render the page through Jina Reader with the headless-browser
 * engine and ask for HTML back (not markdown). This preserves images,
 * layout, and works for JS-only pages (dashboards, earnings/traffic/backlink
 * reports, anti-bot walls that require JS+cookies).
 *
 * Docs: https://jina.ai/reader — headers X-Return-Format, X-Engine,
 * X-With-Images-Summary, X-With-Generated-Alt.
 */
async function fetchReaderFallback(url: string): Promise<{ html: string; finalUrl: string; status: number; truncated: boolean } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), READER_FALLBACK_TIMEOUT_MS);
  try {
    // r.jina.ai accepts the raw URL directly (with scheme).
    const readerUrl = `https://r.jina.ai/${url}`;
    const res = await fetch(readerUrl, {
      signal: ctrl.signal,
      headers: {
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "User-Agent": DEFAULT_UA,
        // Ask for the full rendered HTML — keeps <img>, <figure>, layout.
        "X-Return-Format": "html",
        // Use the headless browser so JS-rendered content actually resolves.
        "X-Engine": "browser",
        "X-With-Images-Summary": "true",
        "X-With-Generated-Alt": "true",
        // Give the page a moment to finish rendering before capture.
        "X-Timeout": "45",
      },
    });
    const text = await res.text();
    console.info("[fetch-article] reader(browser+html) fallback response", {
      url,
      readerUrl,
      status: res.status,
      chars: text.length,
      challenge: CHALLENGE_RE.test(text),
    });
    if (!res.ok || text.trim().length < 64 || CHALLENGE_RE.test(text)) return null;
    const truncated = text.length > MAX_HTML_BYTES;
    const html = truncated ? text.slice(0, MAX_HTML_BYTES) : text;
    return { html, finalUrl: url, status: res.status, truncated };
  } catch (err) {
    console.warn("[fetch-article] reader fallback failed", { url, error: (err as Error)?.message });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Heuristic: does the fetched HTML look like an empty JS shell (SPA that
 *  didn't render server-side)? If so we should retry via the browser
 *  fallback so we actually see the page contents (dashboards, reports, etc). */
function looksLikeEmptyShell(html: string): boolean {
  if (!html) return true;
  // Strip scripts/styles/tags to see how much VISIBLE text exists.
  const stripped = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const visibleLen = stripped.length;
  const imgCount = (html.match(/<img\b/gi) || []).length;
  // Very little text AND essentially no images → shell.
  if (visibleLen < 400 && imgCount < 2) return true;
  return false;
}

/** Absolute-URL resolver that never throws. */
function absolutize(href: string, base: string): string {
  try { return new URL(href, base).toString(); } catch { return href; }
}

/** ONE-PASS sanitizer + lazy-image promoter + head-injection.
 *  Consolidated to avoid catastrophic CPU on 200KB+ pages
 *  (Deno edge runtime kills long-running workers). */

const LAZY_SRC_ATTRS = ["data-src", "data-lazy-src", "data-original", "data-hi-res-src", "data-echo", "data-img-src"];
const LAZY_SRCSET_ATTRS = ["data-srcset", "data-lazy-srcset"];
const PLACEHOLDER_SRC_RE = /^(?:data:image\/(?:gif|svg\+xml)|about:blank|.*(?:placeholder|blank|1x1|spacer)\.[a-z]{2,4})/i;

/** Rewrite <img …> tags: promote lazy-src → src, kill loading=lazy. */
function rewriteImgTag(tag: string): string {
  // Extract current src (if any)
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

  // Kill native lazy loading so the sandboxed iframe fetches immediately.
  out = out.replace(/\sloading\s*=\s*["'][^"']*["']/i, "");
  return out;
}

/** Single-pass block-element remover (scripts, object, applet). */
const REMOVE_BLOCKS_RE = /<(script|object|applet)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
/** Keep <noscript> fallback images/content instead of deleting them. */
const UNWRAP_NOSCRIPT_RE = /<noscript\b[^>]*>([\s\S]*?)<\/noscript\s*>/gi;
/** Void/self-closing plugin tags. */
const REMOVE_VOID_RE = /<(?:script|embed)\b[^>]*\/?>/gi;
/** Meta refresh (would redirect iframe). */
const REMOVE_META_REFRESH_RE = /<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi;
/** Inline event handlers (quoted forms only — unquoted is rare and the greedy
 *  regex we used before was the CPU hog). */
const REMOVE_EVENT_HANDLERS_RE = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi;
/** javascript: URLs in href/src/action. */
const NEUTRALIZE_JS_URL_RE = /(href|src|action)\s*=\s*(["'])\s*javascript:[^"']*\2/gi;
/** Existing <base> / referrer meta — drop so we can re-inject cleanly. */
const REMOVE_BASE_RE = /<base\b[^>]*>/gi;
const REMOVE_REFERRER_META_RE = /<meta\b[^>]*name\s*=\s*["']?referrer["']?[^>]*>/gi;
/** <img …> tag matcher. */
const IMG_TAG_RE = /<img\b[^>]*>/gi;

/** Do all HTML transformations in as few passes as possible. */
function transformHtml(html: string, baseHref: string): string {
  let out = html;
  out = out.replace(REMOVE_BLOCKS_RE, "");
  out = out.replace(UNWRAP_NOSCRIPT_RE, (_match, inner: string) => {
    if (!inner) return "";
    return inner
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  });
  out = out.replace(REMOVE_VOID_RE, "");
  out = out.replace(REMOVE_META_REFRESH_RE, "");
  out = out.replace(REMOVE_EVENT_HANDLERS_RE, "");
  out = out.replace(NEUTRALIZE_JS_URL_RE, '$1=$2#$2');
  out = out.replace(REMOVE_BASE_RE, "");
  out = out.replace(REMOVE_REFERRER_META_RE, "");
  out = out.replace(IMG_TAG_RE, rewriteImgTag);

  const headInject =
    `<base href="${baseHref.replace(/"/g, "&quot;")}">` +
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

/** Very small meta-tag scraper — no DOM parser needed. */
function metaContent(html: string, patterns: RegExp[]): string {
  for (const re of patterns) {
    const m = re.exec(html);
    if (m && m[1]) return m[1].trim();
  }
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
  return t ? t[1].replace(/\s+/g, " ").trim() : "";
}

function pickMeta(html: string, name: string): string {
  return metaContent(html, [
    new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${name}["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"),
  ]);
}

/** Fetch with timeout + size cap. */
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
    if (!res.ok) {
      // Still try to read body — some sites 403 but include the page
    }
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
          if (remaining > 0) {
            chunks.push(value.subarray(0, remaining));
            total += remaining;
          }
          try { await reader.cancel(); } catch { /* ignore */ }
          break;
        }
        total += value.byteLength;
        chunks.push(value);
      }
    }
    // Detect charset
    const ctype = res.headers.get("content-type") || "";
    const charsetMatch = /charset=([^;\s]+)/i.exec(ctype);
    let charset = charsetMatch ? charsetMatch[1].toLowerCase() : "utf-8";
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.byteLength;
    }
    let html: string;
    try {
      html = new TextDecoder(charset, { fatal: false }).decode(buf);
    } catch {
      html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    }
    // If charset was default utf-8 but HTML declares a different one, re-decode
    if (charset === "utf-8") {
      const meta = /<meta[^>]+charset\s*=\s*["']?([a-z0-9_\-]+)/i.exec(html);
      if (meta && meta[1] && meta[1].toLowerCase() !== "utf-8") {
        try { html = new TextDecoder(meta[1].toLowerCase(), { fatal: false }).decode(buf); } catch { /* keep utf-8 */ }
      }
    }
    return { html, finalUrl, status, truncated };
  } finally {
    clearTimeout(timer);
  }
}

interface Body { url?: string; mode?: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  let body: Body;
  try { body = await req.json(); } catch {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawUrl = (body.url || "").trim();
  if (!rawUrl) {
    return jsonResponse({ error: "Missing url" }, { status: 400 });
  }
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch {
    return jsonResponse({ error: "Invalid URL" }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return jsonResponse({ error: "Only http(s) URLs are supported" }, { status: 400 });
  }

  console.info("[fetch-article] evernote-simple fetch", { url: parsed.toString() });

  let fetched: Awaited<ReturnType<typeof fetchHtml>>;
  try {
    fetched = await fetchHtml(parsed.toString());
  } catch (err) {
    const isAbort = (err as Error)?.name === "AbortError";
    console.warn("[fetch-article] fetch failed", { url: parsed.toString(), error: (err as Error)?.message, isAbort });
    return jsonResponse({
      error: isAbort ? "Upstream fetch timed out" : `Upstream fetch failed: ${(err as Error)?.message || "unknown"}`,
      code: isAbort ? "timeout" : "network",
    }, { status: 200 });
  }

  let { html: rawHtml, finalUrl, status, truncated } = fetched;

  if (CHALLENGE_RE.test(rawHtml)) {
    console.warn("[fetch-article] anti-bot/challenge page detected; trying reader fallback", { url: parsed.toString(), status });
    const fallback = await fetchReaderFallback(parsed.toString());
    if (fallback?.html) {
      console.info("[fetch-article] reader fallback accepted", { url: parsed.toString(), chars: fallback.html.length });
      rawHtml = fallback.html;
      finalUrl = fallback.finalUrl;
      status = fallback.status;
      truncated = fallback.truncated;
    }
  }

  if (!rawHtml || rawHtml.length < 32) {
    return jsonResponse({
      error: "Upstream returned no HTML",
      code: "empty",
      status,
    }, { status: 200 });
  }

  // Sanitize + add <base> so relative URLs resolve to the origin.
  let safeHtml = "";
  try {
    safeHtml = transformHtml(rawHtml, finalUrl);
  } catch (err) {
    console.warn("[fetch-article] transform failed, returning raw script-stripped html", {
      url: parsed.toString(),
      error: (err as Error)?.message,
    });
    safeHtml = rawHtml.replace(/<script\b[\s\S]*?<\/script\s*>/gi, "");
  }

  // Meta extraction for the note card.
  const title = pickTitle(rawHtml);
  const description = pickMeta(rawHtml, "og:description") || pickMeta(rawHtml, "description") || pickMeta(rawHtml, "twitter:description");
  const siteName = pickMeta(rawHtml, "og:site_name");
  const publishedTime = pickMeta(rawHtml, "article:published_time") || pickMeta(rawHtml, "og:published_time");
  const author = pickMeta(rawHtml, "article:author") || pickMeta(rawHtml, "author");
  const leadImageRel = pickMeta(rawHtml, "og:image") || pickMeta(rawHtml, "twitter:image");
  const leadImage = leadImageRel ? absolutize(leadImageRel, finalUrl) : "";

  const responseBody = {
    title,
    author,
    byline: author,
    siteName,
    leadImage,
    excerpt: description,
    publishedTime,
    rawHtml: safeHtml,
    contentHtml: safeHtml,
    content: safeHtml,
    fallback: false,
    embeds: [] as string[],
    importantLinks: [] as { href: string; text: string }[],
    truncated,
    finalUrl,
    status,
  };

  console.info("[fetch-article] ok", {
    url: parsed.toString(),
    finalUrl,
    status,
    htmlChars: safeHtml.length,
    titleChars: title.length,
    truncated,
  });

  return jsonResponse(responseBody, { status: 200 });
});
