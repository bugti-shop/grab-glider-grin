/**
 * Web Clipper helpers — shared between the /webclipper route and the
 * native Share-target hook (`useShareIntent`). Kept in a standalone module
 * so the validation/sanitization logic is unit-testable in isolation
 * (see `src/test/webClipper.test.ts`).
 */
import { stripHtml } from '@/lib/sanitize';

export const MAX_LENGTHS = {
  title: 200,
  url: 2048,
  content: 50000,
  selection: 10000,
  attachment: 4096,
} as const;

export type ClipMode = 'article' | 'selection' | 'fullpage' | 'image' | 'pdf';

/** Window (ms) within which an identical share payload is treated as a duplicate. */
export const SHARE_DEDUP_WINDOW_MS = 8000;

/** Allow http/https only. Reject `javascript:`, `data:`, malformed strings, etc. */
export function validateUrl(urlString: string): string {
  if (!urlString) return '';
  try {
    const parsed = new URL(urlString);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

/** Escape Markdown special chars to prevent link/blockquote injection in the saved note. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[[\]()]/g, '\\$&');
}

/** Strip any HTML and clamp to max length. */
export function sanitizeParam(value: string | null | undefined, maxLength: number): string {
  if (!value) return '';
  return stripHtml(value).substring(0, maxLength);
}

/** Normalize a free-form mode string from a share intent or URL param. */
export function parseClipMode(value: string | null | undefined): ClipMode {
  const v = String(value || '').toLowerCase();
  if (v === 'selection') return 'selection';
  if (v === 'fullpage' || v === 'full-page' || v === 'full_page') return 'fullpage';
  if (v === 'image' || v === 'img') return 'image';
  if (v === 'pdf') return 'pdf';
  return 'article';
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|heic|heif|avif|svg)(\?|#|$)/i;
const PDF_EXT_RE = /\.pdf(\?|#|$)/i;

/** Detect attachment kind from a MIME type and/or URL. */
export function detectAttachmentKind(
  mime?: string | null,
  url?: string | null,
): 'image' | 'pdf' | null {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m === 'application/pdf') return 'pdf';
  const u = url || '';
  if (IMAGE_EXT_RE.test(u)) return 'image';
  if (PDF_EXT_RE.test(u)) return 'pdf';
  return null;
}

/**
 * De-duplicate repeated share intents within SHARE_DEDUP_WINDOW_MS.
 * Android can re-fire `checkSendIntentReceived` on cold start + resume +
 * `sendIntentReceived` event for the same payload. Returns `true` when the
 * payload was just handled and should be ignored.
 */
export function isDuplicateShare(
  signature: string,
  now: number = Date.now(),
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof sessionStorage !== 'undefined' ? sessionStorage : null,
): boolean {
  if (!signature || !storage) return false;
  try {
    const KEY = '__flowist_last_share__';
    const raw = storage.getItem(KEY);
    if (raw) {
      const prev = JSON.parse(raw) as { sig: string; t: number };
      if (prev && prev.sig === signature && now - prev.t < SHARE_DEDUP_WINDOW_MS) {
        return true;
      }
    }
    storage.setItem(KEY, JSON.stringify({ sig: signature, t: now }));
  } catch {
    /* sessionStorage unavailable — fall through, no dedup */
  }
  return false;
}

/**
 * Given the raw payload Android/iOS hands to us (one big string of either
 * a URL, selected text, or both), tease apart the URL from the rest.
 * Returns `{ url, text }` where either may be empty.
 */
export function extractUrlAndText(payload: string): { url: string; text: string } {
  const trimmed = (payload || '').trim();
  if (!trimmed) return { url: '', text: '' };
  // Most-common case: the whole payload IS a URL (Chrome "Share link").
  const directUrl = validateUrl(trimmed);
  if (directUrl) return { url: directUrl, text: '' };
  // Otherwise, look for the first http(s) URL inside the text (selection share).
  const match = trimmed.match(/https?:\/\/\S+/i);
  if (match) {
    const url = validateUrl(match[0]);
    const text = trimmed.replace(match[0], '').trim();
    return { url, text };
  }
  return { url: '', text: trimmed };
}

/** Build the markdown body of a clip note. */
export function buildClipNoteBody(opts: {
  url?: string;
  selection?: string;
  content?: string;
  mode?: ClipMode;
}): string {
  const { url, selection, content, mode = 'article' } = opts;
  let body = '';
  if (url) body += `**Source:** ${escapeMarkdown(url)}\n\n`;
  if (mode === 'selection' && selection) {
    body += `> ${escapeMarkdown(selection)}\n\n`;
    return body.trim();
  }
  if (selection) body += `> ${escapeMarkdown(selection)}\n\n`;
  if (mode !== 'selection' && content) body += escapeMarkdown(content);
  return body.trim();
}

/** Build a `/webclipper?…` URL from a normalized payload. Safe for navigation. */
export function buildClipperUrl(payload: {
  title?: string;
  url?: string;
  selection?: string;
  content?: string;
  mode?: ClipMode;
}): string {
  const params = new URLSearchParams();
  if (payload.title) params.set('title', payload.title.substring(0, MAX_LENGTHS.title));
  if (payload.url) params.set('url', payload.url.substring(0, MAX_LENGTHS.url));
  if (payload.selection) params.set('selection', payload.selection.substring(0, MAX_LENGTHS.selection));
  if (payload.content) params.set('content', payload.content.substring(0, MAX_LENGTHS.content));
  if (payload.mode) params.set('mode', payload.mode);
  return `/webclipper?${params.toString()}`;
}
