import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Note } from '@/types/note';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Check, Loader2, ExternalLink, FileText, Quote, Globe, Image as ImageIcon, FileType2, AlertTriangle, Download } from 'lucide-react';
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

  const handleSaveClip = async (clipMode: ClipMode) => {
    setSaving(true);
    try {
      let extractedPdfText = '';
      let pdfTruncated = false;
      // For shared PDFs, pull readable text so the note is searchable
      // beyond just the attachment link.
      if (attachment && attachmentType === 'pdf') {
        try {
          const { extractPdfTextFromUrl } = await import('@/utils/pdfExtract');
          const result = await extractPdfTextFromUrl(attachment);
          extractedPdfText = result.text;
          pdfTruncated = result.truncated;
        } catch (err) {
          console.warn('[webClipper] PDF text extraction failed', err);
        }
      }

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

      const existingNotes = await loadNotesFromDB();
      await saveNotesToDB([newNote, ...existingNotes]);

      setSaved(true);
      toast({
        title: t('toasts.webClipSaved', 'Web clip saved'),
        description: t('toasts.clipSavedDesc', { title, defaultValue: `Saved "${title}" to your notes` }),
      });

      setTimeout(() => navigate('/notesdashboard'), 1200);
    } catch (error) {
      console.error('Error saving clip:', error);
      toast({
        title: t('toasts.errorSavingClip', 'Could not save clip'),
        description: t('toasts.somethingWentWrong', 'Something went wrong'),
        variant: 'destructive',
      });
    } finally {
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
                <img
                  src={attachment}
                  alt={title}
                  className="rounded-lg max-h-48 w-auto border border-border object-contain"
                  loading="lazy"
                />
              ) : (
                <a href={attachment} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline break-all">
                  {attachment.length > 60 ? attachment.substring(0, 60) + '…' : attachment}
                </a>
              )}
            </div>
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
