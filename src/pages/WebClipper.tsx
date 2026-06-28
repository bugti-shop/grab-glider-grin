import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Note } from '@/types/note';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Check, Loader2, ExternalLink, FileText, Quote, Globe, Image as ImageIcon, FileType2, AlertTriangle, Download, X } from 'lucide-react';
import { loadNotesFromDB, saveNotesToDB } from '@/utils/noteStorage';
import { cn } from '@/lib/utils';
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

type Stage = 'idle' | 'validating' | 'downloading' | 'extracting' | 'embedding' | 'saving';

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

  // Explicit mode OR an attachment payload auto-saves immediately (no picker).
  const explicitMode = searchParams.has('mode') || !!attachment;
  const [mode, setMode] = useState<ClipMode>(initialMode);
  const [picking, setPicking] = useState(!explicitMode);

  useEffect(() => {
    if (!picking && (title || url || content || selection || attachment)) {
      void handleSaveClip(mode);
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

  const handleSaveClip = async (clipMode: ClipMode) => {
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

      setStage('embedding');
      setProgress(null);
      setProgressLabel(t('webClipper.stageEmbedding', 'Building note…'));

      const mergedContent = extractedPdfText
        ? [content, extractedPdfText, pdfTruncated ? '_(PDF text truncated)_' : '']
            .filter(Boolean)
            .join('\n\n')
        : content;

      const noteContent = buildClipNoteBody({
        url,
        selection,
        content: mergedContent,
        mode: clipMode,
        attachment: attachment || undefined,
        attachmentType,
      });

      const newNote: Note = {
        id: crypto.randomUUID(),
        type: 'regular',
        title,
        content: noteContent,
        voiceRecordings: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setStage('saving');
      setProgressLabel(t('webClipper.stageSaving', 'Saving to notes…'));
      const existingNotes = await loadNotesFromDB();
      await saveNotesToDB([newNote, ...existingNotes]);

      setSaved(true);
      setStage('idle');
      setProgress(null);
      toast({
        title: t('toasts.webClipSaved', 'Web clip saved'),
        description: t('toasts.clipSavedDesc', { title, defaultValue: `Saved "${title}" to your notes` }),
      });

      setTimeout(() => navigate('/notesdashboard'), 1200);
    } catch (error) {
      if (canceledRef.current || (error as Error)?.name === 'AbortError') {
        failWith(
          'webClipper.canceledTitle', 'Clip canceled',
          'webClipper.canceledDesc', 'Stopped before the note was saved.',
        );
      } else {
        console.error('Error saving clip:', error);
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
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

          {/* Live progress for download / extract / embed / save stages. */}
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
              {stage === 'extracting' && (
                <p className="text-[11px] text-muted-foreground">
                  {t('webClipper.extractingHint', 'Reading PDF text — your note body will populate shortly.')}
                </p>
              )}
              {(stage === 'validating' || stage === 'downloading' || stage === 'extracting') && (
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
              <AlertDescription>{error.description}</AlertDescription>
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

          {/* Mode picker — shown when no explicit ?mode= param was given. */}
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
