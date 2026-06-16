import { useState, useEffect, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, RotateCcw, Trash2, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  SyncBackup,
  loadBackups,
  restoreFromBackup,
  deleteBackup,
  clearAllBackups,
} from '@/utils/syncBackupHistory';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface SyncBackupSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SyncBackupSheet = ({ open, onOpenChange }: SyncBackupSheetProps) => {
  const [backups, setBackups] = useState<SyncBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<SyncBackup | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await loadBackups();
    setBackups(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleRestore = async (backup: SyncBackup) => {
    setRestoring(backup.id);
    try {
      const success = await restoreFromBackup(backup.id);
      if (success) {
        toast.success('Data restored from backup');
        onOpenChange(false);
      } else {
        toast.error('Backup not found');
      }
    } catch {
      toast.error('Restore failed');
    } finally {
      setRestoring(null);
      setConfirmRestore(null);
    }
  };

  const handleDelete = async (backupId: string) => {
    await deleteBackup(backupId);
    toast.success('Backup deleted');
    refresh();
  };

  const handleClearAll = async () => {
    await clearAllBackups();
    toast.success('All backups cleared');
    setConfirmClearAll(false);
    refresh();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl">
          <SheetHeader className="pb-2">
            <SheetTitle className="flex items-center gap-2 text-base">
              <History className="h-5 w-5 text-primary" />
              Sync Backup History
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              Automatic snapshots taken before each sync. Restore if something went wrong.
            </p>
          </SheetHeader>

          <ScrollArea className="max-h-[55vh] mt-2">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
            ) : backups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No sync backups yet. A backup is created automatically before each sync.
              </div>
            ) : (
              <div className="space-y-2">
                {backups.map((backup) => {
                  const taskCount = Array.isArray(backup.data?.tasks) ? backup.data.tasks.length : 0;
                  const noteCount = Array.isArray(backup.data?.notes) ? backup.data.notes.length : 0;

                  return (
                    <div
                      key={backup.id}
                      className="rounded-xl border border-border bg-card p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium text-foreground">
                            {backup.label}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(backup.timestamp, { addSuffix: true })}
                        </span>
                      </div>

                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>✅ {taskCount} tasks</span>
                        <span>📝 {noteCount} notes</span>
                        {backup.data?.streaks && (
                          <span>🔥 {(backup.data.streaks as any)?.currentStreak || 0} streak</span>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs"
                          disabled={restoring === backup.id}
                          onClick={() => setConfirmRestore(backup)}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          {restoring === backup.id ? 'Restoring...' : 'Restore'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-destructive hover:text-destructive"
                          onClick={() => handleDelete(backup.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {backups.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-destructive hover:text-destructive"
                onClick={() => setConfirmClearAll(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Clear All Backups
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!confirmRestore} onOpenChange={() => setConfirmRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore from backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace your current tasks, notes, streaks, and certificates with the data from this backup. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmRestore && handleRestore(confirmRestore)}>
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmClearAll} onOpenChange={setConfirmClearAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all backups?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all sync backup snapshots.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAll}>Clear All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};