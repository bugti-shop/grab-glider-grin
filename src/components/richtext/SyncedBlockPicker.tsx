import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus, Link2 } from 'lucide-react';
import { listSyncedBlocks, createSyncedBlockId } from '@/utils/syncedBlocks';

interface SyncedBlockPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (id: string, isNew: boolean) => void;
}

export const SyncedBlockPicker = ({ open, onClose, onPick }: SyncedBlockPickerProps) => {
  const [items, setItems] = useState(() => listSyncedBlocks());
  useEffect(() => { if (open) setItems(listSyncedBlocks()); }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Synced Block</DialogTitle>
          <DialogDescription>
            Edit once, update everywhere. Create a new synced block or link an existing one.
          </DialogDescription>
        </DialogHeader>

        <Button
          onClick={() => onPick(createSyncedBlockId(), true)}
          className="w-full justify-start"
          variant="default"
        >
          <Plus className="w-4 h-4 mr-2" /> Create new synced block
        </Button>

        <div className="mt-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Link existing ({items.length})
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1 -mx-1 px-1">
            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No synced blocks yet.
              </div>
            ) : items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => onPick(it.id, false)}
                className="w-full text-left flex items-start gap-2 p-2 rounded-md hover:bg-accent transition-colors"
              >
                <Link2 className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{it.preview}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{it.id}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
