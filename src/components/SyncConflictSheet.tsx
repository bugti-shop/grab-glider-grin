import { useState, useEffect, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  SyncConflict,
  ConflictResolution,
  ConflictCategory,
  getPendingConflicts,
  resolveConflict,
  resolveAllConflicts,
} from '@/utils/driveSyncConflict';
import { CloudOff, Download, Upload, GitMerge, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const CATEGORY_LABELS: Record<ConflictCategory, string> = {
  notes: 'Notes',
  tasks: 'Tasks',
  habits: 'Habits',
  folders: 'Folders',
  tags: 'Tags',
  settings: 'Settings',
  streaks: 'Streaks',
  gamification: 'Achievements',
  journey: 'Journey',
};

const CATEGORY_ICONS: Record<ConflictCategory, string> = {
  notes: '📝',
  tasks: '✅',
  habits: '🔄',
  folders: '📁',
  tags: '🏷️',
  settings: '⚙️',
  streaks: '🔥',
  gamification: '🏆',
  journey: '🗺️',
};

const ConflictCard = ({
  conflict,
  onResolve,
}: {
  conflict: SyncConflict;
  onResolve: (category: ConflictCategory, resolution: ConflictResolution) => void;
}) => {
  const [resolving, setResolving] = useState(false);

  const handle = (resolution: ConflictResolution) => {
    setResolving(true);
    onResolve(conflict.category, resolution);
  };

  const localTime = conflict.localLastModified
    ? formatDistanceToNow(conflict.localLastModified, { addSuffix: true })
    : 'unknown';
  const remoteTime = conflict.remoteLastModified
    ? formatDistanceToNow(conflict.remoteLastModified, { addSuffix: true })
    : 'unknown';

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{CATEGORY_ICONS[conflict.category]}</span>
        <h3 className="font-semibold text-foreground">
          {CATEGORY_LABELS[conflict.category]}
        </h3>
        <span className="ml-auto">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-muted/50 p-3 space-y-1">
          <p className="font-medium text-muted-foreground flex items-center gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            This device
          </p>
          <p className="text-foreground tabular-nums">
            {conflict.localCount} items
          </p>
          <p className="text-xs text-muted-foreground">
            Updated {localTime}
          </p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 space-y-1">
          <p className="font-medium text-muted-foreground flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Cloud
          </p>
          <p className="text-foreground tabular-nums">
            {conflict.remoteCount} items
          </p>
          <p className="text-xs text-muted-foreground">
            Updated {remoteTime}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          disabled={resolving}
          onClick={() => handle('keep_local')}
        >
          <Upload className="h-3.5 w-3.5 mr-1" />
          Keep local
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          disabled={resolving}
          onClick={() => handle('keep_remote')}
        >
          <Download className="h-3.5 w-3.5 mr-1" />
          Keep cloud
        </Button>
        {Array.isArray(conflict.localData) && (
          <Button
            size="sm"
            className="flex-1 text-xs"
            disabled={resolving}
            onClick={() => handle('merge')}
          >
            <GitMerge className="h-3.5 w-3.5 mr-1" />
            Merge
          </Button>
        )}
      </div>
    </div>
  );
};

export const SyncConflictSheet = () => {
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onDetected = (e: CustomEvent<{ conflicts: SyncConflict[] }>) => {
      const incoming = e.detail.conflicts;
      setConflicts(incoming);
      setOpen(incoming.length > 0);
    };
    const onResolved = () => {
      setConflicts([]);
      setOpen(false);
    };

    window.addEventListener('syncConflictDetected', onDetected as EventListener);
    window.addEventListener('syncConflictsResolved', onResolved as EventListener);
    return () => {
      window.removeEventListener('syncConflictDetected', onDetected as EventListener);
      window.removeEventListener('syncConflictsResolved', onResolved as EventListener);
    };
  }, []);

  const handleResolve = useCallback(
    (category: ConflictCategory, resolution: ConflictResolution) => {
      resolveConflict(category, resolution);
      setConflicts(getPendingConflicts());
      if (getPendingConflicts().length === 0) setOpen(false);
    },
    [],
  );

  const handleKeepAllLocal = () => {
    resolveAllConflicts('keep_local');
    setConflicts([]);
    setOpen(false);
  };

  const handleKeepAllRemote = () => {
    resolveAllConflicts('keep_remote');
    setConflicts([]);
    setOpen(false);
  };

  if (conflicts.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2 text-base">
            <CloudOff className="h-5 w-5 text-amber-500" />
            Sync conflict detected
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            Data on this device differs from your cloud backup. Choose which version to keep for each category.
          </p>
        </SheetHeader>

        <div className="space-y-3 mt-2">
          {conflicts.map((c) => (
            <ConflictCard
              key={c.category}
              conflict={c}
              onResolve={handleResolve}
            />
          ))}
        </div>

        {conflicts.length > 1 && (
          <div className="flex gap-2 mt-4 pt-3 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleKeepAllLocal}
            >
              Keep all local
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleKeepAllRemote}
            >
              Keep all cloud
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
