import { useRef, useState } from 'react';
import { Paperclip, X, FileText, Download, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { TaskAttachment } from '@/types/note';
import {
  saveTaskMedia,
  resolveTaskMediaUrl,
  makeTaskMediaRef,
  parseTaskMediaRef,
  deleteTaskMedia,
} from '@/utils/taskMediaStorage';
import PdfViewer from './PdfViewer';

interface NoteAttachmentsSectionProps {
  attachments: TaskAttachment[];
  onChange: (next: TaskAttachment[]) => void;
}

const formatFileSize = (bytes: number) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const NoteAttachmentsSection = ({ attachments, onChange }: NoteAttachmentsSectionProps) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string; type: string } | null>(null);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newOnes: TaskAttachment[] = [];
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await saveTaskMedia('file', id, dataUrl);
      newOnes.push({
        id,
        name: file.name,
        size: file.size,
        type: file.type,
        ref: makeTaskMediaRef('file', id),
      });
    }
    onChange([...(attachments || []), ...newOnes]);
    toast.success(t('tasks.attachments.added', { defaultValue: '{{count}} file(s) attached', count: newOnes.length }));
    if (e.target) e.target.value = '';
  };

  const handleRemove = async (id: string) => {
    const att = attachments.find((a) => a.id === id);
    if (att) {
      const parsed = parseTaskMediaRef(att.ref);
      if (parsed) await deleteTaskMedia(parsed.kind, parsed.id);
    }
    onChange(attachments.filter((a) => a.id !== id));
  };

  const handleOpen = async (att: TaskAttachment) => {
    const dataUrl = await resolveTaskMediaUrl(att.ref);
    if (!dataUrl) return;
    const isImage = att.type?.startsWith('image/');
    const isPdf = att.type === 'application/pdf';
    const isViewable =
      isImage || isPdf || att.type?.startsWith('text/') || att.type?.startsWith('video/') || att.type?.startsWith('audio/');
    if (isViewable) {
      setPreview({ url: dataUrl, name: att.name, type: att.type });
    } else {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');
        const base64Data = dataUrl.split(',')[1];
        const result = await Filesystem.writeFile({
          path: att.name || `file_${Date.now()}`,
          data: base64Data,
          directory: Directory.Cache,
        });
        await Share.share({ title: att.name, url: result.uri });
      } catch {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = att.name;
        link.target = '_blank';
        link.click();
      }
    }
  };

  return (
    <div className="border-t bg-background/95 backdrop-blur-sm px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Paperclip className="h-4 w-4" />
          <span>{t('tasks.attachments.title', 'Attachments')}</span>
          {attachments.length > 0 && (
            <span className="text-xs text-muted-foreground">({attachments.length})</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('tasks.attachments.add', 'Add')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFiles}
        />
      </div>

      {attachments.length > 0 ? (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border border-border/50"
            >
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <button
                type="button"
                onClick={() => handleOpen(att)}
                className="flex-1 min-w-0 text-left"
              >
                <p className="text-sm font-medium truncate">{att.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(att.size)}</p>
              </button>
              <button
                type="button"
                onClick={() => handleOpen(att)}
                className="p-1 rounded hover:bg-accent"
                aria-label="Open"
              >
                <Download className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleRemove(att.id)}
                className="p-1 rounded hover:bg-destructive/10 text-destructive"
                aria-label="Remove"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('tasks.attachments.empty', 'No files attached')}
        </p>
      )}

      {/* In-app preview overlay */}
      {preview && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex flex-col"
          onClick={() => setPreview(null)}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ paddingTop: 'calc(var(--safe-top, 0px) + 12px)' }}
          >
            <p className="text-white text-sm font-medium truncate flex-1">{preview.name}</p>
            <button onClick={() => setPreview(null)} className="p-2 text-white" aria-label="Close">
              <X className="h-6 w-6" />
            </button>
          </div>
          <div
            className="flex-1 flex items-stretch justify-center overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {preview.type?.startsWith('image/') ? (
              <div className="flex-1 flex items-center justify-center p-4">
                <img src={preview.url} alt={preview.name} className="max-w-full max-h-full object-contain rounded-lg" />
              </div>
            ) : preview.type === 'application/pdf' ? (
              <PdfViewer src={preview.url} className="w-full h-full" />
            ) : preview.type?.startsWith('video/') ? (
              <div className="flex-1 flex items-center justify-center p-4">
                <video src={preview.url} controls className="max-w-full max-h-full rounded-lg" />
              </div>
            ) : preview.type?.startsWith('audio/') ? (
              <div className="flex-1 flex items-center justify-center p-4">
                <audio src={preview.url} controls className="w-full max-w-md" />
              </div>
            ) : preview.type?.startsWith('text/') ? (
              <iframe src={preview.url} className="w-full h-full bg-white" title={preview.name} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
                <p className="text-white/80 text-sm">
                  {t('tasks.attachments.cannotPreview', 'This file type cannot be previewed in the app.')}
                </p>
                <a
                  href={preview.url}
                  download={preview.name}
                  className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium"
                >
                  {t('tasks.attachments.download', 'Download / Open')}
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NoteAttachmentsSection;
