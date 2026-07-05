import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Note } from '@/types/note';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Check, Loader2, ExternalLink, FileText, Quote, Image as ImageIcon, FileType2, AlertTriangle, Download, X, Save, Pencil } from 'lucide-react';
import { saveNoteToDBSingle } from '@/utils/noteStorage';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { sanitizeForDisplay, sanitizeClippedArticle } from '@/lib/sanitize';
import { hydrateWebClipsIn } from '@/components/richtext/richTextBlocks';
import {
  MAX_LENGTHS,
  type ClipMode,
  validateUrl,
  sanitizeParam,
  parseClipMode,
  buildClipNoteBody,
  validateAttachment,
  formatBytes,
  ATTACHMENT_LIMITS,
} from '@/utils/webClipper';
import { useWebClipperQuota } from '@/hooks/useWebClipperQuota';

const MODE_OPTIONS: Array<{ id: ClipMode; icon: typeof FileText; titleKey: string; descKey: string; fallbackTitle: string; fallbackDesc: string }> = [
  { id: 'fullpage',  icon: Download, titleKey: 'webClipper.modeFullPage',  descKey: 'webClipper.modeFullPageDesc',  fallbackTitle: 'Full page (offline snapshot)', fallbackDesc: 'Download the entire page as a single-file HTML for offline reading' },
];

/** Slugify a title into a safe filename stem. */
const filenameFromTitle = (title: string, host: string): string => {
  const base = (title || host || 'web-clip')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'web-clip';
  return base;
};

/** Trigger a browser download of a single-file HTML snapshot. */
const triggerHtmlDownload = (filename: string, html: string): void => {
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename.endsWith('.html') ? filename : `${filename}.html`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  } catch (err) {
    console.warn('[webClipper] snapshot download failed', err);
  }
};

type Stage = 'idle' | 'validating' | 'downloading' | 'extracting' | 'fetching' | 'embedding' | 'saving';

/** StrictMode/remount guard for concurrent duplicate work only.
 * Completed clips are intentionally NOT deduped: users can save the same URL
 * multiple times from the share sheet and every explicit share must work. */
const inFlightClipKeys = new Set<string>();
const clipKey = (mode: string, url: string, attachment: string, shareId: string) =>
  `${mode}::${(url || '').trim().toLowerCase()}::${(attachment || '').trim().toLowerCase()}::${shareId || 'manual'}`;

/**
 * Match the *exact* label of legacy snapshot chrome buttons (case-insensitive,
 * whitespace-collapsed). We deliberately anchor with ^…$ and cap length so
 * real prose containing the word "snapshot" or "download" is never removed.
 */
const SNAPSHOT_LABEL_RE = /^(hide snapshot|view snapshot|view full captured(?: html| page)?|download captured html|snapshot stored offline|snapshot saved offline)$/i;

const isSnapshotWrapper = (el: HTMLElement): boolean => {
  const cls = el.className && typeof el.className === 'string' ? el.className : '';
  if (/flowist-web-clip-fullpage/.test(cls)) return true;
  const role = el.getAttribute('data-role') || '';
  return role.startsWith('fullpage-');
};

const stripSnapshotArtifacts = (html: string): string => {
  if (!html || typeof window === 'undefined') return html;
  try {
    const doc = new DOMParser().parseFromString(`<div id="__clip-root">${html}</div>`, 'text/html');
    const root = doc.getElementById('__clip-root');
    if (!root) return html;
    // 1. Known selectors (legacy snapshot chrome).
    root
      .querySelectorAll(
        '.flowist-web-clip-fullpage, .flowist-web-clip-fullpage-hint, .flowist-web-clip-fullpage-btn, [data-role="fullpage-snapshot"], [data-role="fullpage-open"], [data-role="fullpage-download"], iframe.flowist-web-clip-fullpage-frame',
      )
      .forEach((node) => node.remove());
    // 2. Interactive/chrome elements whose *entire* label matches the legacy
    //    snapshot buttons. Restricted to button-like tags with a short label
    //    (≤ 60 chars) so real article prose that happens to contain the words
    //    "snapshot" or "download" is never touched.
    const candidates = Array.from(
      root.querySelectorAll<HTMLElement>('button, a, [role="button"]'),
    );
    for (const el of candidates) {
      if (!el.isConnected) continue;
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!txt || txt.length > 60 || !SNAPSHOT_LABEL_RE.test(txt)) continue;
      // Bubble up only through elements that also look like snapshot chrome
      // (known class / data-role). Never cross into a normal article container.
      let target: HTMLElement = el;
      for (let i = 0; i < 4; i++) {
        const p = target.parentElement;
        if (!p || p === root) break;
        if (!isSnapshotWrapper(p)) break;
        target = p;
      }
      target.remove();
    }
    return root.innerHTML;
  } catch {
    return html;
  }
};




const WebClipper = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { isAdminBypass } = useSubscription();
  // Web Clipper is unlimited for everyone — no free/Pro gate, no quota UI.
  const showQuota = false;
  const quota = useWebClipperQuota(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [progressLabel, setProgressLabel] = useState('');
  type ErrorDebug = {
    code?: string;
    httpStatus?: number;
    upstreamMessage?: string;
    targetUrl?: string;
    requestedMode?: ClipMode;
    attachmentUrl?: string;
    attachmentType?: 'image' | 'pdf' | null;
    receivedTitle?: string;
    receivedSelectionChars?: number;
    receivedContentChars?: number;
    articleHtmlChars?: number;
    fallbackAttempted?: boolean;
    stage?: Stage;
    at?: string;
  };
  const [error, setError] = useState<{ title: string; description: string; debug?: ErrorDebug } | null>(null);
  const [showErrorDebug, setShowErrorDebug] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const canceledRef = useRef(false);
  const prepareRunIdRef = useRef(0);

  // Editable preview state — populated by prepareClip(), committed by commitClip().
  const [previewReady, setPreviewReady] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const contentEditorRef = useRef<HTMLDivElement>(null);

  // Hydrate web-clip cards (adds expand/collapse toggle for long clips)
  // whenever the preview HTML changes.
  useEffect(() => {
    if (previewReady && contentEditorRef.current) hydrateWebClipsIn(contentEditorRef.current);
  }, [previewReady, previewHtml]);

  // Synthetic progress ticker: when the current stage doesn't report a real
  // ratio (fetch/extract/embed/save all resolve as one-shot backend calls),
  // creep the bar from 5% → 92% so users see continuous movement instead of
  // a flat empty bar for the entire wait.
  const [fauxProgress, setFauxProgress] = useState<number | null>(null);
  useEffect(() => {
    if (!saving || stage === 'idle' || error) {
      setFauxProgress(null);
      return;
    }
    if (typeof progress === 'number') {
      setFauxProgress(null);
      return;
    }
    setFauxProgress(5);
    const id = window.setInterval(() => {
      setFauxProgress((v) => {
        const cur = v ?? 5;
        if (cur >= 92) return 92;
        // Ease-out: slower as we approach the cap.
        const step = Math.max(1, Math.round((92 - cur) * 0.08));
        return Math.min(92, cur + step);
      });
    }, 350);
    return () => window.clearInterval(id);
  }, [saving, stage, progress, error]);


  // Re-poll the monthly counter after each fetch settles (so the bar reflects
  // the server-side increment) and whenever Pro state flips.
  useEffect(() => {
    if (!showQuota) return;
    if (stage === 'idle') void quota.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, saved, showQuota]);

  // Sanitize incoming params (URL ?title=… &url=… &content=… &selection=… &mode=…).
  // The Share-intent hook and the desktop browser extension both hit this same route.
  const title = sanitizeParam(searchParams.get('title'), MAX_LENGTHS.title) || 'Untitled Clip';
  const url = validateUrl(sanitizeParam(searchParams.get('url'), MAX_LENGTHS.url));
  const content = sanitizeParam(searchParams.get('content'), MAX_LENGTHS.content);
  const selection = sanitizeParam(searchParams.get('selection'), MAX_LENGTHS.selection);
  const attachment = validateUrl(sanitizeParam(searchParams.get('attachment'), MAX_LENGTHS.attachment));
  const rawAttachmentType = (searchParams.get('attachmentType') || '').toLowerCase();
  const attachmentType: 'image' | 'pdf' | null =
    rawAttachmentType === 'image' || rawAttachmentType === 'pdf' ? rawAttachmentType : null;
  const initialMode = parseClipMode(searchParams.get('mode'));

  const clearClipperQuery = () => {
    if (typeof window === 'undefined' || !window.location.search) return;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.hash || ''}`);
  };

  // URL shares, explicit modes, and attachments auto-prepare immediately.
  // The picker is only for rare text-only/manual entry cases.
  const explicitMode = searchParams.has('mode') || !!attachment || !!url;
  const [mode, setMode] = useState<ClipMode>(initialMode);
  const [picking, setPicking] = useState(!explicitMode);
  const payloadSignature = searchParams.toString();
  const payloadRunKeyRef = useRef('');

  // Guard against React StrictMode double-invocation and any re-render that
  // could otherwise fire prepareClip() 2–3× for the same URL, producing
  // duplicate copies of the fetched article.
  const prepareStartedRef = useRef(false);

  // Native share sheets can navigate to /webclipper again while this component
  // is still mounted. Reset one-shot local state whenever a new query payload
  // arrives, otherwise the previous preview/prepare guard can make it look as
  // if "nothing happened".
  useEffect(() => {
    if (!payloadSignature || payloadRunKeyRef.current === payloadSignature) return;
    payloadRunKeyRef.current = payloadSignature;
    prepareRunIdRef.current += 1;
    prepareStartedRef.current = false;
    if (abortRef.current) {
      canceledRef.current = true;
      abortRef.current.abort();
    }
    abortRef.current = null;
    canceledRef.current = false;
    setMode(initialMode);
    setPicking(!explicitMode);
    setPreviewReady(false);
    setPreviewTitle('');
    setPreviewHtml('');
    setSaved(false);
    setError(null);
    setStage('idle');
    setProgress(null);
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadSignature]);

  useEffect(() => {
    if (picking) return;
    if (prepareStartedRef.current) return;
    if (previewReady) return;
    if (!(title || url || content || selection || attachment)) return;
    // Only suppress the exact same in-flight share/remount. Completed clips are
    // never suppressed so the same article can be clipped again manually.
    const key = clipKey(mode, url || '', attachment || '', searchParams.get('shareId') || '');
    if (inFlightClipKeys.has(key)) {
      console.warn('[webClipper] duplicate in-flight clip suppressed for key', key);
      prepareStartedRef.current = true;
      return;
    }
    prepareStartedRef.current = true;
    void prepareClip(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picking, payloadSignature]);

  /** Try a HEAD request to learn content-length + MIME before downloading. */
  const probeAttachment = async (
    target: string,
    signal: AbortSignal,
  ): Promise<{ bytes: number | null; mime: string | null }> => {
    try {
      const res = await fetch(target, { method: 'HEAD', signal });
      if (!res.ok) return { bytes: null, mime: null };
      const len = Number(res.headers.get('content-length') || 0);
      return {
        bytes: Number.isFinite(len) && len > 0 ? len : null,
        mime: res.headers.get('content-type'),
      };
    } catch {
      return { bytes: null, mime: null };
    }
  };

  const handleCancel = () => {
    if (!abortRef.current) return;
    canceledRef.current = true;
    abortRef.current.abort();
  };

  const failWith = (
    titleKey: string,
    titleFallback: string,
    descKey: string,
    descFallback: string,
    debug?: ErrorDebug,
  ) => {
    const titleMsg = t(titleKey, titleFallback);
    const descMsg = t(descKey, descFallback);
    setError({ title: titleMsg, description: descMsg, debug });
    setShowErrorDebug(false);
    toast({ title: titleMsg, description: descMsg, variant: 'destructive' });
    setStage('idle');
    setProgress(null);
    setSaving(false);
  };

  /**
   * Fetch + assemble the clip and hand it to the editable preview UI.
   * Does NOT save to the DB — commitClip() does that when the user hits Save.
   */
  const prepareClip = async (clipMode: ClipMode) => {
    // Belt-and-braces: if a prepare pass is already running, don't kick off
    // another one on top. Duplicate concurrent fetches were creating 2–3
    // copies of the same article until the app was closed.
    if (abortRef.current) {
      console.warn('[webClipper] prepareClip already in flight — ignoring duplicate call');
      return;
    }
    const dedupeKey = clipKey(clipMode, url || '', attachment || '', searchParams.get('shareId') || '');
    const runId = ++prepareRunIdRef.current;
    const isStaleRun = () => runId !== prepareRunIdRef.current;
    inFlightClipKeys.add(dedupeKey);
    prepareStartedRef.current = true;
    setSaving(true);
    setError(null);
    canceledRef.current = false;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // 1) Validate attachment (type + size) before doing any heavy work.
      if (attachment) {
        setStage('validating');
        setProgressLabel(t('webClipper.stageValidating', 'Checking file…'));
        setProgress(null);
        const { bytes, mime } = await probeAttachment(attachment, controller.signal);
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const verdict = validateAttachment(attachmentType, mime, bytes);
        if (!verdict.ok) {
          failWith(
            'webClipper.attachmentRejected',
            'Attachment not supported',
            verdict.errorKey || 'webClipper.errUnsupported',
            verdict.errorFallback || 'This file is not supported.',
          );
          return;
        }
      }

      let extractedPdfText = '';
      let pdfTruncated = false;
      // For shared PDFs, pull readable text so the note is searchable
      // beyond just the attachment link.
      if (attachment && attachmentType === 'pdf') {
        try {
          setStage('downloading');
          setProgress(0);
          setProgressLabel(t('webClipper.stageDownloading', 'Downloading PDF…'));
          const { extractPdfTextFromUrl } = await import('@/utils/pdfExtract');
          const result = await extractPdfTextFromUrl(attachment, {
            signal: controller.signal,
            onProgress: (s, ratio) => {
              if (s === 'download') {
                setStage('downloading');
                setProgressLabel(t('webClipper.stageDownloading', 'Downloading PDF…'));
                setProgress(typeof ratio === 'number' ? Math.round(ratio * 100) : null);
              } else if (s === 'parse') {
                setStage('extracting');
                setProgressLabel(t('webClipper.stageExtracting', 'Extracting text from PDF…'));
                setProgress(typeof ratio === 'number' ? Math.round(ratio * 100) : null);
              } else {
                setProgress(100);
              }
            },
          });
          extractedPdfText = result.text;
          pdfTruncated = result.truncated;
        } catch (err) {
          if (canceledRef.current || (err as Error)?.name === 'AbortError') throw err;
          console.warn('[webClipper] PDF text extraction failed', err);
          // Soft-fail: still save the clip with attachment link, just no extracted body.
          toast({
            title: t('webClipper.pdfExtractFailed', 'PDF text unavailable'),
            description: t('webClipper.pdfExtractFailedDesc', 'Saved the link, but could not read the PDF text.'),
          });
        }
      }

      // Image attachments: wait briefly for preview load (handled by <img onLoad>).
      // No blocking — we proceed but UI reflects loading state.

      // ── Full-page fetch (Evernote-style) ──────────────────────────────
      // If the caller sent only a URL (typical browser-extension / share
      // sheet case), pull the whole article server-side via Readability so
      // the saved note has title, byline, hero image, images inline, and
      // the complete body — not just the 10 % summary the extension sent.
      let articleTitle = '';
      let articleByline = '';
      let articleSiteName = '';
      let articleLeadImage = '';
      let articleExcerpt = '';
      let articlePublished = '';
      let articleHtml = '';
      let articleEmbeds: string[] = [];
      let articleLinks: Array<{ href: string; text: string }> = [];
      let articleIsFallback = false;
      let fetchFailure: { code: string; status?: number; message?: string } | null = null;
      // FULL-PAGE ALWAYS. The user explicitly does not want metadata-only or
      // half-article clips. Whenever we have a URL, we ask the edge function
      // for the complete rendered page (raw HTML, images, embeds — everything
      // the human eye saw on the page). Selection mode is the only exception,
      // since it saves the user's own highlighted text.
      const shouldFetchFull =
        !attachment &&
        !!url &&
        clipMode !== 'selection';

      if (shouldFetchFull) {
        // Hard cap the full-page fetch so users never sit on a spinner
        // indefinitely. If the edge function is slow or upstream stalls, we
        // surface a clear timeout rather than falling back to partial/snapshot
        // content silently.
        const FETCH_TIMEOUT_MS = 45_000;
        try {
          setStage('fetching');
          setProgress(null);
          setProgressLabel(t('webClipper.stageFetching', 'Fetching full page…'));
          const fetchStartedAt = performance.now();
          console.info('[webClipper] invoking fetch-article', {
            url,
            requestedMode: clipMode,
            receivedTitle: title,
            receivedTitleChars: title.length,
            receivedSelectionChars: selection?.length ?? 0,
            receivedContentChars: content?.length ?? 0,
            hasAttachment: !!attachment,
            attachmentType,
            shareId: searchParams.get('shareId') || null,
            timeoutMs: FETCH_TIMEOUT_MS,
          });
          const timeoutPromise = new Promise<never>((_, reject) => {
            const id = window.setTimeout(() => {
              reject(new DOMException('Timed out fetching full page', 'TimeoutError'));
            }, FETCH_TIMEOUT_MS);
            controller.signal.addEventListener('abort', () => window.clearTimeout(id), { once: true });
          });
          const { data, error } = await Promise.race([
            supabase.functions.invoke('fetch-article', {
              body: {
                url,
                mode: clipMode === 'fullpage' ? 'fullpage' : 'article',
                webUnlockCode: isAdminBypass ? 'mustafabugti890' : undefined,
              },
            }),
            timeoutPromise,
          ]);
          const fetchMs = Math.round(performance.now() - fetchStartedAt);
          if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          if (error) {
            console.warn('[webClipper] fetch-article transport error', { url, ms: fetchMs, message: error.message });
            fetchFailure = { code: 'network', message: error.message };
          } else if (data?.error) {
            console.warn('[webClipper] fetch-article returned error', {
              url,
              ms: fetchMs,
              code: data.code,
              status: data.status,
              error: data.error,
            });
            fetchFailure = { code: String(data.code || 'upstream_error'), status: data.status, message: String(data.error) };
          } else if (data) {
            articleTitle = String(data.title || '').trim();
            articleByline = String(data.author || data.byline || '').trim();
            articleSiteName = String(data.siteName || '').trim();
            articleLeadImage = String(data.leadImage || '').trim();
            articleExcerpt = String(data.excerpt || '').trim();
            articlePublished = String(data.publishedTime || '').trim();
            articleHtml = String(data.contentHtml || data.content || '').trim();
            articleIsFallback = data.fallback === true;
            articleEmbeds = Array.isArray(data.embeds) ? data.embeds.filter((x: unknown) => typeof x === 'string') : [];
            articleLinks = Array.isArray(data.importantLinks)
              ? data.importantLinks.filter((l: any) => l && typeof l.href === 'string' && typeof l.text === 'string')
              : [];
            console.info('[webClipper] fetch-article ok', {
              url,
              ms: fetchMs,
              mode: clipMode,
              titleChars: articleTitle.length,
              excerptChars: articleExcerpt.length,
              htmlChars: articleHtml.length,
              embeds: articleEmbeds.length,
              links: articleLinks.length,
              siteName: articleSiteName || null,
              leadImage: !!articleLeadImage,
              fallback: articleIsFallback,
            });
            // ── Full-page offline snapshot ─────────────────────────────
            // The edge function returns the ENTIRE inlined document
            // (DOCTYPE + <html> + <head> + <body>, with CSS/images/fonts
            // as data: URIs). Save it to the device as a single-file
            // .html so users can open it offline in any browser, then
            // reduce the in-note body to a compact "snapshot saved" card
            // with title/hero/excerpt only — we do NOT paste the raw
            // document markup into the editor.
            if (clipMode === 'fullpage' && articleHtml) {
              const snapshotBytes = new Blob([articleHtml]).size;
              let host = '';
              try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
              const snapshotFilename = `${filenameFromTitle(articleTitle || title, host)}.html`;
              triggerHtmlDownload(snapshotFilename, articleHtml);
              const sizeLabel = formatBytes(snapshotBytes);
              const heroBlock = articleLeadImage
                ? `<figure class="flowist-web-clip-hero"><img src="${articleLeadImage}" alt="" referrerpolicy="no-referrer" /></figure>`
                : '';
              const excerptBlock = articleExcerpt
                ? `<p class="flowist-web-clip-excerpt-inline">${sanitizeForDisplay(articleExcerpt)}</p>`
                : '';
              const banner =
                `<aside class="flowist-offline-snapshot-info" data-snapshot-filename="${snapshotFilename.replace(/"/g, '&quot;')}" data-snapshot-bytes="${snapshotBytes}">` +
                  `<strong>📥 ${sanitizeForDisplay(t('webClipper.offlineSnapshotSaved', 'Offline snapshot saved to your device'))}</strong>` +
                  `<span>${sanitizeForDisplay(snapshotFilename)} · ${sizeLabel}</span>` +
                  `<em>${sanitizeForDisplay(t('webClipper.offlineSnapshotHint', 'Open the downloaded .html file anytime — it contains the whole page (styles, images, fonts) bundled inline. No internet needed.'))}</em>` +
                `</aside>`;
              // Replace the huge document body with the compact card so the
              // note stays lightweight; the offline file lives on the device.
              articleHtml = `${banner}${heroBlock}${excerptBlock}`;
              articleEmbeds = [];
              articleLinks = [];
            }
          }
        } catch (err) {
          if (canceledRef.current || (err as Error)?.name === 'AbortError') throw err;
          const isTimeout = (err as Error)?.name === 'TimeoutError';
          console.warn('[webClipper] full-article fetch threw', {
            url,
            timeout: isTimeout,
            error: (err as Error)?.message,
          });
          fetchFailure = {
            code: isTimeout ? 'timeout' : 'network',
            message: isTimeout
              ? t('webClipper.fetchTimeout', 'Fetching the full page took too long. Please try again.')
              : (err as Error)?.message,
          };
        }
      }


      // If we tried a full-page fetch and got nothing back, DO NOT silently
      // save a link-only stub — the user's complaint is exactly that.
      // Chrome's share sheet forwards `[title]\n[url]` and our parser stuffs
      // the title into `selection`, which used to satisfy the "we have
      // something to save" check and produced a metadata-only note. Now
      // any failed article fetch surfaces a clear error + retry, unless
      // the user is in explicit Selection mode (where the highlight is
      // the whole point).
      const fetchAttemptedButEmpty = shouldFetchFull && !articleHtml;
      // If the server could not fetch a body, still save whatever the share
      // sheet gave us. Never create metadata-only cards; always render inline
      // visible text/content when present.
      const hasShareFallback =
        !!(selection && selection.trim()) ||
        !!(content && content.trim()) ||
        !!(title && title !== 'Untitled Clip');
      if (fetchAttemptedButEmpty && hasShareFallback) {
        console.info('[webClipper] full-fetch empty — falling back to shared payload', {
          url,
          hasSelection: !!selection,
          hasContent: !!content,
          hasTitle: !!title,
        });
        const bodyText = (selection && selection.trim()) || (content && content.trim()) || '';
        // Wrap into a tiny HTML snippet so the downstream rich-note pipeline
        // still runs and users see paragraphs, not a wall of text.
        const escaped = bodyText
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const paragraphs = escaped
          .split(/\n{2,}/)
          .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
          .join('');
        articleHtml = paragraphs || `<p>${escaped}</p>`;
        articleTitle = title || articleTitle;
        articleIsFallback = true;
        // Note: articleExcerpt intentionally left empty — the body IS the excerpt.
      } else if (fetchAttemptedButEmpty) {
        const failure = fetchFailure || { code: 'internal' };
        const map: Record<string, { titleKey: string; titleFallback: string; descKey: string; descFallback: string }> = {
          paywall:        { titleKey: 'webClipper.errPaywallTitle',   titleFallback: 'Site blocked access',           descKey: 'webClipper.errPaywallDesc',   descFallback: 'This page needs a login or blocks clippers. Try copying the text and using Selection mode.' },
          not_found:      { titleKey: 'webClipper.errNotFoundTitle',  titleFallback: 'Page not found',                descKey: 'webClipper.errNotFoundDesc',  descFallback: 'The URL returned 404. Double-check the link.' },
          rate_limited:   { titleKey: 'webClipper.errRateTitle',      titleFallback: 'Rate limited',                  descKey: 'webClipper.errRateDesc',      descFallback: 'The source site is throttling requests. Wait a moment and retry.' },
          timeout:        { titleKey: 'webClipper.errTimeoutTitle',   titleFallback: 'Fetch timed out',               descKey: 'webClipper.errTimeoutDesc',   descFallback: 'The page took too long to load. Retry, or open it once in the browser and share it back.' },
          too_large:      { titleKey: 'webClipper.errTooLargeTitle',  titleFallback: 'Page too large',                descKey: 'webClipper.errTooLargeDesc',  descFallback: 'This page exceeds the 100 MB limit. Try Selection mode on the parts you need.' },
          bad_url:        { titleKey: 'webClipper.errBadUrlTitle',    titleFallback: 'Invalid URL',                   descKey: 'webClipper.errBadUrlDesc',    descFallback: 'That URL is not reachable.' },
          upstream_error: { titleKey: 'webClipper.errUpstreamTitle',  titleFallback: 'Source site returned an error', descKey: 'webClipper.errUpstreamDesc',  descFallback: failure.status ? `The site replied with HTTP ${failure.status}.` : 'The site did not respond properly.' },
          network:        { titleKey: 'webClipper.errNetworkTitle',   titleFallback: 'Could not reach article',       descKey: 'webClipper.errNetworkDesc',   descFallback: 'Network trouble fetching this page. Check your connection and retry.' },
          auth_required:  { titleKey: 'webClipper.errAuthTitle',      titleFallback: 'Sign in required',              descKey: 'webClipper.errAuthDesc',      descFallback: 'Please sign in to use the Web Clipper.' },
          gate_error:     { titleKey: 'webClipper.errGateTitle',      titleFallback: 'Subscription check failed',     descKey: 'webClipper.errGateDesc',      descFallback: 'We could not verify your subscription. Please retry in a moment.' },
          internal:       { titleKey: 'webClipper.errInternalTitle',  titleFallback: 'Clipper hit an error',          descKey: 'webClipper.errInternalDesc',  descFallback: 'Something went wrong on our side while parsing the page. Retry, or open the page in your browser first, then share again.' },
        };
        const info = map[failure.code] || map.internal;
        failWith(info.titleKey, info.titleFallback, info.descKey, info.descFallback, {
          code: failure.code,
          httpStatus: failure.status,
          upstreamMessage: failure.message,
          targetUrl: url || undefined,
          requestedMode: clipMode,
          attachmentUrl: attachment || undefined,
          attachmentType,
          receivedTitle: title,
          receivedSelectionChars: selection?.length ?? 0,
          receivedContentChars: content?.length ?? 0,
          articleHtmlChars: articleHtml.length,
          fallbackAttempted: articleIsFallback,
          stage: 'fetching',
          at: new Date().toISOString(),
        });
        return;
      }


      setStage('embedding');
      setProgress(null);
      setProgressLabel(t('webClipper.stageEmbedding', 'Building note…'));

      let noteContent: string;
      let finalTitle = title;

      if (articleHtml) {
        // Rich HTML note (renders via dangerouslySetInnerHTML in NoteEditor).
        if (articleTitle && (title === 'Untitled Clip' || !searchParams.get('title'))) {
          finalTitle = articleTitle.substring(0, MAX_LENGTHS.title);
        }
        const parts: string[] = [];
        const capturedAt = new Date().toISOString();
        // Distinct "webClip" block — an embedded, non-editable-style object
        // inside the note (Evernote-style). data-* attributes let downstream
        // consumers detect + treat this region specially.
        const safeUrl = url ? url.replace(/"/g, '&quot;') : '';
        let host = '';
        try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
        const favicon = host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` : '';
        const siteLabel = sanitizeForDisplay(articleSiteName || host || 'Web');
        parts.push(
          `<section class="flowist-web-clip" data-block-type="webClip" ` +
          `data-source-url="${safeUrl}" data-captured-at="${capturedAt}" ` +
          `data-site-name="${(articleSiteName || '').replace(/"/g, '&quot;')}" ` +
          `data-author="${(articleByline || '').replace(/"/g, '&quot;')}">`,
        );
        // Card source strip with favicon + site + captured date + open-original pill.
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
        if (articleIsFallback) {
          parts.push(
            `<div class="flowist-web-clip-fallback-banner">⚠️ ${sanitizeForDisplay(t('webClipper.fallbackNotice', 'Full content unavailable — this page may require a login, be paywalled, or render with JavaScript.'))}</div>`,
          );
        }
        parts.push(`<h1 class="flowist-web-clip-title">${sanitizeForDisplay(finalTitle)}</h1>`);
        const metaBits: string[] = [];
        if (articleByline) metaBits.push(sanitizeForDisplay(articleByline));
        if (articleSiteName) metaBits.push(sanitizeForDisplay(articleSiteName));
        if (articlePublished) {
          const d = new Date(articlePublished);
          if (!isNaN(d.getTime())) metaBits.push(d.toLocaleDateString());
        }
        if (metaBits.length) {
          parts.push(`<p class="flowist-web-clip-meta">${metaBits.join(' · ')}</p>`);
        }
        if (articleLeadImage && !articleHtml.includes(articleLeadImage)) {
          parts.push(`<figure class="flowist-web-clip-hero"><img src="${articleLeadImage}" alt="" /></figure>`);
        }
        if (articleExcerpt) {
          parts.push(`<blockquote class="flowist-web-clip-excerpt">${sanitizeForDisplay(articleExcerpt)}</blockquote>`);
        }
        if (selection) {
          parts.push(`<blockquote class="flowist-web-clip-selection">${sanitizeForDisplay(selection)}</blockquote>`);
        }
        // Body wrapper — always full inline content; no snapshot/toggle UI.
        parts.push(`<div class="flowist-web-clip-body" data-role="body">`);
        // User preference: render the full captured article inline directly —
        // no compressed snapshot placeholder, no "View / Hide snapshot" toggle,
        // and no "Download captured HTML" button.
        parts.push(articleHtml);
        if (articleEmbeds.length && !articleEmbeds.every((e) => articleHtml.includes(e))) {
          parts.push(`<h3>${sanitizeForDisplay(t('webClipper.embedsHeading', 'Embedded media'))}</h3>`);
          parts.push(articleEmbeds.join('\n'));
        }
        if (articleLinks.length) {
          const items = articleLinks
            .map((l) => {
              let lhost = '';
              try { lhost = new URL(l.href).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
              const fav = lhost ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(lhost)}&sz=64` : '';
              return (
                `<li class="flowist-web-clip-link">` +
                `<a href="${l.href}" target="_blank" rel="noopener noreferrer">` +
                (fav ? `<img src="${fav}" alt="" referrerpolicy="no-referrer" />` : '') +
                `<span><strong>${sanitizeForDisplay(l.text)}</strong><em>${lhost} ↗</em></span>` +
                `</a></li>`
              );
            })
            .join('');
          parts.push(`<h3>${sanitizeForDisplay(t('webClipper.linksHeading', 'Important links'))}</h3>`);
          parts.push(`<ul class="flowist-web-clip-links">${items}</ul>`);
        }
        parts.push(`</div>`); // /body
        parts.push(
          `<footer class="flowist-web-clip-footer" contenteditable="false">` +
            (url ? `<a class="flowist-web-clip-source" href="${url}" target="_blank" rel="noopener noreferrer">${sanitizeForDisplay(url)}</a>` : '') +
          `</footer>`,
        );
        parts.push(`</section>`);
        // Single sanitize pass over the full assembled document (allows iframe/video for embeds),
        // then remove any legacy snapshot figures defensively before saving.
        noteContent = stripSnapshotArtifacts(sanitizeClippedArticle(parts.join('\n')));
      } else {
        const mergedContent = extractedPdfText
          ? [content, extractedPdfText, pdfTruncated ? '_(PDF text truncated)_' : '']
              .filter(Boolean)
              .join('\n\n')
          : content;

        noteContent = buildClipNoteBody({
          url,
          selection,
          content: mergedContent,
          mode: clipMode,
          attachment: attachment || undefined,
          attachmentType,
        });
      }


      // Hand off to the editable preview — user can tweak title + content
      // before we persist. Nothing hits the DB until commitClip() runs.
      setPreviewTitle(finalTitle);
      setPreviewHtml(stripSnapshotArtifacts(noteContent));
      setPreviewReady(true);
      // Once the editable preview is built, consume the one-shot URL payload.
      // This prevents mobile Activity/webview restores from reopening the same
      // /webclipper?url=… route and fetching/saving duplicate copies later.
      clearClipperQuery();
      setStage('idle');
      setProgress(null);
    } catch (error) {
      if (isStaleRun()) return;
      if (canceledRef.current || (error as Error)?.name === 'AbortError') {
        failWith(
          'webClipper.canceledTitle', 'Clip canceled',
          'webClipper.canceledDesc', 'Stopped before the note was saved.',
        );
      } else {
        console.error('Error preparing clip:', error);
        failWith(
          'toasts.errorSavingClip', 'Could not save clip',
          'toasts.somethingWentWrong', 'Something went wrong',
        );
      }
    } finally {
      if (!isStaleRun()) abortRef.current = null;
      // Release the in-flight lock. Completed clips are not blocked so users
      // can intentionally capture the same article multiple times.
      inFlightClipKeys.delete(dedupeKey);
      if (!isStaleRun()) setSaving(false);
    }
  };

  /**
   * Persist the (possibly-edited) preview to the notes DB.
   * Reads the live HTML from the contentEditable div so any user edits
   * — including deletes, re-orders, and inline tweaks — are captured.
   */
  const commitClip = async () => {
    try {
      setSaving(true);
      setStage('saving');
      setProgressLabel(t('webClipper.stageSaving', 'Saving to notes…'));
      const liveHtml = contentEditorRef.current?.innerHTML ?? previewHtml;
      const cleanHtml = stripSnapshotArtifacts(sanitizeClippedArticle(liveHtml));
      const cleanTitle = (previewTitle || 'Untitled Clip').substring(0, MAX_LENGTHS.title);
      const newNote: Note = {
        id: crypto.randomUUID(),
        type: 'regular',
        title: cleanTitle,
        content: cleanHtml,
        voiceRecordings: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // Save only the new clip row. Loading + rewriting the entire notes DB
      // freezes on large libraries (5k+ notes) and leaves native share sheets
      // stuck on “Saving to notes…”. The single-row path updates IndexedDB,
      // metadata cache, UI events, and cloud sync without touching old notes.
      await saveNoteToDBSingle(newNote);
      clearClipperQuery();
      setSaved(true);
      setStage('idle');
      toast({
        title: t('toasts.webClipSaved', 'Web clip saved'),
        description: t('toasts.clipSavedDesc', { title: cleanTitle, defaultValue: `Saved "${cleanTitle}" to your notes` }),
      });
      setTimeout(() => navigate('/notesdashboard'), 900);
    } catch (err) {
      console.error('Error saving clip:', err);
      failWith(
        'toasts.errorSavingClip', 'Could not save clip',
        'toasts.somethingWentWrong', 'Something went wrong',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-start sm:items-center justify-center p-3 sm:p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            {saving ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {t('webClipper.savingClip', 'Saving clip…')}
              </>
            ) : saved ? (
              <>
                <Check className="h-5 w-5 text-success" />
                {t('webClipper.clipSaved', 'Clip saved')}
              </>
            ) : (
              t('webClipper.title', 'Save to Flowist')
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {showQuota && !saved && (
            <div
              className={cn(
                'space-y-1.5 rounded-lg border p-3',
                quota.remaining === 0
                  ? 'border-destructive/40 bg-destructive/5'
                  : 'border-border bg-muted/30',
              )}
              aria-label={t('webClipper.quotaAria', 'Monthly Web Clipper usage')}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">
                  {t('webClipper.quotaLabel', 'Free monthly clips')}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {quota.used} / {quota.limit}
                </span>
              </div>
              <Progress
                value={quota.percent}
                className={cn('h-1.5', quota.remaining === 0 && '[&>div]:bg-destructive')}
              />
              <p className="text-[11px] text-muted-foreground">
                {quota.remaining === 0
                  ? t(
                      'webClipper.quotaExhausted',
                      'You’ve used all free clips this month. Upgrade to Pro for unlimited clipping.',
                    )
                  : t('webClipper.quotaRemaining', {
                      count: quota.remaining,
                      defaultValue: `${quota.remaining} clips left this month · Upgrade to Pro for unlimited.`,
                    })}
              </p>
            </div>
          )}

          {(title || url) && (
            <div className="space-y-2">
              <p className="font-medium text-sm text-muted-foreground">
                {t('webClipper.clipping', 'Clipping')}
              </p>
              <p className="font-semibold break-words">{title}</p>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary flex items-center gap-1 hover:underline break-all"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  {url.length > 60 ? url.substring(0, 60) + '…' : url}
                </a>
              )}
            </div>
          )}

          {attachment && (
            <div className="space-y-2">
              <p className="font-medium text-sm text-muted-foreground flex items-center gap-1.5">
                {attachmentType === 'pdf' ? <FileType2 className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                {attachmentType === 'pdf'
                  ? t('webClipper.pdfAttachment', 'PDF attachment')
                  : t('webClipper.imageAttachment', 'Image attachment')}
              </p>
              {attachmentType === 'image' ? (
                <div className="relative">
                  {!imageLoaded && !imageFailed && (
                    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('webClipper.imageLoading', 'Loading image preview…')}
                    </div>
                  )}
                  <img
                    src={attachment}
                    alt={title}
                    onLoad={() => setImageLoaded(true)}
                    onError={() => setImageFailed(true)}
                    className={cn(
                      'rounded-lg max-h-48 w-auto border border-border object-contain',
                      !imageLoaded && 'hidden',
                    )}
                  />
                  {imageFailed && (
                    <p className="text-xs text-destructive">
                      {t('webClipper.imageFailed', 'Could not load image preview.')}
                    </p>
                  )}
                </div>
              ) : (
                <a href={attachment} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline break-all inline-flex items-center gap-1">
                  <Download className="h-3 w-3" />
                  {attachment.length > 60 ? attachment.substring(0, 60) + '…' : attachment}
                </a>
              )}
              <p className="text-[11px] text-muted-foreground">
                {attachmentType === 'pdf'
                  ? t('webClipper.pdfLimit', { defaultValue: `Max ${formatBytes(ATTACHMENT_LIMITS.pdfBytes)} per PDF.`, size: formatBytes(ATTACHMENT_LIMITS.pdfBytes) })
                  : t('webClipper.imageLimit', { defaultValue: `Max ${formatBytes(ATTACHMENT_LIMITS.imageBytes)} per image.`, size: formatBytes(ATTACHMENT_LIMITS.imageBytes) })}
              </p>
            </div>
          )}

          {/* Live progress for download / extract / fetch / embed / save stages. */}
          {saving && stage !== 'idle' && !error && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="font-medium">{progressLabel || t('webClipper.working', 'Working…')}</span>
                {typeof progress === 'number' && (
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{progress}%</span>
                )}
              </div>
              <Progress
                value={
                  typeof progress === 'number'
                    ? progress
                    : typeof fauxProgress === 'number'
                    ? fauxProgress
                    : 5
                }
                className="h-1.5"
              />

              {stage === 'fetching' && (
                <p className="text-[11px] text-muted-foreground">
                  {t('webClipper.fetchingHint', 'Downloading the page, extracting images, embeds, and article text…')}
                </p>
              )}
              {stage === 'extracting' && (
                <p className="text-[11px] text-muted-foreground">
                  {t('webClipper.extractingHint', 'Reading PDF text — your note body will populate shortly.')}
                </p>
              )}
              {stage === 'embedding' && (
                <p className="text-[11px] text-muted-foreground">
                  {t('webClipper.embeddingHint', 'Assembling images, videos, and links into your note…')}
                </p>
              )}
              {(stage === 'validating' || stage === 'downloading' || stage === 'extracting' || stage === 'fetching') && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  className="w-full mt-1"
                >
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  {t('webClipper.cancel', 'Cancel')}
                </Button>
              )}
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{error.title}</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{error.description}</p>
                {(url || attachment) && !saved && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => { setError(null); prepareStartedRef.current = false; abortRef.current = null; void prepareClip(mode); }}
                    >
                      <Loader2 className="h-3.5 w-3.5 mr-1.5" />
                      {t('webClipper.retry', 'Try again')}
                    </Button>
                    {url && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        {t('webClipper.openSource', 'Open source')}
                      </Button>
                    )}
                  </div>
                )}
                {error.debug && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setShowErrorDebug((v) => !v)}
                      className="text-[11px] underline underline-offset-2 opacity-80 hover:opacity-100"
                    >
                      {showErrorDebug
                        ? t('webClipper.hideDebug', 'Hide technical details')
                        : t('webClipper.showDebug', 'Show technical details')}
                    </button>
                    {showErrorDebug && (
                      <div className="mt-2 rounded-md border border-destructive/30 bg-background/60 p-2 text-[11px] font-mono text-foreground/90 space-y-1 break-all">
                        <div><span className="opacity-60">code:</span> {error.debug.code || '—'}</div>
                        {typeof error.debug.httpStatus === 'number' && (
                          <div><span className="opacity-60">http status:</span> {error.debug.httpStatus}</div>
                        )}
                        {error.debug.upstreamMessage && (
                          <div><span className="opacity-60">upstream:</span> {error.debug.upstreamMessage}</div>
                        )}
                        <div><span className="opacity-60">stage:</span> {error.debug.stage || '—'}</div>
                        <div><span className="opacity-60">requested mode:</span> {error.debug.requestedMode || '—'}</div>
                        <div><span className="opacity-60">target url:</span> {error.debug.targetUrl || '—'}</div>
                        {error.debug.attachmentUrl && (
                          <div><span className="opacity-60">attachment ({error.debug.attachmentType || 'unknown'}):</span> {error.debug.attachmentUrl}</div>
                        )}
                        <div><span className="opacity-60">received title:</span> {error.debug.receivedTitle || '—'}</div>
                        <div><span className="opacity-60">shared selection:</span> {error.debug.receivedSelectionChars ?? 0} chars</div>
                        <div><span className="opacity-60">shared content:</span> {error.debug.receivedContentChars ?? 0} chars</div>
                        <div><span className="opacity-60">article html:</span> {error.debug.articleHtmlChars ?? 0} chars</div>
                        <div><span className="opacity-60">jina fallback used:</span> {error.debug.fallbackAttempted ? 'yes' : 'no'}</div>
                        <div><span className="opacity-60">at:</span> {error.debug.at || '—'}</div>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              const payload = JSON.stringify(error.debug, null, 2);
                              void navigator.clipboard?.writeText(payload);
                              toast({ title: t('webClipper.debugCopied', 'Debug info copied') });
                            } catch { /* ignore */ }
                          }}
                          className="mt-1 underline underline-offset-2 opacity-80 hover:opacity-100"
                        >
                          {t('webClipper.copyDebug', 'Copy debug info')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}


          {selection && (
            <div className="space-y-2">
              <p className="font-medium text-sm text-muted-foreground">
                {t('webClipper.selectedText', 'Selected text')}
              </p>
              <blockquote className="border-l-2 border-primary pl-3 text-sm italic text-muted-foreground">
                {selection.length > 200 ? selection.substring(0, 200) + '…' : selection}
              </blockquote>
            </div>
          )}

          {/* Editable preview — user reviews & tweaks EVERYTHING before saving. */}
          {previewReady && !saved && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Pencil className="h-3.5 w-3.5" />
                {t('webClipper.previewHeading', 'Review & edit your clip')}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {t('webClipper.previewTitleLabel', 'Title')}
                </label>
                <Input
                  value={previewTitle}
                  onChange={(e) => setPreviewTitle(e.target.value)}
                  maxLength={MAX_LENGTHS.title}
                  className="text-base font-semibold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {t('webClipper.previewContentLabel', 'Content (fully editable — tap to change anything)')}
                </label>
                <div
                  ref={contentEditorRef}
                  contentEditable
                  suppressContentEditableWarning
                  className="evernote-clip prose prose-sm dark:prose-invert max-w-none min-h-[240px] max-h-[55vh] overflow-y-auto rounded-lg border border-input bg-background p-4 focus:outline-none focus:ring-2 focus:ring-ring"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t('webClipper.previewHint', 'Everything the clipper found — images, videos, links, text — is above. Delete or edit anything before saving.')}
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={commitClip} disabled={saving} className="flex-1">
                  <Save className="h-4 w-4 mr-1.5" />
                  {t('webClipper.saveToNotes', 'Save to notes')}
                </Button>
                <Button variant="outline" onClick={() => navigate(-1)} disabled={saving}>
                  {t('common.cancel', 'Cancel')}
                </Button>
              </div>
            </div>
          )}


          {picking && !saved && (
            <div className="space-y-2 pt-2">
              <p className="text-sm font-medium text-muted-foreground">
                {t('webClipper.pickMode', 'How should we save this?')}
              </p>
              <div className="grid gap-2">
                {MODE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = mode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMode(opt.id)}
                      className={cn(
                        'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                        active
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/40 hover:bg-muted/40',
                      )}
                    >
                      <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">{t(opt.titleKey, opt.fallbackTitle)}</p>
                        <p className="text-xs text-muted-foreground">{t(opt.descKey, opt.fallbackDesc)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <Button onClick={() => setPicking(false)} className="w-full mt-2" disabled={saving}>
                {t('webClipper.saveClip', 'Save clip')}
              </Button>
            </div>
          )}

          {saved && (
            <Button onClick={() => navigate('/notesdashboard')} className="w-full">
              {t('webClipper.viewNotes', 'View notes')}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WebClipper;
