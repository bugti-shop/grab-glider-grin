import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Book, BookOpen, ChevronRight, Plus, Search, ArrowLeft } from 'lucide-react';
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
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const Notebooks = () => {
  const navigate = useNavigate();
  const { notesMeta } = useNotes();
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');

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

  // Count active notes per folder
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
    navigate(`/notesdashboard?folder=${encodeURIComponent(id)}`);
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
      color: '#3b82f6',
      icon: 'Book',
      isDefault: false,
      createdAt: new Date(),
    };
    const updated = [...folders, folder];
    setFolders(updated);
    await setSetting('folders', updated);
    window.dispatchEvent(new Event('foldersUpdated'));
    setNewName('');
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

      {/* Folder list — Evernote style rows */}
      <ul className="divide-y divide-border">
        {filtered.map((f) => {
          const count = counts.get(f.id) ?? 0;
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => openNotebook(f.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-4 text-left',
                  'active:bg-muted/60 transition-colors',
                )}
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ backgroundColor: (f.color || '#3b82f6') + '1a', color: f.color || '#3b82f6' }}
                >
                  {f.isDefault ? <BookOpen className="h-5 w-5" /> : <Book className="h-5 w-5" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-base font-medium truncate">{f.name}</span>
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">{count}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="py-16 text-center text-sm text-muted-foreground">
            No notebooks found
          </li>
        )}
      </ul>

      {/* Floating blue "Add Notebook" — Duolingo-style */}
      <button
        type="button"
        onClick={() => setAddOpen(true)}
        aria-label="Add notebook"
        className={cn(
          'fixed z-40 flex h-14 w-14 items-center justify-center rounded-2xl',
          'bg-[#3b82f6] text-white shadow-[0_6px_0_0_#2563eb,0_10px_20px_rgba(59,130,246,0.35)]',
          'active:translate-y-[3px] active:shadow-[0_3px_0_0_#2563eb,0_6px_12px_rgba(59,130,246,0.35)]',
          'transition-all duration-100',
        )}
        style={{
          right: '20px',
          bottom: 'calc(var(--safe-bottom, 0px) + 88px)',
        }}
      >
        <Plus className="h-7 w-7" strokeWidth={3} />
      </button>

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
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="bg-[#3b82f6] hover:bg-[#2563eb]"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomNavigation />
    </div>
  );
};

export default Notebooks;
