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

const FETCH_TIMEOUT_MS = 25_000;
const MAX_HTML_BYTES = 12 * 1024 * 1024; // 12MB hard cap on raw HTML

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 Flowist-Clipper/2.0";

/** Absolute-URL resolver that never throws. */
function absolutize(href: string, base: string): string {
  try { return new URL(href, base).toString(); } catch { return href; }
}

/** Remove executable / dangerous content. Keep everything visual. */
function sanitizeHtml(html: string): string {
  let out = html;
  // Strip <script>...</script> (any attrs, greedy-safe)
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  // Self-closing / unclosed scripts
  out = out.replace(/<script\b[^>]*\/?>/gi, "");
  // <noscript> — hidden by default, but often has trackers
  out = out.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, "");
  // Plugins
  out = out.replace(/<object\b[^>]*>[\s\S]*?<\/object\s*>/gi, "");
  out = out.replace(/<embed\b[^>]*\/?>/gi, "");
  out = out.replace(/<applet\b[^>]*>[\s\S]*?<\/applet\s*>/gi, "");
  // Inline event handlers (onclick, onload, onerror, …)
  out = out.replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, "");
  // javascript: URLs
  out = out.replace(/(href|src|action)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"');
  out = out.replace(/(href|src|action)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'");
  // <meta http-equiv="refresh"> — would redirect the iframe
  out = out.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "");
  return out;
}

/** Promote lazy-loaded image URLs (data-src, data-lazy-src, data-original,
 *  data-hi-res-src, data-echo) into real `src`/`srcset` attributes so the
 *  snapshot renders images even when the origin site relies on JS lazy-load. */
function promoteLazyImages(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    let updated = tag;
    // Pick the first available lazy attribute for src
    const srcAttrs = ["data-src", "data-lazy-src", "data-original", "data-hi-res-src", "data-echo", "data-img-src"];
    const hasRealSrc = /\ssrc\s*=\s*["'][^"']*["']/i.test(updated) &&
      !/\ssrc\s*=\s*["'](?:data:image\/(?:gif|svg\+xml)[^"']*|[^"']*\.svg[^"']*|[^"']*placeholder[^"']*|[^"']*blank[^"']*|[^"']*1x1[^"']*)["']/i.test(updated);
    if (!hasRealSrc) {
      for (const attr of srcAttrs) {
        const re = new RegExp(`\\s${attr}\\s*=\\s*["']([^"']+)["']`, "i");
        const m = re.exec(updated);
        if (m && m[1]) {
          // Remove existing src (may be placeholder), then add real one
          updated = updated.replace(/\ssrc\s*=\s*["'][^"']*["']/i, "");
          updated = updated.replace(/<img\b/i, `<img src="${m[1].replace(/"/g, "&quot;")}"`);
          break;
        }
      }
    }
    // Promote lazy srcset
    if (!/\ssrcset\s*=/i.test(updated)) {
      const lazySrcsetAttrs = ["data-srcset", "data-lazy-srcset"];
      for (const attr of lazySrcsetAttrs) {
        const re = new RegExp(`\\s${attr}\\s*=\\s*["']([^"']+)["']`, "i");
        const m = re.exec(updated);
        if (m && m[1]) {
          updated = updated.replace(/<img\b/i, `<img srcset="${m[1].replace(/"/g, "&quot;")}"`);
          break;
        }
      }
    }
    // Kill native lazy loading so the browser fetches immediately in the sandbox
    updated = updated.replace(/\sloading\s*=\s*["'][^"']*["']/i, "");
    return updated;
  });
}

/** Inject a permissive referrer policy so hotlink-protected CDNs (which see
 *  the sandboxed iframe's opaque origin as `null`) still serve images. */
function injectReferrerMeta(html: string): string {
  // Remove any existing referrer meta first
  let out = html.replace(/<meta\b[^>]*name\s*=\s*["']?referrer["']?[^>]*>/gi, "");
  const meta = `<meta name="referrer" content="no-referrer-when-downgrade">`;
  if (/<head\b[^>]*>/i.test(out)) {
    out = out.replace(/<head\b[^>]*>/i, (m) => `${m}\n${meta}`);
  }
  return out;
}

/** Inject/replace a <base href="…"> so relative URLs resolve to the origin. */
function ensureBaseHref(html: string, baseHref: string): string {
  // Remove any existing <base …>
  let out = html.replace(/<base\b[^>]*>/gi, "");
  const baseTag = `<base href="${baseHref.replace(/"/g, "&quot;")}">`;
  if (/<head\b[^>]*>/i.test(out)) {
    out = out.replace(/<head\b[^>]*>/i, (m) => `${m}\n${baseTag}`);
  } else if (/<html\b[^>]*>/i.test(out)) {
    out = out.replace(/<html\b[^>]*>/i, (m) => `${m}<head>${baseTag}</head>`);
  } else {
    out = `<!DOCTYPE html><html><head>${baseTag}</head><body>${out}</body></html>`;
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
        total += value.byteLength;
        if (total > MAX_HTML_BYTES) {
          truncated = true;
          try { await reader.cancel(); } catch { /* ignore */ }
          break;
        }
        chunks.push(value);
      }
    }
    // Detect charset
    const ctype = res.headers.get("content-type") || "";
    const charsetMatch = /charset=([^;\s]+)/i.exec(ctype);
    let charset = charsetMatch ? charsetMatch[1].toLowerCase() : "utf-8";
    const buf = new Uint8Array(total > MAX_HTML_BYTES ? MAX_HTML_BYTES : total);
    let off = 0;
    for (const c of chunks) {
      const room = buf.length - off;
      if (room <= 0) break;
      const slice = c.byteLength > room ? c.subarray(0, room) : c;
      buf.set(slice, off);
      off += slice.byteLength;
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
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawUrl = (body.url || "").trim();
  if (!rawUrl) {
    return new Response(JSON.stringify({ error: "Missing url" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch {
    return new Response(JSON.stringify({ error: "Invalid URL" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return new Response(JSON.stringify({ error: "Only http(s) URLs are supported" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.info("[fetch-article] evernote-simple fetch", { url: parsed.toString() });

  let fetched: Awaited<ReturnType<typeof fetchHtml>>;
  try {
    fetched = await fetchHtml(parsed.toString());
  } catch (err) {
    const isAbort = (err as Error)?.name === "AbortError";
    console.warn("[fetch-article] fetch failed", { url: parsed.toString(), error: (err as Error)?.message, isAbort });
    return new Response(JSON.stringify({
      error: isAbort ? "Upstream fetch timed out" : `Upstream fetch failed: ${(err as Error)?.message || "unknown"}`,
      code: isAbort ? "timeout" : "network",
    }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { html: rawHtml, finalUrl, status, truncated } = fetched;

  if (!rawHtml || rawHtml.length < 32) {
    return new Response(JSON.stringify({
      error: "Upstream returned no HTML",
      code: "empty",
      status,
    }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Sanitize + add <base> so relative URLs resolve to the origin.
  const withBase = ensureBaseHref(rawHtml, finalUrl);
  const withReferrer = injectReferrerMeta(withBase);
  const withLazyPromoted = promoteLazyImages(withReferrer);
  const safeHtml = sanitizeHtml(withLazyPromoted);

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

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
