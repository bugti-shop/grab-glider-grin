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
    const title = (el.getAttribute("title") || "Embedded content").replace(/"/g, "&quot;");
    if (!isEmbedAllowed(abs)) {
      // Unsupported embed → link-card fallback so users still get a click-through.
      push(embedFallback(abs, title), abs);
      return;
    }
    const w = el.getAttribute("width") || "560";
    const h = el.getAttribute("height") || "315";
    push(
      `<p><iframe src="${abs}" width="${w}" height="${h}" title="${title}" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"></iframe></p>`,
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
    const hasPlayable = !!src || sources.length > 0;
    if (!hasPlayable) {
      // No playable source (DRM / blob-only). Emit thumbnail fallback.
      push(embedFallback(absolutize(key, base), "Video", poster ? absolutize(poster, base) : undefined), key);
      return;
    }
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

    if (length < 800 || !content || content.trim().length < 1200) {
      const fallback = await fetchJinaFallback(target);
      if (fallback && fallback.length > length) {
        return new Response(JSON.stringify(fallback), {
          status: 200,
          headers: { ...corsHeaders, "content-type": "application/json", "cache-control": "public, max-age=300" },
        });
      }
    }

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
