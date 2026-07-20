import { useAiFeatureGuard } from '@/utils/aiFeatureGuard';
/**
 * ScanNoteSheet — Upload a page photo from gallery, OCR + structure it via AI vision,
 * preview as formatted HTML, and insert into the current note.
 *
 * Pro-gated via the `ai_dictation` feature flag (shared "AI features" entitlement).
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon, Loader2, Sparkles, X, RotateCcw, Check, Camera } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { captureImageForAI } from '@/utils/imageCaptureForAI';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeForDisplay } from '@/lib/sanitize';
import { cn } from '@/lib/utils';

import { useSubscription } from '@/contexts/SubscriptionContext';
import { acquireAiLock, getAiBusyMessage, releaseAllAiLocks } from '@/utils/aiConcurrencyLock';
import { ensureSignedInForAi } from '@/utils/aiAccessGuard';
import { collectAiClientIdentifiers } from '@/utils/aiClientIdentifiers';
import { CameraScannerScreen } from './CameraScannerScreen';

const AI_SCAN_TIMEOUT_MS = 45_000;
const yieldToPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Receives sanitized HTML to insert into the editor at the cursor. */
  onInsertHtml: (html: string, suggestedTitle?: string) => void;
}

type Phase = 'idle' | 'capturing' | 'uploading' | 'processing' | 'done' | 'error';

interface ObjectCountItem {
  label?: string;
  count?: number;
  confidence?: string;
}

export const ScanNoteSheet = ({ isOpen, onClose, onInsertHtml }: Props) => {
  const { t, i18n } = useTranslation();
  const { requireFeature, customerInfo } = useSubscription();
  // AI GUARD — locked. See src/utils/aiFeatureGuard.ts. Do not couple to billing.
  const { hasPaidAi, isResolving: aiResolving } = useAiFeatureGuard();
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [html, setHtml] = useState('');
  const [suggestedTitle, setSuggestedTitle] = useState('');
  const [hasRun, setHasRun] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorLabel, setErrorLabel] = useState<string | null>(null);
  const captureLockRef = useRef(false);
  const capturedRef = useRef(false);


  useEffect(() => {
    if (!isOpen) {
      setImageDataUrl(null);
      setHtml('');
      setSuggestedTitle('');
      setIsExtracting(false);
      setHasRun(false);
      setShowCamera(false);
      setPhase('idle');
      setErrorLabel(null);
      captureLockRef.current = false;
      capturedRef.current = false;
      releaseAllAiLocks();
    }
  }, [isOpen]);

  // Auto-open the camera scanner directly when the sheet opens (skip intermediate UI).
  useEffect(() => {
    if (!isOpen) return;
    if (showCamera || imageDataUrl || isExtracting || hasRun) return;
    (async () => {
      if (!(await ensureScannerAccess())) { onClose(); return; }
      setShowCamera(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const runCapture = async () => {
    if (captureLockRef.current) return;
    if (!(await ensureScannerAccess())) return;
    captureLockRef.current = true;
    try {
      setPhase('capturing');
      const dataUrl = await captureImageForAI('gallery');
      if (!dataUrl) {
        setPhase('idle');
        return;
      }
      setImageDataUrl(dataUrl);
      await runExtraction(dataUrl);
    } finally {
      captureLockRef.current = false;
    }
  };

  const handleBarcode = (value: string, format: string) => {
    if (!value) return;
    const safe = value.trim();
    const html =
      `<h2>Scanned ${format.replace(/_/g, ' ')}</h2>` +
      `<p><code>${safe.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))}</code></p>`;
    onInsertHtml(html, `Scanned code · ${safe.slice(0, 32)}`);
    toast.success(t('scanNote.barcodeInserted', 'Barcode inserted'));
    setShowCamera(false);
    onClose();
  };

  const ensureScannerAccess = async () => {
    if (!(await ensureSignedInForAi({ intent: 'scan-note' }))) return false;
    if (aiResolving) {
      toast.message('Checking subscription…', { description: 'Please try again in a moment.' });
      return false;
    }
    if (!hasPaidAi) {
      requireFeature('ai_dictation');
      return false;
    }
    return true;
  };

  const openScanner = async () => {
    if (!(await ensureScannerAccess())) return;
    setShowCamera(true);
  };

  const runExtraction = async (dataUrl: string, opts?: { handwriting?: boolean }) => {
    if (!(await ensureSignedInForAi())) {
      onClose();
      return;
    }
    if (aiResolving) {
      toast.message('Checking subscription…', { description: 'Please try again in a moment.' });
      return;
    }
    if (!hasPaidAi) {
      onClose();
      requireFeature('ai_dictation');
      return;
    }
    const release = acquireAiLock();
    if (!release) {
      toast.error(getAiBusyMessage());
      return;
    }
    setIsExtracting(true);
    setHasRun(false);
    setHtml('');
    setSuggestedTitle('');
    setErrorLabel(null);
    try {
      await yieldToPaint();
      setPhase('uploading');
      const clientIdentifiers = await collectAiClientIdentifiers(customerInfo);
      const invokePromise = supabase.functions.invoke(
        'ai-extract-note-from-image',
        {
          body: {
            imageBase64: dataUrl,
            languageCode: (i18n.language || 'en').split('-')[0],
            languageName: 'auto',
            handwriting: opts?.handwriting === true,
            clientIdentifiers,
          },
          timeout: AI_SCAN_TIMEOUT_MS,
        },
      );
      // Once the upload has flushed, we're really waiting on the model.
      setTimeout(() => setPhase((p) => (p === 'uploading' ? 'processing' : p)), 800);
      const { data, error } = await invokePromise;
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const rawHtml = String((data as any)?.html || '').trim();
      const title = String((data as any)?.title || '').trim();
      setHtml(rawHtml);
      setSuggestedTitle(title);
      setHasRun(true);
      setPhase('done');



      if (!rawHtml) {
        toast.info(t('scanNote.noText', 'No readable text found in this image'));
      }
    } catch (e: any) {
      console.error('[scan note] error', e);
      const msg = e?.message || '';
      let label: string;
      if (msg.includes('429')) {
        label = t('tasks.aiRateLimit', 'AI is busy, try again shortly');
      } else if (msg.includes('402')) {
        label = t('tasks.aiCredits', 'AI credits exhausted');
      } else if (msg.includes('AbortError') || msg.includes('aborted') || msg.includes('timeout')) {
        label = t('scanNote.timeout', 'This scan took too long. Try a clearer or smaller photo.');
      } else {
        label = t('scanNote.failed', 'Could not read this page');
      }
      toast.error(label);
      setErrorLabel(label);
      setPhase('error');
    } finally {
      setIsExtracting(false);
      release();
    }
  };

  const fetchObjectCountResult = async (dataUrl: string) => {
    if (!(await ensureScannerAccess())) throw new Error('Scanner access denied');
    const release = acquireAiLock();
    if (!release) {
      toast.error(getAiBusyMessage());
      throw new Error(getAiBusyMessage());
    }
    try {
      const { data, error } = await supabase.functions.invoke('ai-extract-tasks-from-image', {
        body: {
          imageBase64: dataUrl,
          scanMode: 'object_count',
        },
        timeout: AI_SCAN_TIMEOUT_MS,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return {
        totalCount: Number((data as any)?.totalCount || 0),
        summary: String((data as any)?.summary || 'Objects counted').trim(),
        objectCounts: Array.isArray((data as any)?.objectCounts) ? (data as any).objectCounts : [],
        detections: Array.isArray((data as any)?.detections) ? (data as any).detections : [],
      };
    } finally {
      release();
    }
  };

  const fetchReceiptResult = async (dataUrl: string) => {
    if (!(await ensureScannerAccess())) throw new Error('Scanner access denied');
    const release = acquireAiLock();
    if (!release) {
      toast.error(getAiBusyMessage());
      throw new Error(getAiBusyMessage());
    }
    try {
      const { data, error } = await supabase.functions.invoke('ai-extract-receipt', {
        body: {
          imageBase64: dataUrl,
        },
        timeout: AI_SCAN_TIMEOUT_MS,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const d = data as any;
      return {
        merchant: String(d?.merchant || ''),
        total: Number(d?.total || 0),
        currency: String(d?.currency || ''),
        date: String(d?.date || ''),
        category: String(d?.category || ''),
        paymentMethod: String(d?.paymentMethod || ''),
        tax: Number(d?.tax || 0),
        items: Array.isArray(d?.items) ? d.items : [],
        html: String(d?.html || ''),
        title: String(d?.title || ''),
      };
    } finally {
      release();
    }
  };

  const applyObjectCountResult = (
    dataUrl: string,
    result: {
      totalCount: number;
      summary: string;
      objectCounts: ObjectCountItem[];
      detections?: Array<{ label: string; box: number[] }>;
    },
  ) => {
    setImageDataUrl(dataUrl);
    setHasRun(false);
    setHtml('');
    setSuggestedTitle('');
    setErrorLabel(null);
    const total = result.totalCount;
    const summary = result.summary;
    const counts = result.objectCounts || [];
    const list = counts
      .filter((item) => item && item.label)
      .map((item) => {
        const label = escapeHtml(String(item.label || 'Object'));
        const count = Number(item.count || 0);
        const confidence = item.confidence ? ` <small>(${escapeHtml(String(item.confidence))})</small>` : '';
        return `<li>${label}: <strong>${count}</strong>${confidence}</li>`;
      })
      .join('');
    const resultHtml =
      `<h2>Object Count</h2>` +
      `<p><strong>Total objects:</strong> ${total}</p>` +
      `<p>${escapeHtml(summary)}</p>` +
      (list ? `<ul>${list}</ul>` : '');
    setHtml(resultHtml);
    setSuggestedTitle(`Object count · ${total}`);
    setHasRun(true);
    setPhase('done');
    toast.success(`Counted ${total} object${total === 1 ? '' : 's'}`);
  };


  const handleInsert = () => {
    if (!html.trim()) {
      toast.error(t('scanNote.nothingToInsert', 'Nothing to insert'));
      return;
    }
    onInsertHtml(html, suggestedTitle || undefined);
    toast.success(t('scanNote.inserted', 'Inserted into your note'));
    onClose();
  };

  return (
    <Sheet open={isOpen && !showCamera && (imageDataUrl !== null || isExtracting || hasRun)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl max-h-[92vh] overflow-y-auto p-0"
      >
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="flex items-center gap-2 text-left">
            <Sparkles className="h-5 w-5 text-primary" />
            {t('scanNote.title', 'Scan page to note')}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t('scanNote.description', 'Choose a page photo and convert it into a formatted note with AI.')}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-4">
          {!imageDataUrl && (
            <div className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                {t(
                  'scanNote.helperCamera',
                  'Point your camera at a handwritten sticky note or page. AI will transcribe it and keep the headings and lists.',
                )}
              </p>
              <Button onClick={openScanner} className="h-14 w-full gap-2">
                <Camera className="h-5 w-5" />
                <span className="text-sm">{t('scanNote.openCamera', 'Open camera scanner')}</span>
              </Button>
              <Button onClick={runCapture} variant="outline" className="h-12 w-full gap-2">
                <ImageIcon className="h-5 w-5" />
                <span className="text-sm">{t('imageExtract.fromGallery', 'From gallery')}</span>
              </Button>
            </div>
          )}

          {imageDataUrl && (
            <div className="relative rounded-2xl overflow-hidden bg-muted">
              <img
                src={imageDataUrl}
                alt={t('scanNote.previewAlt', 'Captured page')}
                className="w-full max-h-40 object-cover"
              />
              <div className="absolute top-2 right-2 flex items-center gap-1.5">
                <button
                  disabled={isExtracting}
                  onClick={runCapture}
                  className="h-8 px-3 rounded-full bg-black/60 text-white flex items-center gap-1 text-xs font-medium disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('imageExtract.replacePhoto', 'Replace photo')}
                </button>
                <button
                  onClick={() => {
                    setImageDataUrl(null);
                    setHtml('');
                    setSuggestedTitle('');
                    setHasRun(false);
                  }}
                  className="w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"
                  aria-label={t('common.remove', 'Remove')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {(isExtracting || phase === 'error') && (
            <div
              className={cn(
                'flex items-start gap-3 px-3 py-3 rounded-xl border',
                phase === 'error'
                  ? 'bg-destructive/5 border-destructive/30'
                  : 'bg-primary/5 border-primary/20',
              )}
            >
              {phase === 'error' ? (
                <X className="h-5 w-5 text-destructive mt-0.5" />
              ) : (
                <Loader2 className="h-5 w-5 text-primary animate-spin mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {phase === 'capturing' && t('scanNote.phaseCapturing', 'Capturing image…')}
                  {phase === 'uploading' && t('scanNote.phaseUploading', 'Uploading to AI…')}
                  {phase === 'processing' && t('scanNote.phaseProcessing', 'AI is transcribing your page…')}
                  {phase === 'error' && (errorLabel || t('scanNote.failed', 'Could not read this page'))}
                </div>
                {phase !== 'error' && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {phase === 'uploading'
                      ? t('scanNote.uploadingHint', 'Sending photo securely to Gemini')
                      : t('scanNote.processingHint', 'Usually finishes in 5–15 seconds')}
                  </div>
                )}
                {phase === 'error' && imageDataUrl && (
                  <button
                    onClick={() => runExtraction(imageDataUrl)}
                    className="mt-2 text-xs font-semibold text-primary"
                  >
                    {t('common.retry', 'Retry')}
                  </button>
                )}
              </div>
            </div>
          )}


          {!isExtracting && hasRun && html && (
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t('scanNote.preview', 'Preview')}
              </div>
              {suggestedTitle && (
                <div className="text-xs text-muted-foreground">
                  {t('scanNote.suggestedTitle', 'Suggested title')}:{' '}
                  <span className="text-foreground font-medium">{suggestedTitle}</span>
                </div>
              )}
              <div
                className="prose prose-sm dark:prose-invert max-w-none p-3 rounded-xl border bg-card max-h-[40vh] overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: sanitizeForDisplay(html) }}
              />
              <Button onClick={handleInsert} className="w-full h-12 gap-2">
                <Check className="h-4 w-4" />
                {t('scanNote.insertIntoNote', 'Insert into note')}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
      <CameraScannerScreen
        isOpen={showCamera}
        onClose={() => {
          setShowCamera(false);
          if (!capturedRef.current && !imageDataUrl && !isExtracting && !hasRun) onClose();
        }}
        title=""
        initialMode="note"
        onBarcode={handleBarcode}
        onObjectCount={async (dataUrl) => {
          return await fetchObjectCountResult(dataUrl);
        }}
        onConfirmObjectCount={(dataUrl, result) => {
          capturedRef.current = true;
          setShowCamera(false);
          applyObjectCountResult(dataUrl, result);
        }}
        hasPro={hasPaidAi}
        onRequestUpgrade={() => {
          setShowCamera(false);
          requireFeature('ai_dictation');
        }}
        status={
          isExtracting
            ? {
                label:
                  phase === 'uploading'
                    ? t('scanNote.phaseUploading', 'Uploading to AI…')
                    : t('scanNote.phaseProcessing', 'AI is transcribing your page…'),
                sublabel:
                  phase === 'uploading'
                    ? t('scanNote.uploadingHint', 'Sending photo securely to Gemini')
                    : t('scanNote.processingHint', 'Usually finishes in 5–15 seconds'),
              }
            : null
        }
        onCapture={async (dataUrl, opts) => {
          capturedRef.current = true;
          setShowCamera(false);
          setImageDataUrl(dataUrl);
          await runExtraction(dataUrl, opts);
        }}
        onBatchNote={async (pages, opts) => {
          capturedRef.current = true;
          if (!pages.length) return;
          if (!(await ensureScannerAccess())) return;
          setShowCamera(false);
          setImageDataUrl(pages[0]);
          setIsExtracting(true);
          setHasRun(false);
          setHtml('');
          setSuggestedTitle('');
          setErrorLabel(null);
          setPhase('processing');
          const parts: string[] = [];
          const titles: string[] = [];
          let firstError: string | null = null;
          for (let i = 0; i < pages.length; i++) {
            const pageNum = i + 1;
            try {
              toast.loading(`Reading page ${pageNum} of ${pages.length}…`, { id: 'batch-scan' });
              const { data, error } = await supabase.functions.invoke(
                'ai-extract-note-from-image',
                {
                  body: {
                    imageBase64: pages[i],
                    languageCode: (i18n.language || 'en').split('-')[0],
                    languageName: 'auto',
                    handwriting: opts?.handwriting === true,
                  },
                  timeout: AI_SCAN_TIMEOUT_MS,
                },
              );
              if (error) throw error;
              if ((data as any)?.error) throw new Error((data as any).error);
              const pageHtml = String((data as any)?.html || '').trim();
              const pageTitle = String((data as any)?.title || '').trim();
              if (pageTitle) titles.push(pageTitle);
              parts.push(
                `<h2>Page ${pageNum}${pageTitle ? ` · ${escapeHtml(pageTitle)}` : ''}</h2>${pageHtml || '<p><em>No readable text</em></p>'}`,
              );
            } catch (e: any) {
              console.error('[scan note batch] page failed', pageNum, e);
              if (!firstError) firstError = e?.message || 'Extraction failed';
              parts.push(`<h2>Page ${pageNum}</h2><p><em>Could not read this page</em></p>`);
            }
          }
          toast.dismiss('batch-scan');
          const combined = parts.join('<hr/>');
          setHtml(combined);
          setSuggestedTitle(titles[0] || `Scanned notes · ${pages.length} pages`);
          setHasRun(true);
          setPhase('done');
          setIsExtracting(false);
          if (firstError) {
            toast.warning(`Combined ${pages.length} pages · some pages had issues`);
          } else {
            toast.success(`Combined ${pages.length} pages into one note`);
          }
        }}
      />


    </Sheet>
  );
};

const escapeHtml = (value: string) =>
  value.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
