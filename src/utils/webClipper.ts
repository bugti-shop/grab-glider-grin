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

/** Hard caps on shared attachments. Surface friendly errors past these. */
export const ATTACHMENT_LIMITS = {
  /** 15 MB — keeps notes light and IndexedDB happy. */
  imageBytes: 15 * 1024 * 1024,
  /** 25 MB — PDFs we'll fetch & extract text from. */
  pdfBytes: 25 * 1024 * 1024,
} as const;

/** MIME allow-lists. Anything else is rejected with a friendly error. */
export const ALLOWED_IMAGE_MIME = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'image/bmp', 'image/heic', 'image/heif', 'image/avif', 'image/svg+xml',
] as const;
export const ALLOWED_PDF_MIME = ['application/pdf'] as const;

export interface AttachmentValidation {
  ok: boolean;
  /** Human-readable error key + fallback. */
  errorKey?: string;
  errorFallback?: string;
  /** Resolved size in bytes if known. */
  bytes?: number;
  /** Resolved/sniffed MIME if known. */
  mime?: string;
}

/** Format bytes for friendly messages. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Validate an attachment by kind, MIME and (optionally) byte length.
 * Pure / sync — used in tests; live HEAD checks live in WebClipper.tsx.
 */
export function validateAttachment(
  kind: 'image' | 'pdf' | null,
  mime: string | null | undefined,
  bytes: number | null | undefined,
): AttachmentValidation {
  if (!kind) {
    return { ok: false, errorKey: 'webClipper.errUnsupported', errorFallback: 'This file type is not supported.' };
  }
  const m = (mime || '').toLowerCase();
  if (kind === 'image') {
    if (m && !(ALLOWED_IMAGE_MIME as readonly string[]).includes(m)) {
      return { ok: false, errorKey: 'webClipper.errImageType', errorFallback: `Unsupported image type (${m}).`, mime: m };
    }
    if (typeof bytes === 'number' && bytes > ATTACHMENT_LIMITS.imageBytes) {
      return {
        ok: false,
        errorKey: 'webClipper.errImageTooLarge',
        errorFallback: `Image is too large (${formatBytes(bytes)}). Max ${formatBytes(ATTACHMENT_LIMITS.imageBytes)}.`,
        bytes, mime: m,
      };
    }
  }
  if (kind === 'pdf') {
    if (m && !(ALLOWED_PDF_MIME as readonly string[]).includes(m)) {
      return { ok: false, errorKey: 'webClipper.errPdfType', errorFallback: `Unsupported PDF type (${m}).`, mime: m };
    }
    if (typeof bytes === 'number' && bytes > ATTACHMENT_LIMITS.pdfBytes) {
      return {
        ok: false,
        errorKey: 'webClipper.errPdfTooLarge',
        errorFallback: `PDF is too large (${formatBytes(bytes)}). Max ${formatBytes(ATTACHMENT_LIMITS.pdfBytes)}.`,
        bytes, mime: m,
      };
    }
  }
  return { ok: true, bytes: bytes ?? undefined, mime: m || undefined };
}

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
  if (v === 'article') return 'article';
  // Default to clean-article capture — genuine article body with images,
  // captions, headings, and links, but no ads / nav / related-stories chrome.
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

/**
 * Strip common boilerplate from clipped article content: ad slots,
 * "More Stories" rails, newsletter signups, footer menus, cookie banners,
 * social-share rows, and "Read in app" / subscribe CTAs.
 * Pure heuristics — safe on already-clean Readability output.
 */
export function cleanClippedContent(raw: string): string {
  if (!raw) return '';
  // Markers that, when matched on a line, cut everything from that line onward.
  const cutMarkers: RegExp[] = [
    /^\s*(more stories|related stories|related articles|read more|recommended for you|you may also like|trending now|popular now|most read)\b/i,
    /^\s*(newsletter|subscribe to (our )?newsletter|sign up for (our )?newsletter|get the newsletter)\b/i,
    /^\s*(footer|site map|sitemap|©\s*\d{4}|copyright\s*©?\s*\d{4})/i,
    /^\s*(terms of (use|service)|privacy policy|cookie (policy|preferences)|do not sell my (personal )?info)/i,
    /^\s*(follow us|share this article|share on (facebook|twitter|x|linkedin))/i,
  ];
  // Markers that drop only the matching line (ads, "Read in app", etc.).
  const dropLine: RegExp[] = [
    /\b(advertisement|sponsored|promoted content|ad\s*choices)\b/i,
    /^\s*(read in app|open in app|continue in app|download the app)\b/i,
    /^\s*(sign in|log in|subscribe now|become a member|create (a )?free account)\b/i,
    /^\s*(skip to (content|main)|jump to (content|main))/i,
    /^\s*(image|photo|caption|credit)\s*:/i,
  ];
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (cutMarkers.some((re) => re.test(line))) break;
    if (dropLine.some((re) => re.test(line))) continue;
    out.push(line);
  }
  // Collapse 3+ blank lines, trim.
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Build the markdown body of a clip note. */
export function buildClipNoteBody(opts: {
  url?: string;
  selection?: string;
  content?: string;
  mode?: ClipMode;
  attachment?: string;
  attachmentType?: 'image' | 'pdf' | null;
}): string {
  const { url, selection, content, mode = 'article', attachment, attachmentType } = opts;
  let body = '';
  if (url) body += `**Source:** ${escapeMarkdown(url)}\n\n`;

  // Attachment first — gives the note a visible preview at the top.
  if (attachment) {
    const safe = validateUrl(attachment);
    if (safe) {
      if (attachmentType === 'image' || mode === 'image') {
        body += `![clip](${safe})\n\n`;
      } else if (attachmentType === 'pdf' || mode === 'pdf') {
        body += `📎 [PDF attachment](${safe})\n\n`;
      } else {
        body += `[attachment](${safe})\n\n`;
      }
    }
  }

  if (mode === 'selection' && selection) {
    body += `> ${escapeMarkdown(selection)}\n\n`;
    return body.trim();
  }
  if (selection) body += `> ${escapeMarkdown(selection)}\n\n`;
  // Article / fullpage mode: scrub boilerplate before emitting.
  if (mode !== 'selection' && content) {
    const cleaned = mode === 'article' ? cleanClippedContent(content) : content;
    if (cleaned) body += escapeMarkdown(cleaned);
  }
  return body.trim();
}


/** Build a `/webclipper?…` URL from a normalized payload. Safe for navigation. */
export function buildClipperUrl(payload: {
  title?: string;
  url?: string;
  selection?: string;
  content?: string;
  mode?: ClipMode;
  attachment?: string;
  attachmentType?: 'image' | 'pdf' | null;
}): string {
  const params = new URLSearchParams();
  if (payload.title) params.set('title', payload.title.substring(0, MAX_LENGTHS.title));
  if (payload.url) params.set('url', payload.url.substring(0, MAX_LENGTHS.url));
  if (payload.selection) params.set('selection', payload.selection.substring(0, MAX_LENGTHS.selection));
  if (payload.content) params.set('content', payload.content.substring(0, MAX_LENGTHS.content));
  if (payload.attachment) params.set('attachment', payload.attachment.substring(0, MAX_LENGTHS.attachment));
  if (payload.attachmentType) params.set('attachmentType', payload.attachmentType);
  if (payload.mode) params.set('mode', payload.mode);
  return `/webclipper?${params.toString()}`;
}

/** Build a stable signature for a share payload (used by isDuplicateShare). */
export function buildShareSignature(parts: {
  url?: string;
  text?: string;
  attachment?: string;
}): string {
  return [parts.url || '', parts.attachment || '', (parts.text || '').slice(0, 200)].join('|');
}
