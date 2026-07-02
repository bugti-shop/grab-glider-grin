import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Book, BookOpen, ChevronRight, Plus, Search, ArrowLeft, Check } from 'lucide-react';
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


      {/* Notebook grid — colorful covers */}
      <div className="px-4 pt-5">
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-6">
          {filtered.map((f) => {
            const count = counts.get(f.id) ?? 0;
            const color = f.color || '#3b82f6';
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => openNotebook(f.id)}
                className="group flex flex-col items-center gap-2 text-center active:scale-95 transition-transform"
              >
                {/* Notebook cover */}
                <div
                  className="relative w-full aspect-[3/4] rounded-r-lg rounded-l-sm overflow-hidden shadow-md"
                  style={{
                    backgroundColor: color,
                    backgroundImage: `linear-gradient(135deg, ${color} 0%, ${color}dd 60%, ${color}aa 100%)`,
                  }}
                >
                  {/* Spine (left binding) */}
                  <div
                    className="absolute inset-y-0 left-0 w-2"
                    style={{ backgroundColor: 'rgba(0,0,0,0.22)' }}
                  />
                  {/* Rings on spine */}
                  <div className="absolute inset-y-0 left-0 w-2 flex flex-col justify-around py-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <span
                        key={i}
                        className="mx-auto h-1 w-1 rounded-full bg-white/70"
                      />
                    ))}
                  </div>
                  {/* Highlight */}
                  <div className="absolute inset-y-2 left-3 w-px bg-white/25" />
                  {/* Count badge */}
                  <span className="absolute top-2 right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-white/25 backdrop-blur-sm text-[11px] font-semibold text-white flex items-center justify-center tabular-nums">
                    {count}
                  </span>
                  {/* Corner icon */}
                  <div className="absolute bottom-2 right-2 text-white/80">
                    {f.isDefault ? (
                      <BookOpen className="h-4 w-4" />
                    ) : (
                      <Book className="h-4 w-4" />
                    )}
                  </div>
                </div>
                {/* Name */}
                <span className="block w-full text-xs font-medium text-foreground truncate px-0.5">
                  {f.name}
                </span>
              </button>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No notebooks found
          </div>
        )}
      </div>


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
