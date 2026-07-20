import { useAiFeatureGuard } from '@/utils/aiFeatureGuard';
/**
 * TextTaskExtractorSheet — Paste an email or any text, OR upload a PDF, and let
 * the AI extract a fully-structured task list (title, description, priority,
 * due date, repeat, tags, location, folder, section). Paid Pro only.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText, FileUp, Loader2, Sparkles, X, Trash2, Mail, Type as TypeIcon,
} from 'lucide-react';
import { Sheet, SheetDescription, SheetHeader, SheetTitle, SheetPortal } from '@/components/ui/sheet';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { TodoItem, Folder, Priority, RepeatType } from '@/types/note';
import { cn } from '@/lib/utils';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { acquireAiLock, getAiBusyMessage, releaseAllAiLocks } from '@/utils/aiConcurrencyLock';
import { extractTextFromPdfFile } from '@/utils/pdfTextExtract';
import { ensureSignedInForAi } from '@/utils/aiAccessGuard';
import { collectAiClientIdentifiers } from '@/utils/aiClientIdentifiers';

const AI_TIMEOUT_MS = 180_000; // long emails / PDFs are chunked server-side

type SourceMode = 'text' | 'email' | 'pdf';

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
  folderName?: string | null;
  sectionId: string | null;
  sectionName?: string | null;
  repeatType: RepeatType;
  repeatDays?: number[];
  tags?: string[];
  location?: string | null;
}

interface ReviewItem extends ExtractedTask {
  uid: string;
  selected: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAddTasks: (tasks: Array<Omit<TodoItem, 'id' | 'completed'>>) => void;
  folders: Folder[];
  sections: TaskSection[];
  currentFolderId?: string | null;
  currentSectionId?: string | null;
  /** Resolve an AI-proposed folder name → id (creating one if needed). */
  onEnsureFolder?: (name: string) => string | null;
  /** Resolve an AI-proposed section name → id (creating one if needed). */
  onEnsureSection?: (name: string, folderId?: string | null) => string | null;
  /** Pre-fill the input text (e.g. when opened from a note). */
  initialText?: string;
  /** Pre-select the source mode. */
  initialMode?: SourceMode;
  /** Custom sheet title shown in the header. */
  titleOverride?: string;
}

export const TextTaskExtractorSheet = ({
  isOpen, onClose, onAddTasks, folders, sections, currentFolderId, currentSectionId,
  onEnsureFolder, onEnsureSection,
  initialText, initialMode, titleOverride,
}: Props) => {
  const { t, i18n } = useTranslation();
  const { requireFeature } = useSubscription();
  // AI GUARD — locked. See src/utils/aiFeatureGuard.ts. Do not couple to billing.
  const { hasPaidAi, isResolving: aiResolving } = useAiFeatureGuard();

  const [mode, setMode] = useState<SourceMode>('text');
  const [text, setText] = useState(initialText || '');
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [pdfText, setPdfText] = useState('');
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Double-click / concurrent-request guard. `inFlightRef` is set synchronously
  // on tap so a rapid second tap can't slip through before React re-renders
  // the disabled button. `abortRef` cancels the current fetch if the sheet
  // closes or a legitimate retry needs to supersede it.
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastTapAtRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      // Re-apply initial values whenever the sheet opens (e.g. opening from a different note)
      setMode('text');
      setText(initialText || '');
    } else {
      setMode('text'); setText(''); setPdfName(null); setPdfText('');
      setIsParsingPdf(false); setIsExtracting(false); setItems([]); setHasRun(false);
      // Cancel any in-flight extraction and reset guards when the sheet closes.
      if (abortRef.current) { try { abortRef.current.abort(); } catch {} abortRef.current = null; }
      inFlightRef.current = false;
      releaseAllAiLocks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Cancel on unmount too.
  useEffect(() => () => {
    if (abortRef.current) { try { abortRef.current.abort(); } catch {} }
    inFlightRef.current = false;
  }, []);


  const handlePdfUpload = async (file: File) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      toast.error(t('textExtract.pdfOnly', 'Please choose a PDF file'));
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error(t('textExtract.pdfTooLarge', 'PDF must be smaller than 20MB'));
      return;
    }
    setIsParsingPdf(true);
    try {
      const extracted = await extractTextFromPdfFile(file, 40);
      if (!extracted.trim()) {
        toast.error(t('textExtract.pdfNoText', 'No text found in this PDF (it may be a scan — use Scan from photo instead).'));
        setIsParsingPdf(false);
        return;
      }
      setPdfName(file.name);
      setPdfText(extracted);
    } catch (e) {
      console.error('[pdf parse]', e);
      toast.error(t('textExtract.pdfFailed', 'Could not read this PDF'));
    } finally {
      setIsParsingPdf(false);
    }
  };

  const runExtraction = async () => {
    // Synchronous double-tap guard — runs BEFORE any await so a burst of
    // taps within the same event loop tick cannot start two extractions.
    const now = Date.now();
    if (now - lastTapAtRef.current < 600) return;
    lastTapAtRef.current = now;
    if (inFlightRef.current) {
      toast.info(t('textExtract.alreadyRunning', 'AI is already extracting — please wait…'));
      return;
    }
    inFlightRef.current = true;

    // Abort any prior in-flight request (defensive; inFlightRef should have
    // caught it, but this makes cancellation deterministic).
    if (abortRef.current) { try { abortRef.current.abort(); } catch {} }
    const controller = new AbortController();
    abortRef.current = controller;

    // Show immediate feedback BEFORE any async guard — users complained the
    // button felt dead on Android because auth/lock checks awaited silently.
    setIsExtracting(true);
    setHasRun(false);
    setItems([]);
    const loadingToastId = `ai-extract-${Date.now()}`;
    toast.loading(t('textExtract.extracting', 'Extracting tasks…'), { id: loadingToastId });


    let release: (() => void) | null = null;
    try {
      if (!(await ensureSignedInForAi())) {
        toast.dismiss(loadingToastId);
        setIsExtracting(false);
        onClose();
        return;
      }
      if (aiResolving) {
        toast.dismiss(loadingToastId);
        setIsExtracting(false);
        toast.message('Checking subscription…', { description: 'Please try again in a moment.' });
        return;
      }
      if (!hasPaidAi) {
        toast.dismiss(loadingToastId);
        setIsExtracting(false);
        onClose();
        requireFeature('ai_dictation');
        return;
      }
      const sourceLabel: 'text' | 'email' | 'pdf' = mode;
      const inputText = (mode === 'pdf' ? pdfText : text).trim();
      if (!inputText) {
        toast.dismiss(loadingToastId);
        setIsExtracting(false);
        toast.error(t('textExtract.empty', 'Add some text first'));
        return;
      }
      if (inputText.length < 10) {
        toast.dismiss(loadingToastId);
        setIsExtracting(false);
        toast.error(t('textExtract.tooShort', 'Add a little more text so AI can detect tasks'));
        return;
      }
      release = acquireAiLock();
      if (!release) {
        toast.dismiss(loadingToastId);
        setIsExtracting(false);
        toast.error(getAiBusyMessage());
        return;
      }
      const { data, error } = await supabase.functions.invoke('ai-extract-tasks-from-text', {
        body: {
          text: inputText,
          sourceLabel,
          folders: folders.map((f) => ({ id: f.id, name: f.name })),
          sections: sections.map((s) => ({ id: s.id, name: s.name })),
          nowIso: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          languageCode: (i18n.language || 'en').split('-')[0],
          languageName: 'auto',
        },
        timeout: AI_TIMEOUT_MS,
        signal: controller.signal,
      } as any);
      // If a newer request superseded this one (controller aborted while we
      // were awaiting), drop the result silently — a fresh handler owns state.
      if (controller.signal.aborted || abortRef.current !== controller) return;
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const raw: ExtractedTask[] = Array.isArray((data as any)?.tasks) ? (data as any).tasks : [];
      const review: ReviewItem[] = raw
        .filter((tk) => tk && typeof tk.title === 'string' && tk.title.trim().length > 0)
        .map((tk, i) => ({
          uid: `txt-${Date.now()}-${i}`,
          title: tk.title.trim(),
          description: tk.description || null,
          dueDateIso: tk.dueDateIso || null,
          reminderIso: tk.reminderIso || null,
          deadlineIso: tk.deadlineIso || null,
          priority: (tk.priority || 'none') as Priority,
          isUrgent: Boolean(tk.isUrgent),
          folderId: tk.folderId || null,
          folderName: tk.folderName || null,
          sectionId: tk.sectionId || null,
          sectionName: tk.sectionName || null,
          repeatType: (tk.repeatType || 'none') as RepeatType,
          repeatDays: Array.isArray(tk.repeatDays) ? tk.repeatDays : undefined,
          tags: Array.isArray(tk.tags) ? tk.tags : undefined,
          location: tk.location || null,
          selected: true,
        }));
      setItems(review);
      setHasRun(true);
      toast.dismiss(loadingToastId);
      if (review.length === 0) {
        toast.info(t('textExtract.noTasks', 'No tasks detected in this text'));
      } else {
        toast.success(t('textExtract.detectedCount', '{{count}} tasks detected', { count: review.length }));
      }
    } catch (e: any) {
      // Silently swallow aborts triggered by sheet close or supersede.
      if (controller.signal.aborted || e?.name === 'AbortError') {
        toast.dismiss(loadingToastId);
        return;
      }
      console.error('[text extract]', e);
      toast.dismiss(loadingToastId);
      const msg = String(e?.message || '');
      if (msg.includes('402') || /pro feature|upgrade/i.test(msg)) {
        onClose();
        requireFeature('ai_dictation');
      } else if (msg.includes('429')) {
        toast.error(t('tasks.aiRateLimit', 'AI is busy, try again shortly'));
      } else if (msg.includes('timeout')) {
        toast.error(t('textExtract.timeout', 'AI took too long. Try shorter text.'));
      } else {
        toast.error(t('textExtract.failed', 'Could not extract tasks from this text'));
      }
    } finally {
      setIsExtracting(false);
      if (release) release();
      inFlightRef.current = false;
      if (abortRef.current === controller) abortRef.current = null;
    }
  };



  const toggle = (uid: string) =>
    setItems((p) => p.map((it) => (it.uid === uid ? { ...it, selected: !it.selected } : it)));
  const updateTitle = (uid: string, v: string) =>
    setItems((p) => p.map((it) => (it.uid === uid ? { ...it, title: v } : it)));
  const removeItem = (uid: string) => setItems((p) => p.filter((it) => it.uid !== uid));

  const formatChip = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  const folderName = (id: string | null) => (id ? folders.find((f) => f.id === id)?.name || null : null);

  const handleAddAll = () => {
    const selected = items.filter((i) => i.selected && i.title.trim());
    if (!selected.length) { toast.error(t('textExtract.nothingSelected', 'Nothing selected to add')); return; }
    const newTasks: Array<Omit<TodoItem, 'id' | 'completed'>> = selected.map((it) => {
      let resolvedFolderId = it.folderId || null;
      if (!resolvedFolderId && it.folderName && onEnsureFolder) {
        resolvedFolderId = onEnsureFolder(it.folderName);
      }
      let resolvedSectionId = it.sectionId || null;
      if (!resolvedSectionId && it.sectionName && onEnsureSection) {
        resolvedSectionId = onEnsureSection(it.sectionName, resolvedFolderId);
      }
      return {
        text: it.title.trim(),
        description: it.description || undefined,
        priority: it.priority,
        dueDate: it.dueDateIso ? new Date(it.dueDateIso) : undefined,
        reminderTime: it.reminderIso ? new Date(it.reminderIso) : undefined,
        repeatType: it.repeatType,
        repeatDays: it.repeatDays?.length ? it.repeatDays : undefined,
        tags: it.tags?.length ? it.tags : undefined,
        location: it.location || undefined,
        isUrgent: it.isUrgent || undefined,
        folderId: resolvedFolderId || currentFolderId || undefined,
        sectionId: resolvedSectionId || currentSectionId || undefined,
      };
    });
    onAddTasks(newTasks);
    toast.success(t('textExtract.added', '{{count}} tasks added', { count: newTasks.length }));
    onClose();
  };

  const selectedCount = items.filter((i) => i.selected && i.title.trim()).length;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetPortal>
        <SheetPrimitive.Overlay
          className="fixed inset-0 z-[199] bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          style={{ zIndex: 199 }}
        />
        <SheetPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-[200] gap-4 bg-background border border-white/20 p-0 shadow-2xl rounded-t-3xl max-h-[92vh] overflow-y-auto"
          style={{ zIndex: 200, paddingBottom: `calc(1.5rem + var(--safe-bottom, 0px))` }}
        >
          <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </SheetPrimitive.Close>
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="flex items-center gap-2 text-left">
              <Sparkles className="h-5 w-5 text-primary" />
              {titleOverride || t('textExtract.titleTextOnly', 'Extract tasks from text')}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {t('textExtract.descriptionTextOnly', 'Paste text and AI will extract tasks.')}
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-6 space-y-4">
            {/* Input area (text only) */}
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('textExtract.placeholderText', 'Paste meeting notes, a message, or any text. AI will pull out tasks with dates, priorities, and more.')}
              className="min-h-[180px] text-sm"
              disabled={isExtracting}
            />


            {/* Extract button */}
            <Button
              onClick={runExtraction}
              disabled={isExtracting || isParsingPdf || (mode === 'pdf' ? !pdfText : !text.trim())}
              className="h-12 w-full gap-2"
            >
              {isExtracting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> {t('textExtract.extracting', 'Extracting tasks…')}</>
              ) : (
                <><Sparkles className="h-4 w-4" /> {t('textExtract.extract', 'Extract tasks with AI')}</>
              )}
            </Button>

            {/* Loading state — visible progress card while AI works */}
            {isExtracting && (
              <div className="flex flex-col items-center justify-center gap-3 py-8 px-4 rounded-xl border border-primary/20 bg-primary/5">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium">
                    {t('textExtract.extracting', 'Extracting tasks…')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('textExtract.extractingHint', 'AI is reading your text. This can take up to a minute for long content.')}
                  </p>
                </div>
              </div>
            )}

            {/* Results */}
            {!isExtracting && items.length > 0 && (

              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t('textExtract.detected', 'Detected tasks')} · {items.length}
                  </span>
                  <button
                    onClick={() => setItems((p) => p.map((it) => ({ ...it, selected: true })))}
                    className="text-xs text-primary"
                  >
                    {t('common.selectAll', 'Select all')}
                  </button>
                </div>
                <div className="space-y-2">
                  {items.map((it) => {
                    const dateChip = formatChip(it.dueDateIso);
                    const fName = folderName(it.folderId);
                    return (
                      <div
                        key={it.uid}
                        className={cn(
                          'flex items-start gap-2 p-3 rounded-xl border bg-card',
                          it.selected ? 'border-primary/30' : 'border-border opacity-60',
                        )}
                      >
                        <Checkbox
                          checked={it.selected}
                          onCheckedChange={() => toggle(it.uid)}
                          className="mt-1 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <Input
                            value={it.title}
                            onChange={(e) => updateTitle(it.uid, e.target.value)}
                            className="h-8 text-sm border-0 px-0 focus-visible:ring-0 shadow-none bg-transparent"
                          />
                          {it.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{it.description}</p>
                          )}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {dateChip && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                                {dateChip}
                              </span>
                            )}
                            {it.priority !== 'none' && (
                              <span className={cn(
                                'text-[11px] px-1.5 py-0.5 rounded-full',
                                it.priority === 'high' && 'bg-destructive/10 text-destructive',
                                it.priority === 'medium' && 'bg-warning/10 text-warning',
                                it.priority === 'low' && 'bg-success/10 text-success',
                              )}>
                                {it.priority}
                              </span>
                            )}
                            {it.repeatType !== 'none' && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-accent/40">
                                {it.repeatType}
                              </span>
                            )}
                            {fName && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                {fName}
                              </span>
                            )}
                            {it.location && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                📍 {it.location}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(it.uid)}
                          className="text-muted-foreground hover:text-destructive flex-shrink-0 mt-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <Button onClick={handleAddAll} className="h-12 w-full" disabled={selectedCount === 0}>
                  {t('textExtract.addCount', 'Add {{count}} tasks', { count: selectedCount })}
                </Button>
              </div>
            )}

            {!isExtracting && hasRun && items.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('textExtract.noTasks', 'No tasks detected in this text')}
              </p>
            )}
          </div>
        </SheetPrimitive.Content>
      </SheetPortal>
    </Sheet>
  );
};