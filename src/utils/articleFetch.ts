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

/** Ordered list of public CORS-friendly fetch proxies. Tried sequentially
 *  with a per-proxy timeout and one transient-error retry before moving on. */
const PROXIES: Array<{ name: string; build: (u: string) => string }> = [
  { name: 'allorigins', build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
  { name: 'corsproxy.io', build: (u) => `https://corsproxy.io/?${encodeURIComponent(u)}` },
  { name: 'isomorphic-git', build: (u) => `https://cors.isomorphic-git.org/${u}` },
  { name: 'codetabs', build: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` },
];

const PROXY_TIMEOUT_MS = 12_000;
const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 522, 524]);

export class ArticleFetchError extends Error {
  /** Stable code so the UI can render a tailored message + recovery hint. */
  code:
    | 'invalid_url'
    | 'unsupported_protocol'
    | 'timeout'
    | 'blocked'
    | 'not_found'
    | 'rate_limited'
    | 'server_error'
    | 'empty_response'
    | 'unreadable'
    | 'network'
    | 'unknown';
  /** Last proxy attempted, if any — helpful for diagnostics in the dialog. */
  attemptedProxy?: string;
  /** Last HTTP status observed across attempts. */
  lastStatus?: number;

  constructor(
    message: string,
    code: ArticleFetchError['code'],
    extras: { attemptedProxy?: string; lastStatus?: number } = {},
  ) {
    super(message);
    this.name = 'ArticleFetchError';
    this.code = code;
    this.attemptedProxy = extras.attemptedProxy;
    this.lastStatus = extras.lastStatus;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fetchWithTimeout = async (
  url: string,
  external: AbortSignal | undefined,
  timeoutMs: number,
): Promise<Response> => {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort(external?.reason);
  if (external) {
    if (external.aborted) ctrl.abort(external.reason);
    else external.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener('abort', onAbort);
  }
};

const fetchHtml = async (
  url: string,
  signal?: AbortSignal,
): Promise<string> => {
  let lastStatus: number | undefined;
  let lastProxy: string | undefined;
  let lastErr: unknown;

  for (const proxy of PROXIES) {
    lastProxy = proxy.name;
    // One retry per proxy on transient failures, then move on.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) {
        throw new ArticleFetchError('Cancelled.', 'unknown', { attemptedProxy: lastProxy });
      }
      try {
        const res = await fetchWithTimeout(proxy.build(url), signal, PROXY_TIMEOUT_MS);
        lastStatus = res.status;
        if (!res.ok) {
          if (TRANSIENT_STATUSES.has(res.status) && attempt === 0) {
            await sleep(400);
            continue;
          }
          // Non-transient (404/403/etc.) — skip retry, try next proxy.
          lastErr = new Error(`HTTP ${res.status}`);
          break;
        }
        const text = await res.text();
        if (text && text.length > 200 && /<\w/.test(text)) return text;
        lastErr = new Error('Empty response');
        break;
      } catch (e) {
        lastErr = e;
        // Honor explicit user cancellation immediately.
        if (signal?.aborted) {
          throw new ArticleFetchError('Cancelled.', 'unknown', { attemptedProxy: lastProxy });
        }
        // On timeout / network failure, retry once on the same proxy.
        if (attempt === 0) {
          await sleep(300);
          continue;
        }
      }
    }
  }

  // Map the last failure to a stable error code.
  const isTimeout =
    lastErr instanceof DOMException && lastErr.name === 'TimeoutError';
  const isAbort = lastErr instanceof DOMException && lastErr.name === 'AbortError';
  let code: ArticleFetchError['code'] = 'unknown';
  let msg = 'Could not reach this page through any of our fetch proxies.';

  if (isTimeout || isAbort) {
    code = 'timeout';
    msg = 'The page took too long to respond. It may be slow or blocking automated fetches.';
  } else if (lastStatus === 404) {
    code = 'not_found';
    msg = 'That page returned 404 — check the URL is still live.';
  } else if (lastStatus === 401 || lastStatus === 403) {
    code = 'blocked';
    msg = 'The site refused the request (login wall, paywall, or anti-bot block).';
  } else if (lastStatus === 429) {
    code = 'rate_limited';
    msg = 'Our fetch proxies are rate-limited right now. Wait a minute and try again.';
  } else if (lastStatus && lastStatus >= 500) {
    code = 'server_error';
    msg = 'The source site or proxy returned a server error. Try again shortly.';
  } else if (lastErr instanceof Error && /Empty response/.test(lastErr.message)) {
    code = 'empty_response';
    msg = 'The page loaded but returned no usable HTML — likely a JavaScript-only app.';
  } else if (lastErr instanceof TypeError) {
    code = 'network';
    msg = 'Network error while contacting fetch proxies. Check your connection and retry.';
  }

  throw new ArticleFetchError(msg, code, {
    attemptedProxy: lastProxy,
    lastStatus,
  });
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
