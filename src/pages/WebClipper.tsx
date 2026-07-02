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
import { Check, Loader2, ExternalLink, FileText, Quote, Globe, Image as ImageIcon, FileType2, AlertTriangle, Download, X, Save, Pencil } from 'lucide-react';
import { saveNoteToDBSingle } from '@/utils/noteStorage';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
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

const MODE_OPTIONS: Array<{ id: ClipMode; icon: typeof FileText; titleKey: string; descKey: string; fallbackTitle: string; fallbackDesc: string }> = [
  { id: 'article',   icon: FileText, titleKey: 'webClipper.modeArticle',   descKey: 'webClipper.modeArticleDesc',   fallbackTitle: 'Article',     fallbackDesc: 'Save the readable article body' },
  { id: 'selection', icon: Quote,    titleKey: 'webClipper.modeSelection', descKey: 'webClipper.modeSelectionDesc', fallbackTitle: 'Selection',   fallbackDesc: 'Save only the highlighted text' },
  { id: 'fullpage',  icon: Globe,    titleKey: 'webClipper.modeFullPage',  descKey: 'webClipper.modeFullPageDesc',  fallbackTitle: 'Full page',   fallbackDesc: 'Save the entire page content' },
];

type Stage = 'idle' | 'validating' | 'downloading' | 'extracting' | 'fetching' | 'embedding' | 'saving';

const WebClipper = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState<{ title: string; description: string } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const canceledRef = useRef(false);

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

  // Explicit mode OR an attachment payload auto-prepares immediately (no picker).
  const explicitMode = searchParams.has('mode') || !!attachment;
  const [mode, setMode] = useState<ClipMode>(initialMode);
  const [picking, setPicking] = useState(!explicitMode);

  useEffect(() => {
    if (!picking && !previewReady && (title || url || content || selection || attachment)) {
      void prepareClip(mode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picking]);

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

  const failWith = (titleKey: string, titleFallback: string, descKey: string, descFallback: string) => {
    const titleMsg = t(titleKey, titleFallback);
    const descMsg = t(descKey, descFallback);
    setError({ title: titleMsg, description: descMsg });
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
      // Always pull the full article when we have a URL in article/fullpage
      // mode. Share intents on mobile sometimes ship a large snippet of the
      // page metadata that used to short-circuit this fetch, leaving the
      // note as "metadata only". A URL is authoritative — trust it.
      const shouldFetchFull =
        !attachment &&
        !!url &&
        (clipMode === 'article' || clipMode === 'fullpage');

      if (shouldFetchFull) {
        try {
          setStage('fetching');
          setProgress(null);
          setProgressLabel(t('webClipper.stageFetching', 'Fetching full article…'));
          const { data, error } = await supabase.functions.invoke('fetch-article', {
            body: { url },
          });
          if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          if (error) {
            fetchFailure = { code: 'network', message: error.message };
          } else if (data?.error) {
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
          }
        } catch (err) {
          if (canceledRef.current || (err as Error)?.name === 'AbortError') throw err;
          console.warn('[webClipper] full-article fetch failed', err);
          fetchFailure = { code: 'network', message: (err as Error)?.message };
        }
      }

      // If the fetch failed but there's no fallback body to save, surface a
      // clear error with retry — don't silently save a link-only stub.
      if (fetchFailure && !articleHtml && !content && !selection) {
        const map: Record<string, { titleKey: string; titleFallback: string; descKey: string; descFallback: string }> = {
          paywall:        { titleKey: 'webClipper.errPaywallTitle',   titleFallback: 'Site blocked access',           descKey: 'webClipper.errPaywallDesc',   descFallback: 'This page needs a login or blocks clippers. Try copying the text and using Selection mode.' },
          not_found:      { titleKey: 'webClipper.errNotFoundTitle',  titleFallback: 'Page not found',                descKey: 'webClipper.errNotFoundDesc',  descFallback: 'The URL returned 404. Double-check the link.' },
          rate_limited:   { titleKey: 'webClipper.errRateTitle',      titleFallback: 'Rate limited',                  descKey: 'webClipper.errRateDesc',      descFallback: 'The source site is throttling requests. Wait a moment and retry.' },
          timeout:        { titleKey: 'webClipper.errTimeoutTitle',   titleFallback: 'Fetch timed out',               descKey: 'webClipper.errTimeoutDesc',   descFallback: 'The page took too long to load. Retry, or open it once in the browser and share it back.' },
          too_large:      { titleKey: 'webClipper.errTooLargeTitle',  titleFallback: 'Page too large',                descKey: 'webClipper.errTooLargeDesc',  descFallback: 'This page exceeds the 5 MB limit. Try Selection mode on the parts you need.' },
          bad_url:        { titleKey: 'webClipper.errBadUrlTitle',    titleFallback: 'Invalid URL',                   descKey: 'webClipper.errBadUrlDesc',    descFallback: 'That URL is not reachable.' },
          upstream_error: { titleKey: 'webClipper.errUpstreamTitle',  titleFallback: 'Source site returned an error', descKey: 'webClipper.errUpstreamDesc',  descFallback: fetchFailure.status ? `The site replied with HTTP ${fetchFailure.status}.` : 'The site did not respond properly.' },
          network:        { titleKey: 'webClipper.errNetworkTitle',   titleFallback: 'Could not reach article',       descKey: 'webClipper.errNetworkDesc',   descFallback: 'Network trouble fetching this page. Check your connection and retry.' },
          internal:       { titleKey: 'webClipper.errInternalTitle',  titleFallback: 'Clipper hit an error',          descKey: 'webClipper.errInternalDesc',  descFallback: 'Something went wrong on our side while parsing the page.' },
        };
        const info = map[fetchFailure.code] || map.internal;
        failWith(info.titleKey, info.titleFallback, info.descKey, info.descFallback);
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
        // Body wrapper — hydrator wires expand/collapse when word count is high.
        parts.push(`<div class="flowist-web-clip-body" data-role="body">`);
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
        // Single sanitize pass over the full assembled document (allows iframe/video for embeds).
        noteContent = sanitizeClippedArticle(parts.join('\n'));
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
      setPreviewHtml(noteContent);
      setPreviewReady(true);
      setStage('idle');
      setProgress(null);
    } catch (error) {
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
      abortRef.current = null;
      setSaving(false);
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
      const cleanHtml = sanitizeClippedArticle(liveHtml);
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
              <Progress value={typeof progress === 'number' ? progress : undefined} className="h-1.5" />
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
                      onClick={() => { setError(null); void prepareClip(mode); }}
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
