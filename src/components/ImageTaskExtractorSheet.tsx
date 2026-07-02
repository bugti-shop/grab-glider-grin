/**
 * ImageTaskExtractorSheet — Capture a paper / sticky-note photo, run AI vision
 * extraction, and let the user review & add the detected tasks in bulk.
 *
 * Pro-gated via the `ai_dictation` (alias `ai_vision`) feature flag.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon, Loader2, Sparkles, X, Check, Trash2, RotateCcw, Minus, Plus, Maximize2, Camera } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Sheet, SheetDescription, SheetHeader, SheetTitle, SheetPortal } from '@/components/ui/sheet';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { captureImageForAI } from '@/utils/imageCaptureForAI';
import { supabase } from '@/integrations/supabase/client';
import { TodoItem, Folder, Priority, RepeatType } from '@/types/note';
import { cn } from '@/lib/utils';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { acquireAiLock, getAiBusyMessage, releaseAllAiLocks } from '@/utils/aiConcurrencyLock';
import { ensureSignedInForAi } from '@/utils/aiAccessGuard';
import { CameraScannerScreen } from './CameraScannerScreen';

const AI_SCAN_TIMEOUT_MS = 45_000;
const yieldToPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

interface TaskSection { id: string; name: string }

interface ExtractedTask {
  title: string;
  description?: string | null;
  dueDateIso: string | null;
  reminderIso?: string | null;
  deadlineIso: string | null;
  priority: Priority;
  isUrgent?: boolean;
  folderId: string | null;
  sectionId: string | null;
  repeatType: RepeatType;
  repeatDays?: number[];
  tags?: string[];
  location?: string | null;
}

interface ReviewItem extends ExtractedTask {
  uid: string;
  selected: boolean;
}

interface ObjectCountItem {
  label?: string;
  count?: number;
  confidence?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAddTasks: (tasks: Array<Omit<TodoItem, 'id' | 'completed'>>) => void;
  folders: Folder[];
  sections: TaskSection[];
  currentFolderId?: string | null;
  currentSectionId?: string | null;
}

export const ImageTaskExtractorSheet = ({
  isOpen,
  onClose,
  onAddTasks,
  folders,
  sections,
  currentFolderId,
  currentSectionId,
}: Props) => {
  const { t, i18n } = useTranslation();
  const { isPro, isAdminBypass, requireFeature } = useSubscription();
  // Strict paid-only access: must be Pro entitled (paid sub, paid trial, or admin bypass).
  const hasPaidAi = isPro || isAdminBypass;
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'capturing' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
  const [errorLabel, setErrorLabel] = useState<string | null>(null);
  const captureLockRef = useRef(false);


  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setImageDataUrl(null);
      setItems([]);
      setIsExtracting(false);
      setHasRun(false);
      setShowCamera(false);
      setPhase('idle');
      setErrorLabel(null);
      captureLockRef.current = false;
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

  const handleBarcode = (value: string, format: string) => {
    if (!value) return;
    const safe = value.trim();
    onAddTasks([
      {
        text: `Scanned ${format.replace(/_/g, ' ')}: ${safe}`,
        priority: 'none',
        repeatType: 'none',
        folderId: currentFolderId || undefined,
        sectionId: currentSectionId || undefined,
      } as any,
    ]);
    toast.success(t('imageExtract.barcodeAdded', 'Barcode added as task'));
    setShowCamera(false);
    onClose();
  };

  const ensureScannerAccess = async () => {
    if (!(await ensureSignedInForAi())) return false;
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



  const runCapture = async () => {
    if (captureLockRef.current) return;
    if (!(await ensureScannerAccess())) return;
    captureLockRef.current = true;
    try {
      setPhase('capturing');
      const dataUrl = await captureImageForAI('gallery');
      if (!dataUrl) { setPhase('idle'); return; }
      setImageDataUrl(dataUrl);
      await runExtraction(dataUrl);
    } finally {
      captureLockRef.current = false;
    }
  };

  const runExtraction = async (dataUrl: string) => {
    if (!(await ensureSignedInForAi())) {
      onClose();
      return;
    }
    if (!hasPaidAi) {
      onClose();
      requireFeature('ai_dictation');
      return;
    }
    // Prevent concurrent AI calls — Android WebView OOMs with parallel base64 uploads.
    const release = acquireAiLock();
    if (!release) {
      toast.error(getAiBusyMessage());
      return;
    }
    setIsExtracting(true);
    setHasRun(false);
    setItems([]);
    setErrorLabel(null);
    try {
      await yieldToPaint();
      setPhase('uploading');
      const invokePromise = supabase.functions.invoke(
        'ai-extract-tasks-from-image',
        {
          body: {
            imageBase64: dataUrl,
            folders: folders.map((f) => ({ id: f.id, name: f.name })),
            sections: sections.map((s) => ({ id: s.id, name: s.name })),
            nowIso: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            languageCode: (i18n.language || 'en').split('-')[0],
            languageName: 'auto',
            webUnlockCode: isAdminBypass ? 'mustafabugti890' : undefined,
          },
          timeout: AI_SCAN_TIMEOUT_MS,
        },
      );
      setTimeout(() => setPhase((p) => (p === 'uploading' ? 'processing' : p)), 800);
      const { data, error } = await invokePromise;
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const rawTasks: ExtractedTask[] = Array.isArray((data as any)?.tasks)
        ? (data as any).tasks
        : [];

      const reviewItems: ReviewItem[] = rawTasks
        .filter((tk) => tk && typeof tk.title === 'string' && tk.title.trim().length > 0)
        .map((tk, i) => ({
          uid: `extracted-${Date.now()}-${i}`,
          title: tk.title.trim(),
          description: tk.description || null,
          dueDateIso: tk.dueDateIso || null,
          reminderIso: tk.reminderIso || null,
          deadlineIso: tk.deadlineIso || null,
          priority: (tk.priority || 'none') as Priority,
          isUrgent: Boolean(tk.isUrgent),
          folderId: tk.folderId || null,
          sectionId: tk.sectionId || null,
          repeatType: (tk.repeatType || 'none') as RepeatType,
          repeatDays: Array.isArray(tk.repeatDays) ? tk.repeatDays : undefined,
          tags: Array.isArray(tk.tags) ? tk.tags : undefined,
          location: tk.location || null,
          selected: true,
        }));

      setItems(reviewItems);
      setHasRun(true);
      setPhase('done');

      if (reviewItems.length === 0) {
        toast.info(t('imageExtract.noTasks', 'No tasks detected in this image'));
      }
    } catch (e: any) {
      console.error('[image extract] error', e);
      const msg = e?.message || '';
      let label: string;
      if (msg.includes('429')) {
        label = t('tasks.aiRateLimit', 'AI is busy, try again shortly');
      } else if (msg.includes('402')) {
        label = t('tasks.aiCredits', 'AI credits exhausted');
      } else if (msg.includes('AbortError') || msg.includes('aborted') || msg.includes('timeout')) {
        label = t('imageExtract.timeout', 'This scan took too long. Try a clearer or smaller photo.');
      } else {
        label = t('imageExtract.failed', 'Could not read tasks from this image');
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
    // Called from the scanner while the frame is frozen. Returns the raw AI
    // result so the scanner can render bounding boxes + count for review.
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
          webUnlockCode: isAdminBypass ? 'mustafabugti890' : undefined,
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

  const applyObjectCountResult = (
    dataUrl: string,
    result: {
      totalCount: number;
      summary: string;
      objectCounts: ObjectCountItem[];
      detections?: Array<{ label: string; box: number[] }>;
    },
  ) => {
    // Creates the reviewable task from a confirmed object-count result.
    setImageDataUrl(dataUrl);
    setHasRun(false);
    setItems([]);
    setErrorLabel(null);
    const total = result.totalCount;
    const summary = result.summary;
    const counts = result.objectCounts || [];
    const details = counts
      .filter((item) => item && item.label)
      .map((item) => {
        const confidence = item.confidence ? ` (${item.confidence})` : '';
        return `• ${item.label}: ${Number(item.count || 0)}${confidence}`;
      })
      .join('\n');

    const objectTask: ReviewItem = {
      uid: `object-count-${Date.now()}`,
      title: `Object count: ${total} objects`,
      description: [summary, details].filter(Boolean).join('\n\n'),
      dueDateIso: null,
      reminderIso: null,
      deadlineIso: null,
      priority: 'none',
      folderId: currentFolderId || null,
      sectionId: currentSectionId || null,
      repeatType: 'none',
      selected: true,
    };
    setItems([objectTask]);
    setHasRun(true);
    setPhase('done');
    toast.success(`Counted ${total} object${total === 1 ? '' : 's'}`);
  };

  const toggleSelect = (uid: string) => {
    setItems((prev) =>
      prev.map((it) => (it.uid === uid ? { ...it, selected: !it.selected } : it)),
    );
  };

  const updateTitle = (uid: string, title: string) => {
    setItems((prev) =>
      prev.map((it) => (it.uid === uid ? { ...it, title } : it)),
    );
  };

  const removeItem = (uid: string) => {
    setItems((prev) => prev.filter((it) => it.uid !== uid));
  };

  const selectedCount = items.filter((i) => i.selected && i.title.trim()).length;

  const formatDateChip = (iso: string | null): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const folderName = (id: string | null): string | null => {
    if (!id) return null;
    return folders.find((f) => f.id === id)?.name || null;
  };

  const handleAddAll = () => {
    const selected = items.filter((i) => i.selected && i.title.trim());
    if (selected.length === 0) {
      toast.error(t('imageExtract.nothingSelected', 'Nothing selected to add'));
      return;
    }

    const newTasks: Array<Omit<TodoItem, 'id' | 'completed'>> = selected.map(
      (it) => ({
        text: it.title.trim(),
        description: it.description || undefined,
        priority: it.priority,
        dueDate: it.dueDateIso ? new Date(it.dueDateIso) : undefined,
        reminderTime: it.reminderIso ? new Date(it.reminderIso) : undefined,
        repeatType: it.repeatType,
        repeatDays: it.repeatDays && it.repeatDays.length ? it.repeatDays : undefined,
        tags: it.tags && it.tags.length ? it.tags : undefined,
        location: it.location || undefined,
        isUrgent: it.isUrgent || undefined,
        folderId: it.folderId || currentFolderId || undefined,
        sectionId: it.sectionId || currentSectionId || undefined,
      }),
    );

    onAddTasks(newTasks);
    toast.success(
      t('imageExtract.added', '{{count}} tasks added', {
        count: newTasks.length,
      }),
    );
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetPortal>
        <SheetPrimitive.Overlay
          className="fixed inset-0 z-[199] bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          style={{ zIndex: 199 }}
        />
        <SheetPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-[200] gap-4 bg-background border border-white/20 p-0 shadow-2xl rounded-t-3xl max-h-[92vh] overflow-y-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom data-[state=closed]:duration-300 data-[state=open]:duration-500"
          style={{ zIndex: 200, paddingBottom: `calc(1.5rem + var(--safe-bottom, 0px))` }}
        >
          <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none">
            <X className="h-4 w-4" />
          </SheetPrimitive.Close>
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="flex items-center gap-2 text-left">
            <Sparkles className="h-5 w-5 text-primary" />
            {t('imageExtract.title', 'Scan tasks from paper')}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t('imageExtract.description', 'Choose a photo and extract tasks with AI.')}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-4">
          {/* Capture buttons (only when no image yet) */}
          {!imageDataUrl && (
            <div className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                {t(
                  'imageExtract.helper',
                  'Snap a photo of your sticky notes, whiteboard, or handwritten to-do list. AI will extract each task.',
                )}
              </p>
              <Button
                onClick={openScanner}
                className="h-14 w-full gap-2"
              >
                <Camera className="h-5 w-5" />
                <span className="text-sm">
                  {t('imageExtract.openCamera', 'Open camera scanner')}
                </span>
              </Button>
              <Button
                onClick={runCapture}
                variant="outline"
                className="h-12 w-full gap-2"
              >
                <ImageIcon className="h-5 w-5" />
                <span className="text-sm">
                  {t('imageExtract.fromGallery', 'From gallery')}
                </span>
              </Button>
            </div>
          )}

          {/* Image preview */}
          {imageDataUrl && (
            <div className="relative rounded-2xl overflow-hidden bg-muted">
              <button
                type="button"
                onClick={() => setIsZoomed(true)}
                className="block w-full"
                aria-label={t('imageExtract.zoom', 'Tap to zoom')}
              >
                <img
                  src={imageDataUrl}
                  alt={t('imageExtract.previewAlt', 'Captured tasks')}
                  className="w-full max-h-48 object-cover"
                />
              </button>
              <div className="absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-white pointer-events-none">
                {t('imageExtract.tapToZoom', 'Tap to zoom')}
              </div>
              <div className="absolute top-2 right-2 flex items-center gap-1.5">
                <button
                  disabled={isExtracting}
                  onClick={() => {
                    setImageDataUrl(null);
                    setItems([]);
                    setHasRun(false);
                    runCapture();
                  }}
                  className="h-8 px-3 rounded-full bg-black/60 text-white flex items-center gap-1 text-xs font-medium disabled:opacity-50"
                  aria-label={t('imageExtract.replacePhoto', 'Replace photo')}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('imageExtract.replacePhoto', 'Replace photo')}
                </button>
                <button
                  onClick={() => {
                    setImageDataUrl(null);
                    setItems([]);
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

          {/* Progress / error state */}
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
                  {phase === 'capturing' && t('imageExtract.phaseCapturing', 'Capturing image…')}
                  {phase === 'uploading' && t('imageExtract.phaseUploading', 'Uploading to AI…')}
                  {phase === 'processing' && t('imageExtract.phaseProcessing', 'AI is reading your tasks…')}
                  {phase === 'error' && (errorLabel || t('imageExtract.failed', 'Could not read tasks from this image'))}
                </div>
                {phase !== 'error' && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {phase === 'uploading'
                      ? t('imageExtract.uploadingHint', 'Sending photo securely to Gemini')
                      : t('imageExtract.processingHint', 'Usually finishes in 5–15 seconds')}
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


          {/* Extracted tasks list */}
          {!isExtracting && items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('imageExtract.detected', 'Detected tasks')} · {items.length}
                </span>
                <button
                  onClick={() =>
                    setItems((prev) =>
                      prev.map((it) => ({ ...it, selected: true })),
                    )
                  }
                  className="text-xs text-primary"
                >
                  {t('common.selectAll', 'Select all')}
                </button>
              </div>

              <div className="space-y-2">
                {items.map((it) => {
                  const dateChip = formatDateChip(it.dueDateIso);
                  const fName = folderName(it.folderId);
                  return (
                    <div
                      key={it.uid}
                      className={cn(
                        'flex items-start gap-2 p-3 rounded-xl border bg-card transition-colors',
                        it.selected
                          ? 'border-primary/30'
                          : 'border-border opacity-60',
                      )}
                    >
                      <Checkbox
                        checked={it.selected}
                        onCheckedChange={() => toggleSelect(it.uid)}
                        className="mt-1 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <Input
                          value={it.title}
                          onChange={(e) => updateTitle(it.uid, e.target.value)}
                          className="h-8 text-sm border-0 px-0 focus-visible:ring-0 shadow-none bg-transparent"
                        />
                        {(dateChip || fName || it.priority !== 'none' || it.repeatType !== 'none') && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {dateChip && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                                {dateChip}
                              </span>
                            )}
                            {it.priority !== 'none' && (
                              <span
                                className={cn(
                                  'text-[11px] px-1.5 py-0.5 rounded-full',
                                  it.priority === 'high' && 'bg-destructive/10 text-destructive',
                                  it.priority === 'medium' && 'bg-warning/10 text-warning',
                                  it.priority === 'low' && 'bg-success/10 text-success',
                                )}
                              >
                                {it.priority}
                              </span>
                            )}
                            {it.repeatType !== 'none' && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-accent-purple/10 text-accent-purple">
                                {it.repeatType}
                              </span>
                            )}
                            {fName && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-streak/10 text-streak">
                                {fName}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => removeItem(it.uid)}
                        className="flex-shrink-0 w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
                        aria-label={t('common.remove', 'Remove')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state after run */}
          {!isExtracting && hasRun && items.length === 0 && imageDataUrl && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              {t(
                'imageExtract.noTasks',
                'No tasks detected. Try a clearer photo with one task per line.',
              )}
            </div>
          )}

          {/* Action bar */}
          {items.length > 0 && (
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={onClose} className="flex-1">
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                onClick={handleAddAll}
                disabled={selectedCount === 0}
                className="flex-1 gap-1"
              >
                <Check className="h-4 w-4" />
                {t('imageExtract.addCount', 'Add {{count}}', {
                  count: selectedCount,
                })}
              </Button>
            </div>
          )}
        </div>
        </SheetPrimitive.Content>
      </SheetPortal>

      <Dialog open={isZoomed} onOpenChange={setIsZoomed}>
        <DialogContent className="max-w-[100vw] w-screen h-screen max-h-screen p-0 border-0 bg-black rounded-none shadow-none overflow-hidden sm:rounded-none">
          {imageDataUrl && (
            <TransformWrapper
              initialScale={1}
              minScale={1}
              maxScale={6}
              doubleClick={{ mode: 'toggle', step: 2 }}
              wheel={{ step: 0.2 }}
              pinch={{ step: 5 }}
              centerOnInit
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <>
                  <TransformComponent
                    wrapperClass="!w-full !h-full"
                    contentClass="!w-full !h-full flex items-center justify-center"
                  >
                    <img
                      src={imageDataUrl}
                      alt={t('imageExtract.previewAlt', 'Captured tasks')}
                      className="max-w-full max-h-full object-contain select-none"
                      draggable={false}
                    />
                  </TransformComponent>

                  {/* Top-right close */}
                  <button
                    onClick={() => setIsZoomed(false)}
                    className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 backdrop-blur text-white flex items-center justify-center hover:bg-white/25 transition-colors z-10"
                    aria-label={t('common.close', 'Close')}
                  >
                    <X className="h-5 w-5" />
                  </button>

                  {/* Bottom controls */}
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-2 py-1.5 rounded-full bg-white/15 backdrop-blur z-10">
                    <button
                      onClick={() => zoomOut()}
                      className="w-9 h-9 rounded-full text-white flex items-center justify-center hover:bg-white/20 transition-colors"
                      aria-label={t('imageExtract.zoomOut', 'Zoom out')}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => resetTransform()}
                      className="w-9 h-9 rounded-full text-white flex items-center justify-center hover:bg-white/20 transition-colors"
                      aria-label={t('imageExtract.reset', 'Reset zoom')}
                    >
                      <Maximize2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => zoomIn()}
                      className="w-9 h-9 rounded-full text-white flex items-center justify-center hover:bg-white/20 transition-colors"
                      aria-label={t('imageExtract.zoomIn', 'Zoom in')}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Hint */}
                  <div className="absolute top-4 left-4 text-[11px] px-2.5 py-1 rounded-full bg-white/15 backdrop-blur text-white pointer-events-none z-10">
                    {t('imageExtract.pinchHint', 'Pinch or double-tap to zoom')}
                  </div>
                </>
              )}
            </TransformWrapper>
          )}
        </DialogContent>
      </Dialog>

      <CameraScannerScreen
        isOpen={showCamera}
        onClose={() => {
          setShowCamera(false);
          // If user cancelled without capturing, dismiss the whole flow too.
          if (!imageDataUrl && !isExtracting && !hasRun) onClose();
        }}
        title={t('imageExtract.title', 'Scan tasks from paper')}
        initialMode="note"
        onBarcode={handleBarcode}
        onObjectCount={async (dataUrl) => {
          return await fetchObjectCountResult(dataUrl);
        }}
        onConfirmObjectCount={(dataUrl, result) => {
          setShowCamera(false);
          applyObjectCountResult(dataUrl, result);
        }}
        status={
          isExtracting
            ? {
                label:
                  phase === 'uploading'
                    ? t('imageExtract.phaseUploading', 'Uploading to AI…')
                    : t('imageExtract.phaseProcessing', 'AI is reading your tasks…'),
                sublabel:
                  phase === 'uploading'
                    ? t('imageExtract.uploadingHint', 'Sending photo securely to Gemini')
                    : t('imageExtract.processingHint', 'Usually finishes in 5–15 seconds'),
              }
            : null
        }
        onCapture={async (dataUrl) => {
          setShowCamera(false);
          setImageDataUrl(dataUrl);
          await runExtraction(dataUrl);
        }}
      />

    </Sheet>
  );
};
