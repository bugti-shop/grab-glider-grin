// Edge function: fetch a URL server-side and extract full article content
// using Mozilla Readability (Evernote-style Web Clipper). Returns title,
// author/byline, siteName, lead image, full HTML body (with <img> tags
// preserved and made absolute) and a plain-text version.
//
// Public — no auth required. Rate-limited implicitly via Supabase.

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

function absolutize(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

/** Rewrite every <img src> / srcset / <a href> to absolute URLs so the
 *  saved note works even when the source site is offline. */
function absolutizeDoc(doc: Document, base: string) {
  doc.querySelectorAll("img").forEach((img: any) => {
    const src = img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src");
    if (src) img.setAttribute("src", absolutize(src, base));
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
      return new Response(JSON.stringify({ error: "url required" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    let target: URL;
    try {
      target = new URL(url);
      if (!["http:", "https:"].includes(target.protocol)) throw new Error("bad proto");
    } catch {
      return new Response(JSON.stringify({ error: "invalid url" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let html = "";
    try {
      const res = await fetch(target.toString(), {
        signal: controller.signal,
        headers: {
          // Look like a normal browser so paywalls/CDNs return the article.
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 Flowist-Clipper/1.0",
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
        redirect: "follow",
      });
      if (!res.ok) {
        return new Response(JSON.stringify({ error: `fetch failed ${res.status}` }), {
          status: 502,
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_HTML_BYTES) {
        return new Response(JSON.stringify({ error: "page too large" }), {
          status: 413,
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
      html = new TextDecoder("utf-8").decode(buf);
    } finally {
      clearTimeout(timer);
    }

    const { document } = parseHTML(html);
    const base = target.toString();

    // Absolutize inside the *whole* document before Readability runs so
    // its cleaner keeps absolute URLs.
    absolutizeDoc(document as any, base);

    // Grab metadata fields BEFORE Readability strips <head>.
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

    return new Response(
      JSON.stringify({
        url: base,
        title,
        byline,
        siteName,
        excerpt,
        leadImage,
        publishedTime: metaPublished,
        content,        // sanitized-by-Readability HTML with absolute <img>
        textContent,
        length,
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
    return new Response(JSON.stringify({ error: (err as Error).message || "failed" }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
