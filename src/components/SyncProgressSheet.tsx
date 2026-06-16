/**
 * SyncProgressSheet — Shows per-category sync progress during upload/download.
 */
import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { FileText, ListTodo, FolderOpen, Target, Flame, Settings2, Trophy, Tag, Loader2, Check, X, SkipForward, Upload, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SyncProgressEvent, SyncCategoryProgress } from '@/utils/googleDriveSync';

const CATEGORY_META: Record<string, { icon: typeof FileText; label: string }> = {
  'flowist_notes.json': { icon: FileText, label: 'Notes' },
  'flowist_tasks.json': { icon: ListTodo, label: 'Tasks' },
  'flowist_habits.json': { icon: Target, label: 'Habits' },
  'flowist_folders.json': { icon: FolderOpen, label: 'Folders' },
  'flowist_tags.json': { icon: Tag, label: 'Tags' },
  'flowist_settings.json': { icon: Settings2, label: 'Settings' },
  'flowist_streaks.json': { icon: Flame, label: 'Streaks' },
  'flowist_gamification.json': { icon: Trophy, label: 'Achievements' },
  'flowist_journey.json': { icon: Trophy, label: 'Journey' },
};

const StatusIcon = ({ status }: { status: SyncCategoryProgress['status'] }) => {
  switch (status) {
    case 'in_progress':
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    case 'done':
      return <Check className="h-4 w-4 text-emerald-500" />;
    case 'error':
      return <X className="h-4 w-4 text-destructive" />;
    case 'skipped':
      return <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />;
    default:
      return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />;
  }
};

export function SyncProgressSheet() {
  const [isOpen, setIsOpen] = useState(false);
  const [progress, setProgress] = useState<SyncProgressEvent | null>(null);
  const [autoClose, setAutoClose] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleProgress = useCallback((e: CustomEvent<SyncProgressEvent>) => {
    const p = e.detail;
    setProgress(p);

    // Auto-close 2s after all done
    if (p.completed >= p.total && p.total > 0) {
      if (autoClose) clearTimeout(autoClose);
      const t = setTimeout(() => setIsOpen(false), 2000);
      setAutoClose(t);
    }
  }, [autoClose]);

  // Only open when user manually triggers via button
  const handleOpen = useCallback(() => {
    setIsOpen(true);
    if (autoClose) clearTimeout(autoClose);
  }, [autoClose]);

  useEffect(() => {
    window.addEventListener('syncProgress', handleProgress as EventListener);
    window.addEventListener('openSyncProgressSheet', handleOpen as EventListener);
    return () => {
      window.removeEventListener('syncProgress', handleProgress as EventListener);
      window.removeEventListener('openSyncProgressSheet', handleOpen as EventListener);
      if (autoClose) clearTimeout(autoClose);
    };
  }, [handleProgress, handleOpen, autoClose]);

  if (!progress) return null;

  const percent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  const isUpload = progress.mode === 'upload';
  const allDone = progress.completed >= progress.total && progress.total > 0;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl pb-safe">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2 text-base font-semibold">
            {isUpload ? (
              <Upload className="h-4.5 w-4.5 text-primary" />
            ) : (
              <Download className="h-4.5 w-4.5 text-primary" />
            )}
            {allDone
              ? (isUpload ? 'Upload Complete' : 'Restore Complete')
              : (isUpload ? 'Uploading to Cloud...' : 'Restoring from Cloud...')}
          </SheetTitle>
        </SheetHeader>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>{progress.completed} of {progress.total} categories</span>
            <span className="font-medium">{percent}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                allDone ? 'bg-emerald-500' : 'bg-primary'
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Category list */}
        <div className="space-y-0.5 overflow-y-auto max-h-[45vh]">
          {progress.categories.map((cat) => {
            const meta = CATEGORY_META[cat.name] || { icon: FileText, label: cat.label || cat.name };
            const Icon = meta.icon;
            return (
              <div
                key={cat.name}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors',
                  cat.status === 'in_progress' && 'bg-primary/5'
                )}
              >
                <div className={cn(
                  'h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0',
                  cat.status === 'done' ? 'bg-emerald-500/10' :
                  cat.status === 'error' ? 'bg-destructive/10' :
                  cat.status === 'in_progress' ? 'bg-primary/10' :
                  'bg-muted'
                )}>
                  <Icon className={cn(
                    'h-4 w-4',
                    cat.status === 'done' ? 'text-emerald-500' :
                    cat.status === 'error' ? 'text-destructive' :
                    cat.status === 'in_progress' ? 'text-primary' :
                    'text-muted-foreground'
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{meta.label}</p>
                  {cat.status === 'done' && cat.itemCount !== undefined && cat.itemCount >= 0 && (
                    <p className="text-[11px] text-muted-foreground">{cat.itemCount} items</p>
                  )}
                  {cat.status === 'skipped' && (
                    <p className="text-[11px] text-muted-foreground">Disabled in sync settings</p>
                  )}
                  {cat.status === 'error' && (
                    <p className="text-[11px] text-destructive break-words">
                      {cat.error || 'Failed'}
                    </p>
                  )}
                </div>
                <StatusIcon status={cat.status} />
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
