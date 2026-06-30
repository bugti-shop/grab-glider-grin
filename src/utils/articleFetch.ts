// Lightweight in-browser article extractor.
// Uses public CORS-friendly fetch proxies, then runs a Readability-style
// scoring pass to pick the dominant content container and preserves headings,
// paragraphs, lists, blockquotes, code blocks, and images.

import { sanitizeHtml } from '@/lib/sanitize';

export interface FetchedArticle {
  title: string;
  /** Sanitized HTML safe to inject into the editor. */
  html: string;
  /** Plain-text excerpt (first ~280 chars). */
  excerpt: string;
  /** Best-guess meta description. */
  description?: string;
  /** Best-guess hero image absolute URL. */
  heroImage?: string;
  /** Detected H1/H2/H3 outline. */
  headings: Array<{ level: 1 | 2 | 3; text: string }>;
  sourceUrl: string;
}

const PROXIES = [
  // Returns raw HTML, no JSON wrapper. Stable and CORS-enabled.
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  // Fallback: returns the page body as plain text.
  (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
];

const fetchHtml = async (url: string, signal?: AbortSignal): Promise<string> => {
  let lastErr: unknown;
  for (const make of PROXIES) {
    try {
      const res = await fetch(make(url), { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text && text.length > 200) return text;
      lastErr = new Error('Empty response');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('All proxies failed');
};

const absolutize = (raw: string | null | undefined, base: string): string | undefined => {
  if (!raw) return undefined;
  try { return new URL(raw, base).toString(); } catch { return undefined; }
};

const textOf = (el: Element | null): string =>
  (el?.textContent || '').replace(/\s+/g, ' ').trim();

const STRIP_SELECTORS = [
  'script', 'style', 'noscript', 'iframe', 'svg', 'form', 'nav', 'aside',
  'header', 'footer', '[role="navigation"]', '[role="banner"]',
  '[role="contentinfo"]', '[aria-hidden="true"]',
  '.ad', '.ads', '.advertisement', '.share', '.social', '.comments',
  '.newsletter', '.subscribe', '.related', '.sidebar', '.breadcrumbs',
];

/** Heuristic content scoring: count paragraph text length, penalize link-heavy blocks. */
const scoreNode = (node: Element): number => {
  const ps = node.querySelectorAll('p');
  let score = 0;
  ps.forEach((p) => {
    const text = (p.textContent || '').trim();
    if (text.length < 25) return;
    score += text.length;
    if ((p.textContent || '').split(',').length > 2) score += 10;
  });
  const links = node.querySelectorAll('a');
  const linkChars = Array.from(links).reduce(
    (n, a) => n + (a.textContent || '').length,
    0,
  );
  const allChars = (node.textContent || '').length || 1;
  const linkDensity = linkChars / allChars;
  return score * (1 - Math.min(linkDensity, 0.9));
};

const pickBestNode = (doc: Document): Element => {
  // Prefer obvious article containers first.
  const direct =
    doc.querySelector('article') ||
    doc.querySelector('[itemprop="articleBody"]') ||
    doc.querySelector('main');
  if (direct && (direct.textContent || '').trim().length > 400) return direct;

  let best: Element = doc.body || doc.documentElement;
  let bestScore = -1;
  doc.querySelectorAll('article, main, section, div').forEach((el) => {
    if (el.children.length === 0) return;
    const s = scoreNode(el);
    if (s > bestScore) {
      bestScore = s;
      best = el;
    }
  });
  return best;
};

const ALLOWED_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE',
  'STRONG', 'B', 'EM', 'I', 'U', 'A', 'IMG', 'BR', 'HR',
  'FIGURE', 'FIGCAPTION', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
]);

const cleanNode = (node: Element, base: string): void => {
  // Remove obvious noise.
  node.querySelectorAll(STRIP_SELECTORS.join(',')).forEach((n) => n.remove());

  // Walk descendants and strip disallowed tags while keeping their text.
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
  const toUnwrap: Element[] = [];
  let cur: Node | null = walker.currentNode;
  while ((cur = walker.nextNode())) {
    const el = cur as Element;
    if (!ALLOWED_TAGS.has(el.tagName)) {
      toUnwrap.push(el);
      continue;
    }
    // Drop noisy attributes; absolutize href/src.
    if (el.tagName === 'A') {
      const href = absolutize(el.getAttribute('href'), base);
      Array.from(el.attributes).forEach((a) => el.removeAttribute(a.name));
      if (href) {
        el.setAttribute('href', href);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    } else if (el.tagName === 'IMG') {
      const src = absolutize(el.getAttribute('src') || el.getAttribute('data-src'), base);
      const alt = el.getAttribute('alt') || '';
      Array.from(el.attributes).forEach((a) => el.removeAttribute(a.name));
      if (!src) {
        toUnwrap.push(el);
      } else {
        el.setAttribute('src', src);
        if (alt) el.setAttribute('alt', alt);
        el.setAttribute('loading', 'lazy');
      }
    } else {
      Array.from(el.attributes).forEach((a) => el.removeAttribute(a.name));
    }
  }

  for (const el of toUnwrap) {
    const parent = el.parentNode;
    if (!parent) continue;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }
};

const collectHeadings = (root: Element): FetchedArticle['headings'] => {
  const out: FetchedArticle['headings'] = [];
  root.querySelectorAll('h1, h2, h3').forEach((h) => {
    const text = textOf(h);
    if (!text) return;
    const level = (Number(h.tagName.substring(1)) as 1 | 2 | 3);
    out.push({ level, text });
  });
  return out;
};

/** Fetch and parse a public article URL. Throws on network or parse failure. */
export const fetchArticleFromUrl = async (
  rawUrl: string,
  opts: { signal?: AbortSignal } = {},
): Promise<FetchedArticle> => {
  // Validate URL up front.
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error('Please enter a valid URL (https://…)');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http/https URLs are supported.');
  }

  const raw = await fetchHtml(url.toString(), opts.signal);
  const doc = new DOMParser().parseFromString(raw, 'text/html');

  const base = url.toString();
  // Honor <base href>.
  const baseEl = doc.querySelector('base[href]');
  const baseHref = baseEl ? absolutize(baseEl.getAttribute('href'), base) : base;

  const meta = (sel: string): string =>
    (doc.querySelector(sel) as HTMLMetaElement | null)?.content?.trim() || '';
  const title =
    meta('meta[property="og:title"]') ||
    meta('meta[name="twitter:title"]') ||
    textOf(doc.querySelector('h1')) ||
    textOf(doc.querySelector('title')) ||
    'Untitled article';
  const description =
    meta('meta[name="description"]') ||
    meta('meta[property="og:description"]') ||
    undefined;
  const heroImage = absolutize(
    meta('meta[property="og:image"]') ||
      meta('meta[name="twitter:image"]') ||
      (doc.querySelector('article img, main img') as HTMLImageElement | null)?.getAttribute('src') ||
      null,
    baseHref || base,
  );

  const best = pickBestNode(doc);
  // Clone before mutating so we don't affect score calculations.
  const clone = best.cloneNode(true) as Element;
  cleanNode(clone, baseHref || base);

  if ((clone.textContent || '').trim().length < 120) {
    throw new Error('Could not find readable article content on this page.');
  }

  const headings = collectHeadings(clone);
  const html = sanitizeHtml(clone.innerHTML);
  const excerpt = (clone.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 280);

  return {
    title,
    html,
    excerpt,
    description,
    heroImage,
    headings,
    sourceUrl: url.toString(),
  };
};
