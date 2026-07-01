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
const FETCH_TIMEOUT_MS = 20_000;

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

const EMBED_HOST_ALLOWLIST = [
  "youtube.com", "youtube-nocookie.com", "youtu.be",
  "vimeo.com", "player.vimeo.com",
  "twitter.com", "x.com", "platform.twitter.com",
  "instagram.com",
  "tiktok.com",
  "soundcloud.com", "w.soundcloud.com",
  "spotify.com", "open.spotify.com",
  "dailymotion.com",
  "loom.com",
  "wistia.com", "fast.wistia.net",
  "codepen.io",
  "gist.github.com", "github.com",
  "codesandbox.io",
];

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

/** Collect safe embeds (video / iframe / audio) BEFORE Readability strips
 *  them. Returns HTML fragments ready to append back into the note. */
function extractEmbeds(doc: Document, base: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (html: string, key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push(html);
  };

  doc.querySelectorAll("iframe").forEach((el: any) => {
    const src = el.getAttribute("src");
    if (!src) return;
    const abs = absolutize(src, base);
    if (!isEmbedAllowed(abs)) return;
    const w = el.getAttribute("width") || "560";
    const h = el.getAttribute("height") || "315";
    const title = (el.getAttribute("title") || "Embedded content").replace(/"/g, "&quot;");
    push(
      `<p><iframe src="${abs}" width="${w}" height="${h}" title="${title}" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></p>`,
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
    if (!key) return;
    push(
      `<p><video controls${poster ? ` poster="${absolutize(poster, base)}"` : ""}${src ? ` src="${absolutize(src, base)}"` : ""} style="max-width:100%">${sources.join("")}</video></p>`,
      key,
    );
  });

  doc.querySelectorAll("audio").forEach((el: any) => {
    const src = el.getAttribute("src");
    if (!src) return;
    const abs = absolutize(src, base);
    push(`<p><audio controls src="${abs}"></audio></p>`, abs);
  });

  return out;
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

    // Extract embeds & links from the pre-Readability DOM.
    const embeds = extractEmbeds(document as any, base);

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

    const title = (article?.title || metaTitle || target.hostname).trim();
    const byline = (article?.byline || metaAuthor || "").trim();
    const siteName = (article?.siteName || metaSite || "").trim();
    const excerpt = (article?.excerpt || metaDescription || "").trim();
    const content = article?.content || bodyFallback();
    const textContent = (article?.textContent || "").trim();
    const leadImage = metaImage ? absolutize(metaImage, base) : "";
    const length = article?.length || textContent.length;

    const importantLinks = extractImportantLinks(document as any, base, content);

    return new Response(
      JSON.stringify({
        url: base,
        title,
        byline,
        siteName,
        excerpt,
        leadImage,
        publishedTime: metaPublished,
        content,
        textContent,
        length,
        embeds,          // string[] of safe iframe/video/audio HTML
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
