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
import { parseHTML } from "https://esm.sh/linkedom@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5MB page cap
const MAX_CONTENT_HTML_BYTES = 500 * 1024; // 500KB cap on returned clip HTML
const FETCH_TIMEOUT_MS = 20_000;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url } = await req.json();
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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let html = "";
    let status = 0;
    try {
      const res = await fetch(target.toString(), {
        signal: controller.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 Flowist-Clipper/1.0",
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
        redirect: "follow",
      });
      status = res.status;
      if (!res.ok) {
        const fallback = await fetchJinaFallback(target);
        if (fallback) {
          return new Response(JSON.stringify(fallback), {
            status: 200,
            headers: { ...corsHeaders, "content-type": "application/json", "cache-control": "public, max-age=300" },
          });
        }
        const code =
          status === 401 || status === 403 ? "paywall" :
          status === 404 ? "not_found" :
          status === 429 ? "rate_limited" :
          "upstream_error";
        return new Response(JSON.stringify({ error: `fetch failed ${status}`, code, status }), {
          status: 502,
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_HTML_BYTES) {
        return new Response(JSON.stringify({ error: "page too large", code: "too_large" }), {
          status: 413,
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
      html = new TextDecoder("utf-8").decode(buf);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return new Response(JSON.stringify({ error: "fetch timed out", code: "timeout" }), {
          status: 504,
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

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

    // Inline embeds into the DOM (preserves order vs. headings/images).
    inlineEmbeds(document as any, base);

    let article: any = null;
    try {
      const reader = new Readability(document as any, {
        charThreshold: 200,
        keepClasses: false,
      });
      article = reader.parse();
    } catch (e) {
      console.warn("[fetch-article] Readability failed", e);
    }

    // Fallback: whole <body> if Readability gave up.
    const bodyFallback = () => {
      const b = document.querySelector("article") || document.querySelector("main") || document.body;
      return b ? (b as any).innerHTML : "";
    };

    const domAuthor = extractAuthor(document as any);
    const title = (article?.title || metaTitle || target.hostname).trim();
    const byline = (article?.byline || metaAuthor || domAuthor || "").trim();
    const siteName = (article?.siteName || metaSite || "").trim();
    const excerpt = (article?.excerpt || metaDescription || "").trim();
    const content = article?.content || bodyFallback();
    const textContent = (article?.textContent || "").trim();
    const leadImage = metaImage ? absolutize(metaImage, base) : "";
    const length = article?.length || textContent.length;

    if (length < 800 || !content || content.trim().length < 1200) {
      const fallback = await fetchJinaFallback(target);
      if (fallback && fallback.length > length) {
        const capped = capHtml(String(fallback.content || ""), MAX_CONTENT_HTML_BYTES);
        const images = extractImageUrls(capped.html);
        const enriched = {
          ...fallback,
          contentHtml: capped.html,
          author: fallback.byline || "",
          images,
          truncated: capped.truncated,
          fallback: false,
        };
        return new Response(JSON.stringify(enriched), {
          status: 200,
          headers: { ...corsHeaders, "content-type": "application/json", "cache-control": "public, max-age=300" },
        });
      }
    }

    const importantLinks = extractImportantLinks(document as any, base, content);
    const capped = capHtml(String(content || ""), MAX_CONTENT_HTML_BYTES);

    // Always return the full extracted clip — no metadata-only card fallback.
    // If Readability + jina both produced very little body, we still ship
    // whatever HTML we have plus a small notice; the client can render it.
    const bodyText = capped.html.replace(/<[^>]+>/g, "").trim();
    const isThin = bodyText.length < 200;
    let responseContent = capped.html;
    if (isThin) {
      const safeTitle = escapeHtml(title);
      const hero = leadImage
        ? `<p><img src="${leadImage}" alt="${safeTitle}" referrerpolicy="no-referrer" style="max-width:100%;height:auto;border-radius:8px" /></p>`
        : "";
      // Wrap the (thin) extracted content so nothing is discarded — user sees
      // headings/images we DID find, plus a small notice at the end.
      responseContent =
        `<section class="flowist-web-clip-body">` +
        (hero || "") +
        (capped.html || `<h1>${safeTitle}</h1>`) +
        `<p><em>Some sections may be missing — the page renders extra content with JavaScript. Open the original for the complete article.</em></p>` +
        `</section>`;
    }
    const images = extractImageUrls(responseContent);


    return new Response(
      JSON.stringify({
        url: base,
        title,
        byline,
        author: byline,           // spec alias
        siteName,
        excerpt,
        leadImage,
        publishedTime: metaPublished,
        content: responseContent,
        contentHtml: responseContent, // spec alias
        images,
        textContent,
        length,
        truncated: capped.truncated,
        fallback: false,
        embeds: [] as string[], // embeds are now inlined into `content` at their original position
        importantLinks,  // [{ href, text }]
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
  } catch (err) {
    console.error("[fetch-article] error", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "failed", code: "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
