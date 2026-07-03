import { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Book, BookOpen, ChevronRight, Plus, Search, ArrowLeft, Check, Pencil, Palette, Trash2 } from 'lucide-react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Folder as FolderType } from '@/types/note';
import { getSetting, setSetting } from '@/utils/settingsStorage';
import { useNotes } from '@/contexts/NotesContext';
import { BottomNavigation } from '@/components/BottomNavigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { genId } from '@/utils/genId';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const NOTEBOOK_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f97316', // orange
  '#ef4444', // red
  '#a855f7', // purple
  '#ec4899', // pink
  '#eab308', // yellow
  '#14b8a6', // teal
  '#64748b', // slate
];

const Notebooks = () => {
  const navigate = useNavigate();
  const { notesMeta } = useNotes();
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(NOTEBOOK_COLORS[0]);

  // Long-press action sheet state
  const [actionFor, setActionFor] = useState<FolderType | null>(null);
  const [renameFor, setRenameFor] = useState<FolderType | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [colorFor, setColorFor] = useState<FolderType | null>(null);
  const [deleteFor, setDeleteFor] = useState<FolderType | null>(null);
  const pressTimer = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  const startPress = (folder: FolderType) => {
    longPressedRef.current = false;
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      longPressedRef.current = true;
      try {
        if ('vibrate' in navigator) navigator.vibrate?.(30);
      } catch {}
      setActionFor(folder);
    }, 450);
  };
  const cancelPress = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const persistFolders = async (next: FolderType[]) => {
    setFolders(next);
    await setSetting('folders', next);
    window.dispatchEvent(new Event('foldersUpdated'));
  };

  const doRename = async () => {
    if (!renameFor) return;
    const name = renameValue.trim();
    if (!name) return;
    if (
      folders.some(
        (f) => f.id !== renameFor.id && f.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      toast.error('A notebook with this name already exists');
      return;
    }
    const next = folders.map((f) => (f.id === renameFor.id ? { ...f, name } : f));
    await persistFolders(next);
    setRenameFor(null);
    toast.success('Notebook renamed');
  };

  const doChangeColor = async (color: string) => {
    if (!colorFor) return;
    const next = folders.map((f) => (f.id === colorFor.id ? { ...f, color } : f));
    await persistFolders(next);
    setColorFor(null);
    toast.success('Color updated');
  };

  const doDelete = async () => {
    if (!deleteFor) return;
    if (deleteFor.isDefault && folders.length <= 1) {
      toast.error("Create another notebook before deleting Inbox");
      setDeleteFor(null);
      return;
    }
    let next = folders.filter((f) => f.id !== deleteFor.id);
    // If we removed the default, promote another notebook to default
    if (deleteFor.isDefault && next.length > 0 && !next.some((f) => f.isDefault)) {
      next = next.map((f, i) => (i === 0 ? { ...f, isDefault: true } : f));
    }
    await persistFolders(next);
    setDeleteFor(null);
    toast.success('Notebook deleted');
  };

  useEffect(() => {
    const load = async () => {
      const saved = await getSetting<FolderType[] | null>('folders', null);
      if (saved && saved.length > 0) {
        setFolders(
          saved.map((f) => ({ ...f, createdAt: new Date(f.createdAt as any) })),
        );
      } else {
        const inbox: FolderType = {
          id: genId(),
          name: 'Inbox',
          color: '#3b82f6',
          icon: 'Folder',
          isDefault: true,
          createdAt: new Date(),
        };
        setFolders([inbox]);
        void setSetting('folders', [inbox]);
      }
    };
    load();
    const onUpdated = () => load();
    window.addEventListener('foldersUpdated', onUpdated);
    return () => window.removeEventListener('foldersUpdated', onUpdated);
  }, []);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notesMeta) {
      if (n.isDeleted || n.isArchived) continue;
      if (!n.folderId) continue;
      map.set(n.folderId, (map.get(n.folderId) ?? 0) + 1);
    }
    return map;
  }, [notesMeta]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? folders.filter((f) => f.name.toLowerCase().includes(q))
      : folders;
    return [...list].sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [folders, query]);

  const openNotebook = (id: string) => {
    navigate(`/notebook/${encodeURIComponent(id)}`);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    if (folders.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
      toast.error('A notebook with this name already exists');
      return;
    }
    const folder: FolderType = {
      id: genId(),
      name,
      color: newColor,
      icon: 'Book',
      isDefault: false,
      createdAt: new Date(),
    };
    const updated = [...folders, folder];
    setFolders(updated);
    await setSetting('folders', updated);
    window.dispatchEvent(new Event('foldersUpdated'));
    setNewName('');
    setNewColor(NOTEBOOK_COLORS[0]);
    setAddOpen(false);
    toast.success(`Notebook "${name}" created`);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header
        className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b"
        style={{ paddingTop: 'var(--safe-top, 0px)' }}
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 md:hidden"
            onClick={() => navigate('/notesdashboard')}
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold flex-1">Notebooks</h1>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {folders.length} {folders.length === 1 ? 'notebook' : 'notebooks'}
          </span>
        </div>
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search notebooks"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 h-10 rounded-full bg-muted/60 border-transparent focus-visible:bg-background"
            />
          </div>
        </div>
      </header>


      {/* Notebook grid — virtualized for 10k+ notebooks */}
      <VirtualNotebookGrid
        items={filtered}
        counts={counts}
        onOpen={openNotebook}
        onContext={(f) => setActionFor(f)}
        startPress={startPress}
        cancelPress={cancelPress}
        longPressedRef={longPressedRef}
      />

      {filtered.length === 0 && (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No notebooks found
        </div>
      )}



      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New notebook</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Notebook name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
            maxLength={60}
          />
          <div>
            <p className="text-xs text-muted-foreground mb-2">Pick a color</p>
            <div className="flex flex-wrap gap-2">
              {NOTEBOOK_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  aria-label={`Color ${c}`}
                  className="h-8 w-8 rounded-full flex items-center justify-center transition-transform active:scale-95"
                  style={{
                    backgroundColor: c,
                    boxShadow: newColor === c ? `0 0 0 3px ${c}55` : 'none',
                  }}
                >
                  {newColor === c && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newName.trim()}
              style={{ backgroundColor: newColor }}
              className="text-white hover:opacity-90"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Long-press action sheet */}
      <Dialog open={!!actionFor} onOpenChange={(o) => !o && setActionFor(null)}>
        <DialogContent className="sm:max-w-xs p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-base truncate">{actionFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col">
            <button
              type="button"
              className="flex items-center gap-3 px-4 py-3 text-left hover:bg-muted transition-colors"
              onClick={() => {
                if (!actionFor) return;
                setRenameValue(actionFor.name);
                setRenameFor(actionFor);
                setActionFor(null);
              }}
            >
              <Pencil className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Rename</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-3 px-4 py-3 text-left hover:bg-muted transition-colors border-t"
              onClick={() => {
                if (!actionFor) return;
                setColorFor(actionFor);
                setActionFor(null);
              }}
            >
              <Palette className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Change color</span>
            </button>
            <button
              type="button"
              disabled={actionFor?.isDefault && folders.length <= 1}
              className="flex items-center gap-3 px-4 py-3 text-left hover:bg-muted transition-colors border-t text-destructive disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => {
                if (!actionFor) return;
                setDeleteFor(actionFor);
                setActionFor(null);
              }}
            >
              <Trash2 className="h-4 w-4" />
              <span className="text-sm">Delete</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renameFor} onOpenChange={(o) => !o && setRenameFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename notebook</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doRename()}
            maxLength={60}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameFor(null)}>
              Cancel
            </Button>
            <Button onClick={doRename} disabled={!renameValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change color dialog */}
      <Dialog open={!!colorFor} onOpenChange={(o) => !o && setColorFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change color</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 py-2">
            {NOTEBOOK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => doChangeColor(c)}
                aria-label={`Color ${c}`}
                className="h-10 w-10 rounded-full flex items-center justify-center transition-transform active:scale-95"
                style={{
                  backgroundColor: c,
                  boxShadow: colorFor?.color === c ? `0 0 0 3px ${c}55` : 'none',
                }}
              >
                {colorFor?.color === c && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteFor?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the notebook. Notes inside won't be deleted but will lose their notebook.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={doDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Notebook button — bottom fixed, matches Home's New note button */}
      <Button
        className="fixed left-4 right-4 z-50 h-12 text-base font-semibold md:hidden"
        style={{ bottom: 'calc(4.25rem + var(--safe-bottom, 0px))' }}
        size="lg"
        onClick={() => setAddOpen(true)}
      >
        <Plus className="h-5 w-5" />
        Add Notebook
      </Button>

      <BottomNavigation />
    </div>
  );
};

export default Notebooks;
