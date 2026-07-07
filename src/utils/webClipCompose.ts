// Pure HTML composition for finalized web clip notes.
// Shared between the WebClipper's sync path (legacy) and the background-job
// finalize hook. Produces the exact same `<section class="flowist-web-clip">`
// body used by NoteEditor, plus the standalone snapshot HTML for the offline
// download.

import { sanitizeForDisplay, sanitizeClippedArticle } from '@/lib/sanitize';

export interface ComposeInput {
  rawHtml: string;               // Sanitized full-page HTML from the server.
  url: string;                   // Original source URL.
  title: string;                 // Preferred title (from server; falls back to URL host).
  meta?: {
    author?: string;
    siteName?: string;
    leadImage?: string;
    excerpt?: string;
    publishedTime?: string;
  };
  offlineSavedLabel?: string;    // i18n strings, optional (fallbacks used).
  offlineHintLabel?: string;
}

export interface ComposedClip {
  /** Final note body HTML (banner + iframe + web-clip section markup). */
  noteBody: string;
  /** The raw single-file snapshot to write to disk. */
  snapshotHtml: string;
  /** Suggested `.html` filename for the download. */
  filename: string;
  /** Byte length of the snapshot. */
  snapshotBytes: number;
}

const LARGE_SNAPSHOT_THRESHOLD = 400 * 1024;

function filenameFromTitle(title: string, host: string): string {
  const base = (title || host || 'web-clip')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'web-clip';
  return base;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Build the finalized note body for a completed background clip job.
 * Mirrors the composition in WebClipper.tsx (banner + iframe + section) but
 * runs standalone so the useWebClipJobs hook can call it.
 */
export function composeWebClipNote(input: ComposeInput): ComposedClip {
  const { rawHtml, url, title, meta = {} } = input;
  const readOnlySnapshot = rawHtml;
  const snapshotBytes = new Blob([readOnlySnapshot]).size;

  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
  const filename = `${filenameFromTitle(title || host, host)}.html`;

  const sizeLabel = formatBytes(snapshotBytes);
  const savedLabel = input.offlineSavedLabel || 'Offline snapshot ready';
  const hintLabel = input.offlineHintLabel || 'The full page below is captured start-to-finish and stays readable inside this note.';
  const banner =
    `<aside class="flowist-offline-snapshot-info" contenteditable="false" data-snapshot-filename="${filename.replace(/"/g, '&quot;')}" data-snapshot-bytes="${snapshotBytes}">` +
      `<strong>📥 ${sanitizeForDisplay(savedLabel)}</strong>` +
      `<span>${sanitizeForDisplay(filename)} · ${sizeLabel}</span>` +
      `<em>${sanitizeForDisplay(hintLabel)}</em>` +
    `</aside>`;

  const useBlobEmbed = snapshotBytes > LARGE_SNAPSHOT_THRESHOLD;
  let iframe: string;
  if (useBlobEmbed) {
    try {
      const blob = new Blob([readOnlySnapshot], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      iframe =
        `<iframe class="flowist-web-clip-page" data-role="page-embed" data-embed="blob" ` +
        `sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" ` +
        `referrerpolicy="no-referrer-when-downgrade" loading="lazy" ` +
        `style="width:100%;height:80vh;min-height:640px;border:1px solid hsl(var(--border));border-radius:12px;background:hsl(var(--background));display:block;" ` +
        `src="${blobUrl}"></iframe>`;
    } catch {
      const escapedDoc = readOnlySnapshot.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      iframe =
        `<iframe class="flowist-web-clip-page" data-role="page-embed" ` +
        `sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" ` +
        `referrerpolicy="no-referrer-when-downgrade" loading="lazy" ` +
        `style="width:100%;height:80vh;min-height:640px;border:1px solid hsl(var(--border));border-radius:12px;background:hsl(var(--background));display:block;" ` +
        `srcdoc="${escapedDoc}"></iframe>`;
    }
  } else {
    const escapedDoc = readOnlySnapshot.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    iframe =
      `<iframe class="flowist-web-clip-page" data-role="page-embed" ` +
      `sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" ` +
      `referrerpolicy="no-referrer-when-downgrade" loading="lazy" ` +
      `style="width:100%;height:80vh;min-height:640px;border:1px solid hsl(var(--border));border-radius:12px;background:hsl(var(--background));display:block;" ` +
      `srcdoc="${escapedDoc}"></iframe>`;
  }

  const capturedAt = new Date().toISOString();
  const safeUrl = url ? url.replace(/"/g, '&quot;') : '';
  const favicon = host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` : '';
  const siteLabel = sanitizeForDisplay(meta.siteName || host || 'Web');
  const finalTitle = title || host || 'Web clip';

  const parts: string[] = [];
  parts.push(
    `<section class="flowist-web-clip" data-block-type="webClip" contenteditable="false" aria-readonly="true" ` +
    `data-source-url="${safeUrl}" data-captured-at="${capturedAt}" ` +
    `data-site-name="${(meta.siteName || '').replace(/"/g, '&quot;')}" ` +
    `data-author="${(meta.author || '').replace(/"/g, '&quot;')}">`,
  );
  parts.push(
    `<header class="flowist-web-clip-header" contenteditable="false">` +
      (favicon ? `<img class="flowist-web-clip-favicon" src="${favicon}" alt="" referrerpolicy="no-referrer" />` : '') +
      `<span class="flowist-web-clip-badge">WEB CLIP</span>` +
      `<span class="flowist-web-clip-site">${siteLabel}</span>` +
      `<span class="flowist-web-clip-dot">·</span>` +
      `<time class="flowist-web-clip-date">${new Date(capturedAt).toLocaleDateString()}</time>` +
      (url ? `<a class="flowist-web-clip-open" href="${url}" target="_blank" rel="noopener noreferrer" title="Open original">↗ Open</a>` : '') +
    `</header>`,
  );
  parts.push(`<h1 class="flowist-web-clip-title">${sanitizeForDisplay(finalTitle)}</h1>`);
  const metaBits: string[] = [];
  if (meta.author) metaBits.push(sanitizeForDisplay(meta.author));
  if (meta.siteName) metaBits.push(sanitizeForDisplay(meta.siteName));
  if (meta.publishedTime) {
    const d = new Date(meta.publishedTime);
    if (!isNaN(d.getTime())) metaBits.push(d.toLocaleDateString());
  }
  if (metaBits.length) parts.push(`<p class="flowist-web-clip-meta">${metaBits.join(' · ')}</p>`);
  if (meta.leadImage && !rawHtml.includes(meta.leadImage)) {
    parts.push(`<figure class="flowist-web-clip-hero"><img src="${meta.leadImage}" alt="" /></figure>`);
  }
  if (meta.excerpt) {
    parts.push(`<blockquote class="flowist-web-clip-excerpt">${sanitizeForDisplay(meta.excerpt)}</blockquote>`);
  }
  parts.push(`<div class="flowist-web-clip-body" data-role="body" contenteditable="false" aria-readonly="true">`);
  parts.push(`${banner}${iframe}`);
  parts.push(`</div>`);
  parts.push(
    `<footer class="flowist-web-clip-footer" contenteditable="false">` +
      (url ? `<a class="flowist-web-clip-source" href="${url}" target="_blank" rel="noopener noreferrer">${sanitizeForDisplay(url)}</a>` : '') +
    `</footer>`,
  );
  parts.push(`</section>`);

  const noteBody = sanitizeClippedArticle(parts.join('\n'));

  return { noteBody, snapshotHtml: readOnlySnapshot, filename, snapshotBytes };
}

/** Pending placeholder body — shown until the background worker completes. */
export function composePendingWebClipBody(url: string, jobId: string): string {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
  const safeUrl = url.replace(/"/g, '&quot;');
  return sanitizeClippedArticle(
    `<section class="flowist-web-clip flowist-web-clip-pending" data-block-type="webClipPending" data-clip-job-id="${jobId}" data-source-url="${safeUrl}" contenteditable="false" aria-readonly="true">` +
      `<div class="flowist-web-clip-pending-card" style="padding:24px;border:1px dashed hsl(var(--border));border-radius:12px;background:hsl(var(--muted)/0.4);text-align:center;">` +
        `<div style="font-size:32px;margin-bottom:8px;">⏳</div>` +
        `<h2 style="margin:0 0 8px;font-size:18px;">Fetching full page in background…</h2>` +
        `<p style="margin:0;color:hsl(var(--muted-foreground));font-size:14px;">${sanitizeForDisplay(host || url)}</p>` +
        `<p style="margin:12px 0 0;color:hsl(var(--muted-foreground));font-size:12px;">This note will update automatically when the snapshot is ready. You can close the app — the capture keeps running.</p>` +
      `</div>` +
    `</section>`
  );
}

/** Failed body — shown when all retries have been exhausted. */
export function composeFailedWebClipBody(url: string, errorCode: string, errorMessage: string): string {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
  const safeUrl = url.replace(/"/g, '&quot;');
  return sanitizeClippedArticle(
    `<section class="flowist-web-clip flowist-web-clip-failed" data-block-type="webClipFailed" data-source-url="${safeUrl}" contenteditable="false" aria-readonly="true">` +
      `<div style="padding:24px;border:1px solid hsl(var(--destructive)/0.4);border-radius:12px;background:hsl(var(--destructive)/0.05);">` +
        `<h2 style="margin:0 0 8px;font-size:18px;color:hsl(var(--destructive));">⚠️ Couldn't capture this page</h2>` +
        `<p style="margin:0 0 4px;font-size:14px;"><strong>${sanitizeForDisplay(host || url)}</strong></p>` +
        `<p style="margin:0 0 12px;color:hsl(var(--muted-foreground));font-size:13px;">${sanitizeForDisplay(`${errorCode}: ${errorMessage}`)}</p>` +
        `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color:hsl(var(--primary));font-size:13px;">Open original ↗</a>` +
      `</div>` +
    `</section>`
  );
}
