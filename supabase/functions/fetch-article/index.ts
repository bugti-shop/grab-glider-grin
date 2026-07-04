// Edge function: fetch a URL server-side and extract full article content
// using Mozilla Readability (Evernote-style Web Clipper).
//
// Improvements:
//   • Resolves lazy-loaded images from data-src / data-original /
//     data-lazy-src / data-hi-res-src / data-echo / srcset variants.
//   • Preserves safe iframe/video/audio embeds (YouTube, Vimeo, etc.)
//     that Readability would otherwise strip.
//   • Collects "important" outbound links from the article body so users
//     don't lose citations when Readability trims anchor-heavy sections.
//
// Public — no auth required.

// deno-lint-ignore-file no-explicit-any
import { Readability } from "https://esm.sh/@mozilla/readability@0.5.0";
// Use linkedom's `worker` entry — it ships without the `canvas` dep that
// otherwise fails to bundle inside the edge runtime with a "canvas.node not
// found" error, blocking deploys of this whole function.
import { parseHTML } from "https://esm.sh/linkedom@0.18.5/worker";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_HTML_BYTES = 100 * 1024 * 1024; // 100MB page cap (fetch) — heavy image-rich articles
const MAX_CONTENT_HTML_BYTES = 8 * 1024 * 1024; // 8MB cap so image-rich long articles do not become half clips
const MAX_FULLPAGE_HTML_BYTES = 100 * 1024 * 1024; // 100MB cap for full-page raw HTML
const FETCH_TIMEOUT_MS = 38_000;

// ── Content-completeness validation ──────────────────────────────────────
// When the upstream page ships mostly a shell (SPA / paywall / bot wall) the
// first fetch often yields only meta tags or a half-truncated article. We
// treat the extraction as incomplete when the visible body text is shorter
// than MIN_ACCEPTABLE_BODY_CHARS *or* not meaningfully larger than the
// metadata description we would already have shown as an excerpt. In that
// case we re-fetch the page with a different user-agent (googlebot, mobile
// Safari, facebookexternalhit) so bot-friendly / mobile-rendered variants
// expose the full article, then keep whichever attempt produced the longest
// clean body. This runs BEFORE any Jina fallback so we exhaust direct
// options first.
const UA_VARIANTS: readonly string[] = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 Flowist-Clipper/1.0",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
];
const MIN_ACCEPTABLE_BODY_CHARS = 600;
const HALF_ARTICLE_RATIO = 1.4; // body must be >1.4× excerpt length to count as "more than meta"

/** True when the extracted body looks like meta-only or a half-truncated
 *  fragment relative to what we already know from meta tags. */
function looksIncomplete(bodyText: string, excerpt: string): boolean {
  const len = (bodyText || "").length;
  if (len < MIN_ACCEPTABLE_BODY_CHARS) return true;
  const excerptLen = (excerpt || "").length;
  if (excerptLen > 120 && len < excerptLen * HALF_ARTICLE_RATIO) return true;
  return false;
}

/** Extract safe, reachable absolute image URLs from an HTML string.
 *  - Only http/https (drops data:, blob:, javascript:, protocol-relative junk).
 *  - Filters obvious tracking pixels (1x1, /pixel, /beacon, /track, /impression).
 *  - Filters tiny favicons the fallback link cards inject (google s2 favicons).
 *  - Caps total to MAX_CLIP_IMAGES so a single clip never ships an avalanche. */
const MAX_CLIP_IMAGES = 24;
function extractImageUrls(html: string): string[] {
  if (!html) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<img\b[^>]*?\ssrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const rawUrl = m[1].trim();
    if (!rawUrl) continue;
    if (!/^https?:\/\//i.test(rawUrl)) continue;                 // http(s) only
    if (seen.has(rawUrl)) continue;
    const lower = rawUrl.toLowerCase();
    // Common tracking-pixel / beacon patterns.
    if (/(?:^|[/?&#=_.-])(pixel|beacon|track(?:ing)?|impression|analytics|telemetry|1x1|spacer|blank)(?:[/?&#=_.-]|\.(?:gif|png|jpg))/i.test(lower)) continue;
    // Fallback-card favicons (Google favicon service, sz=128 etc.).
    if (lower.includes("s2/favicons")) continue;
    // Explicit tiny dimensions in the tag → skip.
    const w = /\bwidth\s*=\s*["']?(\d+)/i.exec(tag)?.[1];
    const h = /\bheight\s*=\s*["']?(\d+)/i.exec(tag)?.[1];
    if (w && h && Number(w) <= 2 && Number(h) <= 2) continue;
    seen.add(rawUrl);
    out.push(rawUrl);
    if (out.length >= MAX_CLIP_IMAGES) break;
  }
  return out;
}


/** Truncate HTML at a byte budget without breaking a tag mid-attribute. */
function capHtml(html: string, maxBytes: number): { html: string; truncated: boolean } {
  if (!html) return { html: "", truncated: false };
  const enc = new TextEncoder();
  if (enc.encode(html).length <= maxBytes) return { html, truncated: false };
  // Binary-search a safe character cut, then close at the last '>'.
  let lo = 0, hi = html.length, cut = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (enc.encode(html.slice(0, mid)).length <= maxBytes) { cut = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  const lastGt = html.lastIndexOf(">", cut);
  return { html: html.slice(0, lastGt > 0 ? lastGt + 1 : cut), truncated: true };
}

/* ------------------------------------------------------------------ */
/* Asset inlining — inline CSS, JS, images, fonts, and favicons into  */
/* the captured document as data: URIs so it renders offline without  */
/* any network access.                                                */
/* ------------------------------------------------------------------ */

const INLINE_ASSET_TIMEOUT_MS = 6_000;
const INLINE_PER_ASSET_MAX = 2 * 1024 * 1024; // 2 MB per asset
const INLINE_TOTAL_BUDGET = 15 * 1024 * 1024; // 15 MB total inlined
const INLINE_CONCURRENCY = 8;

function u8ToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
  }
  return btoa(bin);
}

function guessMimeFromUrl(u: string, fallback = "application/octet-stream"): string {
  const ext = (u.split("?")[0].split("#")[0].split(".").pop() || "").toLowerCase();
  switch (ext) {
    case "css": return "text/css";
    case "js": case "mjs": return "application/javascript";
    case "png": return "image/png";
    case "jpg": case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "avif": return "image/avif";
    case "gif": return "image/gif";
    case "svg": return "image/svg+xml";
    case "ico": return "image/x-icon";
    case "woff": return "font/woff";
    case "woff2": return "font/woff2";
    case "ttf": return "font/ttf";
    case "otf": return "font/otf";
    case "eot": return "application/vnd.ms-fontobject";
    default: return fallback;
  }
}

type FetchedAsset = { mime: string; bytes: Uint8Array; text?: string };

// ── SSRF guard ───────────────────────────────────────────────────────────
// We fetch fully user-supplied URLs (article target + inlined assets). Without
// a guard, an authenticated user could point us at internal/cloud-metadata
// hosts (e.g. 169.254.169.254, 127.0.0.1, RFC1918) and read the response
// back through the parsed article. We resolve DNS ourselves and reject any
// host that resolves to a loopback/link-local/private/reserved range, and we
// follow redirects manually so every hop is re-validated.
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true;                        // 0.0.0.0/8
  if (a === 10) return true;                       // 10/8
  if (a === 127) return true;                      // loopback
  if (a === 169 && b === 254) return true;         // link-local + AWS metadata
  if (a === 172 && b >= 16 && b <= 31) return true;// 172.16/12
  if (a === 192 && b === 168) return true;         // 192.168/16
  if (a === 192 && b === 0) return true;           // 192.0.0/24 + 192.0.2/24
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 100 && b >= 64 && b <= 127) return true;    // CGNAT 100.64/10
  if (a >= 224) return true;                       // multicast + reserved
  return false;
}
function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("ff")) return true;         // multicast
  if (lower.startsWith("::ffff:")) {               // IPv4-mapped
    return isPrivateIpv4(lower.slice(7));
  }
  return false;
}
function isIpLiteralUnsafe(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return isPrivateIpv4(h);
  if (h.includes(":")) return isPrivateIpv6(h);
  return false;
}
async function isSafeTarget(target: URL): Promise<boolean> {
  if (!["http:", "https:"].includes(target.protocol)) return false;
  const host = target.hostname.toLowerCase();
  if (!host) return false;
  // Block localhost aliases up front — DNS may not resolve these.
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  // Reject non-standard ports that clearly point at internal services.
  const port = target.port ? Number(target.port) : (target.protocol === "https:" ? 443 : 80);
  if (port !== 80 && port !== 443 && port !== 8080 && port !== 8443) return false;
  // IP literals are checked directly (no DNS needed).
  if (isIpLiteralUnsafe(host.replace(/^\[|\]$/g, ""))) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return true;
  // Real hostname: resolve and verify every returned address is public.
  try {
    const results = await Promise.allSettled([
      Deno.resolveDns(host, "A"),
      Deno.resolveDns(host, "AAAA"),
    ]);
    const ips: string[] = [];
    for (const r of results) if (r.status === "fulfilled") ips.push(...r.value);
    if (ips.length === 0) return false; // fail closed when DNS returns nothing
    return ips.every((ip) => !(isPrivateIpv4(ip) || isPrivateIpv6(ip)));
  } catch {
    return false; // fail closed on resolver errors
  }
}
async function safeFetch(u: string, init: RequestInit = {}, maxRedirects = 5): Promise<Response | null> {
  let current = u;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let target: URL;
    try { target = new URL(current); } catch { return null; }
    if (!(await isSafeTarget(target))) return null;
    const res = await fetch(current, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      try { current = new URL(loc, current).toString(); } catch { return null; }
      continue;
    }
    return res;
  }
  return null;
}

async function fetchAsset(u: string): Promise<FetchedAsset | null> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), INLINE_ASSET_TIMEOUT_MS);
    const res = await safeFetch(u, {
      signal: c.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Flowist-Clipper/1.0",
        "accept": "*/*",
      },
    }).catch(() => null);
    clearTimeout(t);
    if (!res || !res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > INLINE_PER_ASSET_MAX) return null;
    const mime = (res.headers.get("content-type") || "").split(";")[0].trim() || guessMimeFromUrl(u);
    return { mime, bytes: new Uint8Array(buf) };
  } catch { return null; }
}


async function fetchTextAsset(u: string): Promise<FetchedAsset | null> {
  const a = await fetchAsset(u);
  if (!a) return null;
  try { a.text = new TextDecoder("utf-8").decode(a.bytes); } catch { /* ignore */ }
  return a;
}

function toDataUri(a: FetchedAsset): string {
  return `data:${a.mime};base64,${u8ToBase64(a.bytes)}`;
}

/** Inline url(...) and @import references inside a stylesheet body. */
async function inlineCssUrls(
  css: string,
  cssBase: string,
  budget: { remaining: number },
  cache: Map<string, string>,
): Promise<string> {
  // @import "…"; / @import url(…);
  const importRe = /@import\s+(?:url\(\s*)?["']?([^"')\s]+)["']?\s*\)?\s*;?/gi;
  const imports: Array<{ match: string; url: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(css)) !== null) imports.push({ match: m[0], url: m[1] });
  for (const imp of imports) {
    if (budget.remaining <= 0) break;
    const abs = absolutize(imp.url, cssBase);
    let inlined = cache.get(abs);
    if (inlined === undefined) {
      const sub = await fetchTextAsset(abs);
      if (sub && sub.text) {
        const nested = await inlineCssUrls(sub.text, abs, budget, cache);
        inlined = nested;
        budget.remaining -= nested.length;
      } else {
        inlined = "";
      }
      cache.set(abs, inlined);
    }
    css = css.split(imp.match).join(inlined);
  }

  // url(...) — fonts, images, backgrounds
  const urlRe = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;
  const urls: string[] = [];
  const seen = new Set<string>();
  while ((m = urlRe.exec(css)) !== null) {
    const raw = m[2].trim();
    if (!raw || raw.startsWith("data:") || raw.startsWith("#")) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    urls.push(raw);
  }
  const replacements = new Map<string, string>();
  for (const raw of urls) {
    if (budget.remaining <= 0) break;
    const abs = absolutize(raw, cssBase);
    let uri = cache.get(abs);
    if (uri === undefined) {
      const sub = await fetchAsset(abs);
      uri = sub ? toDataUri(sub) : abs;
      if (sub) budget.remaining -= sub.bytes.length;
      cache.set(abs, uri);
    }
    replacements.set(raw, uri);
  }
  if (replacements.size) {
    css = css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (full, q, raw) => {
      const rep = replacements.get(raw.trim());
      return rep ? `url(${q}${rep}${q})` : full;
    });
  }
  return css;
}

/** Aggressively strip ads, navigation, footers, share bars, "related
 *  stories", newsletter/subscribe prompts, comments, and inline icons from
 *  the parsed document. Runs BEFORE Readability so the readability scorer
 *  sees a clean article tree and doesn't grade noisy nav blocks as content.
 *  Preserves: article body, headings, images (+ <figcaption>), links,
 *  blockquotes, lists, tables, references, code, embedded video/iframes. */
function cleanArticleDom(doc: Document): void {
  // 0) Preserve FAQ / Q&A sections. Often built with accordions (button +
  //    hidden panel) or <details>/<summary>. Mark containers so purge passes
  //    skip them, reveal any hidden panels, and convert accordion triggers
  //    into <h3>s so questions still render after <button> gets stripped.
  const faqRe = /(faq|frequently\s*asked|q\s*&\s*a|questions?[-_ ]?(and|&)[-_ ]?answers?)/i;
  const faqRoots = new Set<any>();
  for (const sel of [
    '[class*="faq" i]', '[id*="faq" i]',
    '[class*="accordion" i]', '[class*="question" i]',
    '[data-testid*="faq" i]', '[aria-label*="faq" i]',
  ]) {
    try { doc.querySelectorAll(sel).forEach((el: any) => faqRoots.add(el)); } catch { /* skip */ }
  }
  const allHeads = Array.from(doc.querySelectorAll("h1, h2, h3, h4")) as any[];
  for (const h of allHeads) {
    if (!faqRe.test((h.textContent || "").trim())) continue;
    faqRoots.add(h);
    const level = Number(h.tagName?.[1] || 3);
    let sib: any = h.nextElementSibling;
    while (sib) {
      const tag = String(sib.tagName || "").toUpperCase();
      if (/^H[1-4]$/.test(tag) && Number(tag[1]) <= level) break;
      faqRoots.add(sib);
      sib = sib.nextElementSibling;
    }
  }
  faqRoots.forEach((el: any) => {
    try {
      el.setAttribute('data-flowist-keep', '1');
      el.querySelectorAll?.('[hidden]').forEach((n: any) => n.removeAttribute('hidden'));
      el.querySelectorAll?.('[aria-hidden="true"]').forEach((n: any) => n.setAttribute('aria-hidden', 'false'));
      el.querySelectorAll?.('button, summary').forEach((btn: any) => {
        const t = (btn.textContent || '').trim();
        if (!t) return;
        const h = doc.createElement('h3');
        h.textContent = t;
        btn.parentNode?.replaceChild(h, btn);
      });
      el.querySelectorAll?.('details').forEach((d: any) => d.setAttribute('open', ''));
    } catch { /* ignore */ }
  });
  const isProtected = (el: any): boolean => {
    try { return !!(el?.closest && el.closest('[data-flowist-keep]')); } catch { return false; }
  };

  // 1) Element types that are almost always chrome/noise.
  const purgeTags = [
    "script", "style", "noscript", "template", "svg", "canvas",
    "nav", "header", "footer", "aside", "form", "button", "dialog",
    "ins", // adsense
  ];
  for (const tag of purgeTags) {
    doc.querySelectorAll(tag).forEach((el: any) => { if (!isProtected(el)) el.remove(); });
  }

  // 2) Iframes that aren't legitimate media embeds (youtube/vimeo/etc.).
  const mediaHostsRe = new RegExp("(youtube\\.com|youtu\\.be|youtube-nocookie\\.com|vimeo\\.com|player\\.vimeo\\.com|dailymotion\\.com|twitch\\.tv|soundcloud\\.com|spotify\\.com|scribd\\.com|slideshare\\.net|codepen\\.io|codesandbox\\.io|jsfiddle\\.net|gist\\.github\\.com|twitter\\.com/.+/status|x\\.com/.+/status|instagram\\.com/p/|tiktok\\.com/@)", "i");
  doc.querySelectorAll("iframe").forEach((el: any) => {
    const src = String(el.getAttribute("src") || "");
    if (!src || !mediaHostsRe.test(src)) el.remove();
  });

  // 3) Selector-based purge for common ad/nav/related/social patterns.
  const noiseSelectors = [
    // Ads
    '[id*="ad" i][id*="-" i]', '[class*="advert" i]', '[class*="ad-slot" i]',
    '[class*="adsense" i]', '[class*="adunit" i]', '[class*="sponsor" i]',
    '[data-ad]', '[data-ad-slot]', '[data-testid*="ad-" i]',
    '[aria-label*="advert" i]',
    // Share / social
    '[class*="share" i]', '[class*="social" i]', '[class*="follow" i]',
    '[aria-label*="share" i]', '[data-testid*="share" i]',
    // Related / recommended / more stories
    '[class*="related" i]', '[class*="recommend" i]', '[class*="more-stor" i]',
    '[class*="read-next" i]', '[class*="read-more" i]', '[class*="you-may" i]',
    '[class*="popular" i]', '[class*="trending" i]', '[class*="promo" i]',
    '[data-testid*="related" i]', '[data-testid*="recommend" i]',
    // Newsletter / subscribe / paywall UI
    '[class*="newsletter" i]', '[class*="subscribe" i]', '[class*="signup" i]',
    '[class*="paywall" i]', '[class*="metered" i]',
    // Comments
    '[id*="comment" i]', '[class*="comment" i]', '[class*="disqus" i]',
    // Cookies / consent / banners
    '[class*="cookie" i]', '[class*="consent" i]', '[id*="cookie" i]',
    '[class*="banner" i]', '[class*="modal" i]', '[class*="popup" i]',
    // Menus / breadcrumbs / toolbars
    '[class*="menu" i]', '[class*="breadcrumb" i]', '[class*="toolbar" i]',
    '[class*="sidebar" i]', '[class*="masthead" i]',
    // Site chrome
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
    '[role="complementary"]', '[role="search"]', '[role="dialog"]',
    // Icon-only spans (font-awesome / material)
    '[class*="icon-" i]:empty', 'i[class*="fa-" i]', 'i[class*="material-icons" i]',
    // Print / email / bookmark widgets
    '[class*="print" i]', '[class*="email-friend" i]', '[class*="bookmark" i]',
    // Author bio / tag lists that live outside the article
    '[class*="author-bio" i]', '[class*="tags" i][class*="list" i]',
  ];
  for (const sel of noiseSelectors) {
    try { doc.querySelectorAll(sel).forEach((el: any) => { if (!isProtected(el)) el.remove(); }); } catch { /* invalid selector — skip */ }
  }

  // 4) Cut everything after a "Related / Read next / More stories / You may
  //    also like / Comments" heading — those sections precede pure noise.
  const cutHeadingRe = /^\s*(related( stories| articles| posts)?|read (next|more)|more (stories|from)|you (may|might) (also )?(like|enjoy)|recommended (for you|reading)?|up next|latest news|popular|trending|comments?|newsletter|subscribe)\b/i;
  const headings = Array.from(doc.querySelectorAll("h1, h2, h3, h4")) as any[];
  for (const h of headings) {
    const text = (h.textContent || "").trim();
    if (!cutHeadingRe.test(text)) continue;
    if (isProtected(h)) continue; // never cut inside a preserved FAQ block
    // Remove the heading itself and every sibling that follows it — but
    // stop if we hit a preserved FAQ block so questions stay in the article.
    let sib: any = h.nextSibling;
    while (sib) {
      const next = sib.nextSibling;
      if (sib.nodeType === 1 && (sib.getAttribute?.('data-flowist-keep') === '1' || (sib.querySelector && sib.querySelector('[data-flowist-keep="1"]')))) {
        break;
      }
      sib.parentNode?.removeChild(sib);
      sib = next;
    }
    h.parentNode?.removeChild(h);
  }

  // 5) Drop empty anchors/spans/divs left behind after icon stripping.
  doc.querySelectorAll("a, span, div, p").forEach((el: any) => {
    const hasMedia = el.querySelector && el.querySelector("img, picture, video, iframe, figure, svg");
    const text = (el.textContent || "").replace(/\s+/g, "");
    if (!text && !hasMedia) el.remove();
  });
}

/** Inline ALL external stylesheets, scripts, images, and favicons into the
 *  document so the captured HTML renders fully offline. Budget-capped and
 *  best-effort: any asset that fails to fetch is left with its absolute URL
 *  so the captured page degrades gracefully rather than breaking. */
async function inlineAllAssets(doc: Document, base: string): Promise<void> {
  const budget = { remaining: INLINE_TOTAL_BUDGET };
  const cache = new Map<string, string>();

  const runLimited = async <T>(tasks: Array<() => Promise<T>>, limit: number) => {
    let i = 0;
    const workers: Array<Promise<void>> = [];
    for (let w = 0; w < Math.min(limit, tasks.length); w++) {
      workers.push((async () => {
        while (i < tasks.length) {
          const idx = i++;
          try { await tasks[idx](); } catch { /* ignore per-task */ }
        }
      })());
    }
    await Promise.all(workers);
  };

  // 1) Stylesheets — <link rel~="stylesheet" href="...">
  const linkNodes = Array.from(doc.querySelectorAll('link[rel~="stylesheet"][href]')) as any[];
  await runLimited(linkNodes.map((link) => async () => {
    if (budget.remaining <= 0) return;
    const href = link.getAttribute("href");
    if (!href) return;
    const abs = absolutize(href, base);
    const asset = await fetchTextAsset(abs);
    if (!asset || !asset.text) return;
    const css = await inlineCssUrls(asset.text, abs, budget, cache);
    budget.remaining -= css.length;
    const style = doc.createElement("style");
    const media = link.getAttribute("media");
    if (media) style.setAttribute("media", media);
    style.setAttribute("data-flowist-inlined-from", abs);
    style.textContent = css;
    link.parentNode?.replaceChild(style, link);
  }), INLINE_CONCURRENCY);

  // 1b) Existing inline <style> blocks — still need url() inlining.
  const inlineStyles = Array.from(doc.querySelectorAll("style")) as any[];
  await runLimited(inlineStyles.map((style) => async () => {
    if (budget.remaining <= 0) return;
    const src = style.textContent || "";
    if (!src || !/url\(|@import/i.test(src)) return;
    const rewritten = await inlineCssUrls(src, base, budget, cache);
    style.textContent = rewritten;
  }), INLINE_CONCURRENCY);

  // 2) Scripts — <script src="...">. Keep type/attributes; drop src.
  const scriptNodes = Array.from(doc.querySelectorAll("script[src]")) as any[];
  await runLimited(scriptNodes.map((script) => async () => {
    if (budget.remaining <= 0) return;
    const src = script.getAttribute("src");
    if (!src) return;
    const abs = absolutize(src, base);
    const asset = await fetchTextAsset(abs);
    if (!asset || !asset.text) return;
    budget.remaining -= asset.text.length;
    script.removeAttribute("src");
    script.setAttribute("data-flowist-inlined-from", abs);
    // Neutralise any </script> inside the code that would prematurely close the tag.
    script.textContent = asset.text.replace(/<\/script/gi, "<\\/script");
  }), INLINE_CONCURRENCY);

  // 3) Images + favicons + preloads → data: URIs.
  const inlineImg = async (el: any, attr: string) => {
    if (budget.remaining <= 0) return;
    const raw = el.getAttribute(attr);
    if (!raw || raw.startsWith("data:")) return;
    const abs = absolutize(raw, base);
    let uri = cache.get(abs);
    if (uri === undefined) {
      const sub = await fetchAsset(abs);
      uri = sub ? toDataUri(sub) : "";
      if (sub) budget.remaining -= sub.bytes.length;
      cache.set(abs, uri);
    }
    if (uri) el.setAttribute(attr, uri);
  };

  const imgTasks: Array<() => Promise<void>> = [];
  doc.querySelectorAll("img[src]").forEach((el: any) => imgTasks.push(() => inlineImg(el, "src")));
  doc.querySelectorAll('link[rel~="icon"][href], link[rel="apple-touch-icon"][href], link[rel="mask-icon"][href]')
    .forEach((el: any) => imgTasks.push(() => inlineImg(el, "href")));
  doc.querySelectorAll("source[src]").forEach((el: any) => imgTasks.push(() => inlineImg(el, "src")));
  await runLimited(imgTasks, INLINE_CONCURRENCY);

  // 3b) <img srcset> and <source srcset> — inline each candidate.
  const rewriteSrcset = async (el: any) => {
    if (budget.remaining <= 0) return;
    const ss = el.getAttribute("srcset");
    if (!ss) return;
    const parts = ss.split(",").map((p: string) => p.trim()).filter(Boolean);
    const out: string[] = [];
    for (const part of parts) {
      const [u, d] = part.split(/\s+/, 2);
      if (!u || u.startsWith("data:")) { out.push(part); continue; }
      const abs = absolutize(u, base);
      let uri = cache.get(abs);
      if (uri === undefined) {
        const sub = await fetchAsset(abs);
        uri = sub ? toDataUri(sub) : abs;
        if (sub) budget.remaining -= sub.bytes.length;
        cache.set(abs, uri);
      }
      out.push(d ? `${uri} ${d}` : uri);
    }
    el.setAttribute("srcset", out.join(", "));
  };
  const ssTasks: Array<() => Promise<void>> = [];
  doc.querySelectorAll("img[srcset], source[srcset]").forEach((el: any) => ssTasks.push(() => rewriteSrcset(el)));
  await runLimited(ssTasks, INLINE_CONCURRENCY);

  // 4) Neutralize <base> tags — after inlining, all URLs are absolute or data:
  //    and we don't want a stray <base href> to interfere in the sandboxed iframe.
  doc.querySelectorAll("base").forEach((b: any) => b.parentNode?.removeChild(b));
}

// Attributes commonly used by lazy-load libraries (LazySizes, Lozad,
// WordPress, Medium, Substack, Ghost, etc.) to hold the *real* image URL.
const LAZY_SRC_ATTRS = [
  "data-src",
  "data-lazy-src",
  "data-original",
  "data-original-src",
  "data-hi-res-src",
  "data-full-src",
  "data-large-src",
  "data-actual-src",
  "data-echo",
  "data-fallback-src",
  "data-defer-src",
  "data-img",
  "data-image",
  "data-url",
];
const LAZY_SRCSET_ATTRS = [
  "data-srcset",
  "data-lazy-srcset",
  "data-original-srcset",
];

// Stricter allowlist — only embeds that render reliably inside a sandboxed
// note view without third-party scripts. Anything outside this list gets
// downgraded to a link-card fallback (thumbnail + title + open link).
const EMBED_HOST_ALLOWLIST = [
  "youtube.com", "youtube-nocookie.com", "youtu.be",
  "vimeo.com", "player.vimeo.com",
  "soundcloud.com", "w.soundcloud.com",
  "open.spotify.com",
  "loom.com",
  "wistia.com", "fast.wistia.net",
  "codepen.io",
  "codesandbox.io",
];

function faviconFor(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}

function youtubeThumb(src: string): string | null {
  try {
    const u = new URL(src);
    const host = u.hostname.replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      id = u.searchParams.get("v") || u.pathname.split("/").filter(Boolean).pop() || "";
    }
    if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  } catch { /* ignore */ }
  return null;
}

function vimeoThumb(src: string): string | null {
  // Vimeo needs an API call for real thumbs; skip — favicon fallback wins.
  return null;
}

function embedFallback(src: string, label: string, posterHint?: string): string {
  let host = "";
  try { host = new URL(src).hostname.replace(/^www\./, ""); } catch { return ""; }
  const thumb = posterHint || youtubeThumb(src) || vimeoThumb(src) || faviconFor(host);
  const safeLabel = (label || host).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    `<p><a href="${src}" target="_blank" rel="noopener noreferrer" ` +
    `style="display:flex;gap:12px;align-items:center;padding:10px;border:1px solid rgba(0,0,0,0.12);border-radius:8px;text-decoration:none;color:inherit">` +
    `<img src="${thumb}" alt="" referrerpolicy="no-referrer" style="width:96px;height:64px;object-fit:cover;border-radius:4px;flex-shrink:0" />` +
    `<span style="display:flex;flex-direction:column;gap:2px;min-width:0">` +
    `<strong style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${safeLabel}</strong>` +
    `<span style="font-size:12px;opacity:0.7">${host} · Open embed ↗</span>` +
    `</span></a></p>`
  );
}

function absolutize(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function isEmbedAllowed(src: string): boolean {
  try {
    const u = new URL(src);
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname.replace(/^www\./, "");
    return EMBED_HOST_ALLOWLIST.some((d) => h === d || h.endsWith("." + d));
  } catch {
    return false;
  }
}

function pickFirstFromSrcset(srcset: string, base: string): string {
  const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
  return first ? absolutize(first, base) : "";
}

/** Rewrite lazy-load attrs → real src, and absolutize URLs so the saved
 *  note works even when the source site is offline. */
function absolutizeDoc(doc: Document, base: string) {
  doc.querySelectorAll("img").forEach((img: any) => {
    let src = img.getAttribute("src") || "";
    const isPlaceholder =
      !src ||
      src.startsWith("data:image/gif;base64,") ||
      /1x1|blank|placeholder|spacer|transparent/i.test(src);

    if (isPlaceholder) {
      // Try every known lazy-load attribute.
      for (const attr of LAZY_SRC_ATTRS) {
        const candidate = img.getAttribute(attr);
        if (candidate && candidate.trim()) {
          src = candidate.trim();
          break;
        }
      }
      // Try lazy srcset variants → first URL.
      if (!src || isPlaceholder) {
        for (const attr of LAZY_SRCSET_ATTRS) {
          const ss = img.getAttribute(attr);
          if (ss) {
            const first = pickFirstFromSrcset(ss, base);
            if (first) { src = first; break; }
          }
        }
      }
      // Last resort: promote regular srcset's first entry.
      if (!src || isPlaceholder) {
        const ss = img.getAttribute("srcset");
        if (ss) src = pickFirstFromSrcset(ss, base) || src;
      }
    }
    if (src) img.setAttribute("src", absolutize(src, base));

    // Also promote lazy-srcset → srcset so responsive rendering works.
    for (const attr of LAZY_SRCSET_ATTRS) {
      const ss = img.getAttribute(attr);
      if (ss && !img.getAttribute("srcset")) {
        img.setAttribute("srcset", ss);
        break;
      }
    }

    const srcset = img.getAttribute("srcset");
    if (srcset) {
      const rewritten = srcset
        .split(",")
        .map((part: string) => {
          const [u, d] = part.trim().split(/\s+/, 2);
          return `${absolutize(u, base)}${d ? " " + d : ""}`;
        })
        .join(", ");
      img.setAttribute("srcset", rewritten);
    }
    img.removeAttribute("loading");
    img.setAttribute("referrerpolicy", "no-referrer");

    // --- Caption / alt-text enrichment -----------------------------------
    // Ensure every image carries meaningful alt text so screen readers and
    // the pasted note keep context even when the source lazy-loaded it.
    let alt = (img.getAttribute("alt") || "").trim();
    const title = (img.getAttribute("title") || "").trim();
    const ariaLabel = (img.getAttribute("aria-label") || "").trim();

    // Look for an explicit caption near the image.
    let captionText = "";
    const parentFigure = img.closest?.("figure");
    if (parentFigure) {
      const fc = parentFigure.querySelector("figcaption");
      if (fc) captionText = (fc.textContent || "").trim();
    }
    if (!captionText) {
      // WordPress / Ghost / Substack common caption containers.
      const wrap = img.parentElement;
      if (wrap) {
        const sib = wrap.querySelector?.(
          ".wp-caption-text, .caption, .image-caption, .figcaption, .kg-card-figcaption, [class*='caption' i]",
        );
        if (sib && sib !== img) {
          const t = (sib.textContent || "").trim();
          if (t && t.length < 400) captionText = t;
        }
      }
    }

    if (!alt) alt = title || ariaLabel || captionText || "";
    if (alt) img.setAttribute("alt", alt);
    if (captionText && !img.getAttribute("data-caption")) {
      img.setAttribute("data-caption", captionText);
    }

    // If the image has caption info but isn't already inside a <figure>,
    // wrap it so Readability preserves the caption in the final HTML.
    if (captionText && !parentFigure) {
      try {
        const fig = doc.createElement("figure");
        fig.setAttribute("style", "margin:1em 0");
        const cap = doc.createElement("figcaption");
        cap.setAttribute(
          "style",
          "font-size:0.9em;opacity:0.75;margin-top:4px;text-align:center",
        );
        cap.textContent = captionText;
        img.parentNode?.insertBefore(fig, img);
        fig.appendChild(img);
        fig.appendChild(cap);
      } catch { /* ignore */ }
    }
  });

  // Normalise existing <figure><figcaption> blocks so they survive
  // Readability's cleaner and render nicely in the note.
  doc.querySelectorAll("figure").forEach((fig: any) => {
    const cap = fig.querySelector("figcaption");
    if (cap && !cap.getAttribute("style")) {
      cap.setAttribute(
        "style",
        "font-size:0.9em;opacity:0.75;margin-top:4px;text-align:center",
      );
    }
    if (!fig.getAttribute("style")) fig.setAttribute("style", "margin:1em 0");
  });


  doc.querySelectorAll("a").forEach((a: any) => {
    const href = a.getAttribute("href");
    if (href) a.setAttribute("href", absolutize(href, base));
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  });

  doc.querySelectorAll("source").forEach((s: any) => {
    const src = s.getAttribute("src");
    if (src) s.setAttribute("src", absolutize(src, base));
    const srcset = s.getAttribute("srcset");
    if (srcset) {
      const rewritten = srcset
        .split(",")
        .map((part: string) => {
          const [u, d] = part.trim().split(/\s+/, 2);
          return `${absolutize(u, base)}${d ? " " + d : ""}`;
        })
        .join(", ");
      s.setAttribute("srcset", rewritten);
    }
  });

  doc.querySelectorAll("iframe, video, audio").forEach((el: any) => {
    const src = el.getAttribute("src");
    if (src) el.setAttribute("src", absolutize(src, base));
  });

  // <noscript><img></noscript> — many sites tuck the real image here for
  // no-JS clients. Promote the first <img> inside <noscript> to real DOM.
  doc.querySelectorAll("noscript").forEach((ns: any) => {
    try {
      const inner = ns.textContent || "";
      if (/<img\s/i.test(inner)) {
        const wrapper = doc.createElement("div");
        wrapper.innerHTML = inner;
        // Absolutize the promoted image immediately.
        wrapper.querySelectorAll("img").forEach((img: any) => {
          const s = img.getAttribute("src");
          if (s) img.setAttribute("src", absolutize(s, base));
        });
        ns.parentNode?.insertBefore(wrapper, ns);
      }
    } catch { /* ignore */ }
  });
}

/** Replace safe embeds (iframe / video / audio) IN PLACE inside the DOM
 *  before Readability runs. Preserving their original DOM position keeps
 *  the reading order of images / embeds relative to headings intact.
 *  Each replacement is a Readability-friendly node (figure) that survives
 *  the cleaner. Returns the number of embeds inlined. */
function inlineEmbeds(doc: Document, base: string): number {
  let count = 0;
  const seen = new Set<string>();

  const replaceWithHtml = (el: any, html: string, key: string) => {
    if (!html || seen.has(key)) { el.remove?.(); return; }
    seen.add(key);
    try {
      const wrapper = doc.createElement("div");
      wrapper.innerHTML = html;
      const node = wrapper.firstElementChild;
      if (node && el.parentNode) {
        el.parentNode.insertBefore(node, el);
        el.remove?.();
        count++;
      }
    } catch { /* ignore */ }
  };

  doc.querySelectorAll("iframe").forEach((el: any) => {
    const src = el.getAttribute("src");
    if (!src) { el.remove?.(); return; }
    const abs = absolutize(src, base);
    const title = (el.getAttribute("title") || "Embedded content").replace(/"/g, "&quot;");
    if (!isEmbedAllowed(abs)) {
      replaceWithHtml(el, embedFallback(abs, title), abs);
      return;
    }
    const w = el.getAttribute("width") || "560";
    const h = el.getAttribute("height") || "315";
    replaceWithHtml(
      el,
      `<figure style="margin:1em 0"><iframe src="${abs}" width="${w}" height="${h}" title="${title}" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"></iframe></figure>`,
      abs,
    );
  });

  doc.querySelectorAll("video").forEach((el: any) => {
    const poster = el.getAttribute("poster");
    const src = el.getAttribute("src");
    const sources: string[] = [];
    el.querySelectorAll("source").forEach((s: any) => {
      const ss = s.getAttribute("src");
      const t = s.getAttribute("type") || "";
      if (ss) sources.push(`<source src="${absolutize(ss, base)}"${t ? ` type="${t}"` : ""}>`);
    });
    const key = src || sources[0] || poster || "";
    if (!key) { el.remove?.(); return; }
    const hasPlayable = !!src || sources.length > 0;
    if (!hasPlayable) {
      replaceWithHtml(el, embedFallback(absolutize(key, base), "Video", poster ? absolutize(poster, base) : undefined), key);
      return;
    }
    replaceWithHtml(
      el,
      `<figure style="margin:1em 0"><video controls${poster ? ` poster="${absolutize(poster, base)}"` : ""}${src ? ` src="${absolutize(src, base)}"` : ""} style="max-width:100%">${sources.join("")}</video></figure>`,
      key,
    );
  });

  doc.querySelectorAll("audio").forEach((el: any) => {
    const src = el.getAttribute("src");
    if (!src) { el.remove?.(); return; }
    const abs = absolutize(src, base);
    replaceWithHtml(el, `<figure style="margin:1em 0"><audio controls src="${abs}"></audio></figure>`, abs);
  });

  return count;
}

/** Collect substantive outbound links from the raw article container so
 *  users don't lose citations when Readability trims link-heavy sections. */
function extractImportantLinks(
  doc: Document,
  base: string,
  keptContent: string,
): Array<{ href: string; text: string }> {
  const container =
    doc.querySelector("article") ||
    doc.querySelector("main") ||
    doc.body;
  if (!container) return [];

  const out: Array<{ href: string; text: string }> = [];
  const seen = new Set<string>();
  let baseHost = "";
  try { baseHost = new URL(base).hostname.replace(/^www\./, ""); } catch { /* ignore */ }

  container.querySelectorAll("a[href]").forEach((a: any) => {
    const raw = a.getAttribute("href");
    if (!raw || raw.startsWith("#") || raw.startsWith("javascript:")) return;
    const href = absolutize(raw, base);
    let host = "";
    try { host = new URL(href).hostname.replace(/^www\./, ""); } catch { return; }
    if (!host || host === baseHost) return;              // skip in-site nav
    const text = (a.textContent || "").trim().replace(/\s+/g, " ");
    if (text.length < 8 || text.length > 140) return;     // skip nav/icons/walls of text
    if (keptContent.includes(href)) return;               // already in body
    if (seen.has(href)) return;
    seen.add(href);
    out.push({ href, text });
  });

  return out.slice(0, 15);
}

function pickMeta(doc: Document, names: string[]): string {
  for (const name of names) {
    const el = doc.querySelector(
      `meta[property="${name}"], meta[name="${name}"], meta[itemprop="${name}"]`,
    );
    const c = el?.getAttribute("content");
    if (c && c.trim()) return c.trim();
  }
  return "";
}

function stripUnsafeInteractiveHtml(html: string): string {
  if (!html) return "";
  try {
    const { document } = parseHTML(`<main>${html}</main>`);
    document.querySelectorAll("script, style, noscript, template, canvas, dialog, form, input, button").forEach((el: any) => el.remove());
    document.querySelectorAll("a").forEach((a: any) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    });
    return (document.querySelector("main") as any)?.innerHTML || html;
  } catch {
    return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  }
}

function visiblePageFallback(doc: Document): string {
  const root = doc.querySelector("article") || doc.querySelector("main") || doc.body;
  const html = root ? (root as any).innerHTML || "" : "";
  return stripUnsafeInteractiveHtml(html);
}

/** Robust author extraction. Tries (in order):
 *   1. JSON-LD schema (Article.author.name / Person.name)
 *   2. Meta tags (author, article:author, byl, twitter:creator, parsely-author)
 *   3. Semantic DOM: <a rel="author">, [itemprop="author"], .author, .byline,
 *      .post-author, .article-author, .writer, [data-testid*="author"]
 *   4. Text following "By " prefix inside header/article regions.
 * Ensures we always paste the author name even when the primary selector fails. */
function extractAuthor(doc: Document): string {
  // 1. JSON-LD
  try {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const s of Array.from(scripts) as any[]) {
      const raw = s.textContent || "";
      if (!raw.trim()) continue;
      let json: any;
      try { json = JSON.parse(raw); } catch { continue; }
      const nodes = Array.isArray(json) ? json : (json["@graph"] ? json["@graph"] : [json]);
      for (const node of nodes) {
        const a = node?.author;
        if (!a) continue;
        if (typeof a === "string" && a.trim()) return a.trim();
        if (Array.isArray(a)) {
          const names = a.map((x: any) => (typeof x === "string" ? x : x?.name)).filter(Boolean);
          if (names.length) return names.join(", ").trim();
        }
        if (a?.name && typeof a.name === "string") return a.name.trim();
      }
    }
  } catch { /* ignore */ }

  // 2. Meta tags (already handled by caller via pickMeta, but do it here too as safety net)
  const meta = pickMeta(doc, ["author", "article:author", "byl", "twitter:creator", "parsely-author", "sailthru.author"]);
  if (meta && !/^https?:/i.test(meta)) return meta;

  // 3. Semantic DOM selectors
  const selectors = [
    'a[rel="author"]',
    '[itemprop="author"] [itemprop="name"]',
    '[itemprop="author"]',
    '[data-testid*="author" i]',
    '[data-testid*="byline" i]',
    '.author-name', '.byline-name', '.post-author', '.article-author',
    '.author', '.byline', '.c-byline', '.writer', '.entry-author',
  ];
  for (const sel of selectors) {
    try {
      const el = doc.querySelector(sel);
      const txt = (el?.textContent || "").trim().replace(/\s+/g, " ");
      if (txt && txt.length >= 2 && txt.length <= 120) {
        return txt.replace(/^by\s+/i, "").trim();
      }
    } catch { /* ignore */ }
  }

  // 4. "By …" prefix in header/article
  try {
    const region = doc.querySelector("header, article, main") || doc.body;
    const text = (region?.textContent || "").slice(0, 4000);
    const m = text.match(/\bBy\s+([A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){0,3})/u);
    if (m) return m[1].trim();
  } catch { /* ignore */ }

  return "";
}


function escapeHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function mdInline(s: string): string {
  return escapeHtml(s)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function markdownToHtml(md: string): string {
  const blocks: string[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push(`<p>${mdInline(para.join(" "))}</p>`); para = []; } };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^#{1,6}\s+/.test(line)) {
      flush();
      const level = Math.min(3, line.match(/^#+/)?.[0].length || 2);
      blocks.push(`<h${level}>${mdInline(line.replace(/^#{1,6}\s+/, ""))}</h${level}>`);
    } else if (/^!\[[^\]]*\]\([^)]+\)/.test(line)) {
      flush(); blocks.push(`<p>${mdInline(line)}</p>`);
    } else if (/^[-*]\s+/.test(line)) {
      flush(); blocks.push(`<ul><li>${mdInline(line.replace(/^[-*]\s+/, ""))}</li></ul>`);
    } else {
      para.push(line);
    }
  }
  flush();
  return blocks.join("\n").replace(/<\/ul>\n<ul>/g, "");
}

async function fetchJinaFallback(target: URL): Promise<any | null> {
  try {
    // Jina Reader often succeeds where direct server fetches are blocked by
    // paywalls/bot checks, and returns images + headings + article markdown.
    const jinaUrl = `https://r.jina.ai/http://${target.toString()}`;
    const res = await fetch(jinaUrl, { headers: { "accept": "text/plain" } });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.length < 500) return null;
    const title = text.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || target.hostname;
    const publishedTime = text.match(/^Published Time:\s*(.+)$/m)?.[1]?.trim() || "";
    let md = text.split(/Markdown Content:\s*/)[1] || text;
    const titleIdx = md.indexOf(`# ${title}`);
    if (titleIdx > 0) md = md.slice(titleIdx);
    const byline =
      md.match(/(?:Essay by|By)\s+\[?([^\]\n]+)\]?/i)?.[1]?.replace(/\(.+$/, "").trim() || "";
    const leadImage = md.match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/)?.[1] || "";
    const content = markdownToHtml(md.slice(0, 120_000));
    return {
      url: target.toString(), title, byline, siteName: target.hostname,
      excerpt: "", leadImage, publishedTime, content,
      textContent: md.replace(/[#*_\[\]()`>!-]/g, " ").replace(/\s+/g, " ").trim(),
      length: md.length, embeds: [], importantLinks: [], source: "jina-reader",
    };
  } catch { return null; }
}

/** Fetch a URL server-side with a specific User-Agent. Returns either the
 *  decoded HTML or a terminal `Response` (paywall/blocked/timeout/too-large)
 *  that the caller should return directly to the client without retrying. */
async function fetchTargetHtml(
  target: URL,
  userAgent: string,
): Promise<{ html?: string; terminal?: Response }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await safeFetch(target.toString(), {
      signal: controller.signal,
      headers: {
        "user-agent": userAgent,
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    if (!res) {
      return {
        terminal: new Response(
          JSON.stringify({ error: "blocked: target host is not reachable or points at a private/internal address", code: "blocked_host" }),
          { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
        ),
      };
    }
    const status = res.status;
    if (!res.ok) {
      const fallback = await fetchJinaFallback(target);
      if (fallback) {
        return {
          terminal: new Response(JSON.stringify(fallback), {
            status: 200,
            headers: { ...corsHeaders, "content-type": "application/json", "cache-control": "public, max-age=300" },
          }),
        };
      }
      const code =
        status === 401 || status === 403 ? "paywall" :
        status === 404 ? "not_found" :
        status === 429 ? "rate_limited" :
        "upstream_error";
      return {
        terminal: new Response(JSON.stringify({ error: `fetch failed ${status}`, code, status }), {
          status: 502,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }),
      };
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) {
      return {
        terminal: new Response(JSON.stringify({ error: "page too large", code: "too_large" }), {
          status: 413,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }),
      };
    }
    return { html: new TextDecoder("utf-8").decode(buf) };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return {
        terminal: new Response(JSON.stringify({ error: "fetch timed out", code: "timeout" }), {
          status: 504,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }),
      };
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { url, mode: rawMode } = body || {};
    const mode = String(rawMode || "").toLowerCase();
    // Clean-article mode is the default: strip ads/nav/footer/related-stories,
    // keep title, headings, images (with captions), links, references. Only
    // return the raw start-to-end HTML when the caller explicitly asks for
    // `mode: "fullpage"`. `selection` is highlight text (client-side only).
    const wantFullPage = mode === "fullpage";
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url required", code: "bad_input" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    let target: URL;
    try {
      target = new URL(url);
      if (!["http:", "https:"].includes(target.protocol)) throw new Error("bad proto");
    } catch {
      return new Response(JSON.stringify({ error: "invalid url", code: "bad_url" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // ── Auth gate (no quota) ─────────────────────────────────────────────
    // Web Clipper is unlimited for every authenticated user. We still
    // require a signed-in caller so anonymous traffic can't burn our
    // outbound fetch budget, but there is NO per-user monthly cap.
    const authHeader = req.headers.get("Authorization") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const isAnonHeader = !accessToken || accessToken === anonKey;
    if (isAnonHeader) {
      return new Response(
        JSON.stringify({ error: "Sign in required to use the Web Clipper.", code: "auth_required" }),
        { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }
    




    // Initial upstream fetch — use the "real browser" UA first. Subsequent
    // re-fetches (see the extraction retry loop below) rotate through
    // UA_VARIANTS so bot-friendly or mobile-rendered variants can rescue
    // meta-only / half-article responses.
    const initialFetch = await fetchTargetHtml(target, UA_VARIANTS[0]);
    if (initialFetch.terminal) return initialFetch.terminal;
    let html = initialFetch.html || "";

    const { document } = parseHTML(html);
    const base = target.toString();

    // Absolutize + un-lazy the whole document BEFORE Readability runs so
    // its cleaner keeps absolute URLs and real image sources.
    absolutizeDoc(document as any, base);

    // Grab metadata BEFORE Readability strips <head>.
    const metaTitle =
      pickMeta(document as any, ["og:title", "twitter:title"]) ||
      document.querySelector("title")?.textContent?.trim() ||
      "";
    const metaAuthor = pickMeta(document as any, [
      "author", "article:author", "byl", "twitter:creator", "parsely-author",
    ]);
    const metaSite = pickMeta(document as any, [
      "og:site_name", "application-name", "twitter:site",
    ]) || target.hostname;
    const metaImage = pickMeta(document as any, [
      "og:image", "twitter:image", "twitter:image:src",
    ]);
    const metaDescription = pickMeta(document as any, [
      "og:description", "twitter:description", "description",
    ]);
    const metaPublished = pickMeta(document as any, [
      "article:published_time", "og:published_time", "datePublished", "date",
    ]);

    // Embeds inlining + visible-fallback preservation happen inside the
    // per-attempt retry loop below for article mode. In full-page mode we
    // want the raw page as-is, so nothing to do here.

    // FULL-PAGE MODE — return the entire raw HTML (start-to-end) without
    // Readability trimming. Icons, ads, everything the page shipped.
    if (wantFullPage) {
      const domAuthor = extractAuthor(document as any);
      const title = (metaTitle || target.hostname).trim();
      const byline = (metaAuthor || domAuthor || "").trim();
      const siteName = (metaSite || "").trim();
      const leadImage = metaImage ? absolutize(metaImage, base) : "";
      // Inline every referenced asset (CSS, JS, images, fonts, favicons) into
      // the document as data: URIs so the captured page renders fully offline
      // without any network access. Best-effort + budget-capped; failed fetches
      // fall back to absolute URLs so nothing breaks.
      try {
        await inlineAllAssets(document as any, base);
      } catch (inlineErr) {
        console.warn("[fetch-article] asset inlining failed", inlineErr);
      }
      // Serialize the ENTIRE document — DOCTYPE, <html>, <head> (title, meta,
      // links, icons), and <body> (all elements, ads, scripts-as-text). This
      // matches the raw HTML the browser rendered, with assets bundled inline
      // so the inline page capture loads without hitting the network.
      const docEl = document.documentElement as any;
      const outerHtml: string =
        (docEl && typeof docEl.outerHTML === "string" && docEl.outerHTML) ||
        html;
      // Preserve the original DOCTYPE where present, else default to HTML5.
      const doctypeMatch = html.match(/^\s*<!doctype[^>]*>/i);
      const doctype = doctypeMatch ? doctypeMatch[0] : "<!DOCTYPE html>";
      const fullDocument = `${doctype}\n${outerHtml}`;
      const capped = capHtml(fullDocument, MAX_FULLPAGE_HTML_BYTES);
      const images = extractImageUrls(capped.html);
      return new Response(
        JSON.stringify({
          url: base,
          title,
          byline,
          author: byline,
          siteName,
          excerpt: (metaDescription || "").trim(),
          leadImage,
          publishedTime: metaPublished,
          content: capped.html,
          contentHtml: capped.html,
          rawHtml: capped.html,
          images,
          textContent: "",
          length: capped.html.length,
          truncated: capped.truncated,
          fallback: false,
          embeds: [] as string[],
          importantLinks: [] as Array<{ href: string; text: string }>,
          mode: "fullpage",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "content-type": "application/json",
            "cache-control": "public, max-age=300",
          },
        },
      );
    }


    // ── Article extraction with meta-only / half-response retry loop ─────
    // Some sites return an SPA shell, a paywall stub, or a mid-transfer
    // truncated payload on first fetch. We run the full extraction pipeline
    // once, then validate the produced body against `looksIncomplete()`. If
    // it looks like meta-only or a half-article response we re-fetch the
    // upstream with the next UA variant (googlebot, mobile Safari, FB crawler)
    // and re-run extraction. We keep the attempt that produced the longest
    // clean body text so the user always gets the most complete version.
    let bestPayload: Record<string, unknown> | null = null;
    let bestBodyLen = -1;
    let bestExcerptLen = 0;
    // The initial fetch already populated `document` / `html`. Reuse it for
    // attempt 0; subsequent attempts re-fetch and re-parse from scratch.
    let currentDoc: any = document;
    for (let attempt = 0; attempt < UA_VARIANTS.length; attempt++) {
      if (attempt > 0) {
        const next = await fetchTargetHtml(target, UA_VARIANTS[attempt]);
        if (next.terminal || !next.html) break;
        html = next.html;
        const parsed = parseHTML(html);
        currentDoc = parsed.document;
        absolutizeDoc(currentDoc, base);
      }

      inlineEmbeds(currentDoc, base);
      const visibleFallbackHtml = visiblePageFallback(currentDoc);
      cleanArticleDom(currentDoc);

      let article: any = null;
      try {
        article = new Readability(currentDoc, {
          charThreshold: 200,
          keepClasses: false,
        }).parse();
      } catch (e) {
        console.warn("[fetch-article] Readability failed", e);
      }

      const domAuthor = extractAuthor(currentDoc);
      const title = (article?.title || metaTitle || target.hostname).trim();
      const byline = (article?.byline || metaAuthor || domAuthor || "").trim();
      const siteName = (article?.siteName || metaSite || "").trim();
      const excerpt = (article?.excerpt || metaDescription || "").trim();
      const content = article?.content || visibleFallbackHtml || "";
      const textContent = (article?.textContent || "").trim();
      const leadImage = metaImage ? absolutize(metaImage, base) : "";
      const length = article?.length || textContent.length;

      const importantLinks = extractImportantLinks(currentDoc, base, content);
      const initialCapped = capHtml(String(content || ""), MAX_CONTENT_HTML_BYTES);
      const initialBodyText = initialCapped.html.replace(/<[^>]+>/g, "").trim();
      const visibleCapped = capHtml(visibleFallbackHtml, MAX_CONTENT_HTML_BYTES);
      const visibleBodyText = visibleCapped.html.replace(/<[^>]+>/g, "").trim();
      const capped = visibleBodyText.length > initialBodyText.length * 1.4 && initialBodyText.length < 1200
        ? visibleCapped
        : initialCapped;
      const bodyText = capped.html.replace(/<[^>]+>/g, "").trim();
      const isThin = bodyText.length < 200;
      let responseContent = capped.html;
      if (isThin) {
        const safeTitle = escapeHtml(title);
        const hero = leadImage
          ? `<p><img src="${leadImage}" alt="${safeTitle}" referrerpolicy="no-referrer" style="max-width:100%;height:auto;border-radius:8px" /></p>`
          : "";
        responseContent =
          `<section class="flowist-web-clip-body">` +
          (hero || "") +
          (capped.html || `<h1>${safeTitle}</h1>`) +
          `<p><em>Some sections may be missing — the page renders extra content with JavaScript. Open the original for the complete article.</em></p>` +
          `</section>`;
      }
      const images = extractImageUrls(responseContent);

      const payload: Record<string, unknown> = {
        url: base,
        title,
        byline,
        author: byline,
        siteName,
        excerpt,
        leadImage,
        publishedTime: metaPublished,
        content: responseContent,
        contentHtml: responseContent,
        images,
        textContent,
        length,
        truncated: capped.truncated,
        fallback: false,
        embeds: [] as string[],
        importantLinks,
      };

      // Track the best attempt so the final response is always the most
      // complete version we saw, even if the last attempt regressed.
      if (bodyText.length > bestBodyLen) {
        bestBodyLen = bodyText.length;
        bestExcerptLen = excerpt.length;
        bestPayload = payload;
      }

      const incomplete = looksIncomplete(bodyText, excerpt);
      console.info("[fetch-article] extraction attempt", {
        attempt,
        ua: UA_VARIANTS[attempt].slice(0, 40),
        bodyLen: bodyText.length,
        excerptLen: excerpt.length,
        incomplete,
      });
      if (!incomplete) break;
    }

    // If every attempt still looks meta-only / half, ask Jina Reader as a
    // final rescue. Only replace `bestPayload` when Jina genuinely returned
    // more content than any direct attempt.
    if (looksIncomplete(String((bestPayload?.textContent as string) || "").length ? String(bestPayload?.textContent) : "".padEnd(bestBodyLen, "x"), String(bestPayload?.excerpt || "")) || bestBodyLen < 800) {
      const fallback = await fetchJinaFallback(target);
      const fallbackLen = Number(fallback?.length || 0);
      if (fallback && fallbackLen > Math.max(bestBodyLen, Number(bestPayload?.length || 0))) {
        const capped = capHtml(String(fallback.content || ""), MAX_CONTENT_HTML_BYTES);
        const images = extractImageUrls(capped.html);
        bestPayload = {
          ...fallback,
          contentHtml: capped.html,
          author: fallback.byline || "",
          images,
          truncated: capped.truncated,
          fallback: false,
        };
      }
    }

    return new Response(
      JSON.stringify(bestPayload ?? { url: base, error: "no content extracted", code: "empty" }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "content-type": "application/json",
          "cache-control": "public, max-age=300",
        },
      },
    );
  } catch (err) {
    console.error("[fetch-article] error", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "failed", code: "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
