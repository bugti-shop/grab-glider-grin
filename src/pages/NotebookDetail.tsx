import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Book, BookOpen, StickyNote, FileText, FileEdit, FileCode, PenTool, Type, Crown } from 'lucide-react';
import { Folder as FolderType, Note, NoteType } from '@/types/note';
import { getSetting } from '@/utils/settingsStorage';
import { useNotes } from '@/contexts/NotesContext';
import { BottomNavigation } from '@/components/BottomNavigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { NotesVirtualGrid } from '@/components/notes/NotesVirtualGrid';
import { NoteCard } from '@/components/NoteCard';
import { NoteEditor } from '@/components/NoteEditor';
import {
  saveNoteToDBSingle,
  isNoteContentStub,
  loadNoteFromDB,
  makeMetadataNote,
} from '@/utils/noteStorage';
import { genId } from '@/utils/genId';
import { logActivity } from '@/utils/activityLogger';
import { useNoteTypeVisibility } from '@/hooks/useNoteTypeVisibility';
import { triggerHaptic } from '@/utils/haptics';


const NotebookDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { notes, setNotes } = useNotes();
  const [folder, setFolder] = useState<FolderType | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [defaultType, setDefaultType] = useState<NoteType>('regular');
  const [noteTypeSelectorOpen, setNoteTypeSelectorOpen] = useState(false);
  const { visibleTypes, isTypeVisible } = useNoteTypeVisibility();

  useEffect(() => {
    const load = async () => {
      const saved = (await getSetting<FolderType[] | null>('folders', null)) || [];
      const f = saved.find((x) => x.id === id) || null;
      setFolder(f);
    };
    load();
    const onUpdated = () => load();
    window.addEventListener('foldersUpdated', onUpdated);
    return () => window.removeEventListener('foldersUpdated', onUpdated);
  }, [id]);

  const folderNotes = useMemo(() => {
    const filtered = notes.filter(
      (n) => !n.isDeleted && !n.isArchived && n.folderId === id,
    );
    return filtered.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      const aT = a.updatedAt instanceof Date ? a.updatedAt.getTime() : new Date(a.updatedAt).getTime();
      const bT = b.updatedAt instanceof Date ? b.updatedAt.getTime() : new Date(b.updatedAt).getTime();
      return bT - aT;
    });
  }, [notes, id]);

  const handleEditNote = async (note: Note) => {
    setSelectedNote(note);
    setIsEditorOpen(true);
    if (isNoteContentStub(note)) {
      loadNoteFromDB(note.id)
        .then((full) => {
          if (full) setSelectedNote(full);
        })
        .catch(() => {});
    }
  };

  const handleSaveNote = (note: Note): boolean => {
    const fullNote: Note = {
      ...note,
      folderId: note.folderId || id,
      updatedAt: new Date(),
    };
    saveNoteToDBSingle(fullNote);
    const meta = makeMetadataNote(fullNote);
    setNotes((prev) => {
      const existing = prev.find((n) => n.id === note.id);
      if (existing) return prev.map((n) => (n.id === note.id ? meta : n));
      return [meta, ...prev];
    });
    return true;
  };

  const mutate = (noteId: string, updates: Partial<Note>) => {
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id !== noteId) return n;
        const updated = { ...n, ...updates, updatedAt: new Date() } as Note;
        saveNoteToDBSingle(updated);
        return updated;
      }),
    );
  };

  const handleDeleteNote = (nid: string) => {
    mutate(nid, { isDeleted: true, deletedAt: new Date() });
    logActivity('note_delete', 'Note moved to trash', { entityId: nid, entityType: 'note' });
  };
  const handleArchiveNote = (nid: string) =>
    mutate(nid, { isArchived: true, archivedAt: new Date() });
  const handleTogglePin = (nid: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const n = notes.find((x) => x.id === nid);
    if (!n) return;
    mutate(nid, { isPinned: !n.isPinned, pinnedOrder: !n.isPinned ? Date.now() : undefined });
  };
  const handleToggleFavorite = (nid: string) => {
    const n = notes.find((x) => x.id === nid);
    if (!n) return;
    mutate(nid, { isFavorite: !n.isFavorite });
  };

  const handleCreateNote = () => {
    setSelectedNote(null);
    setIsEditorOpen(true);
  };

  const accent = folder?.color || '#3b82f6';

  return (
    <div className="min-h-screen bg-background pb-24">
      <header
        className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b"
        style={{ paddingTop: 'var(--safe-top, 0px)' }}
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => navigate('/notebooks')}
            aria-label="Back to notebooks"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ backgroundColor: accent + '1a', color: accent }}
          >
            {folder?.isDefault ? <BookOpen className="h-5 w-5" /> : <Book className="h-5 w-5" />}
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">{folder?.name || 'Notebook'}</h1>
            <p className="text-xs text-muted-foreground">
              {folderNotes.length} {folderNotes.length === 1 ? 'note' : 'notes'}
            </p>
          </div>
        </div>
      </header>

      <main className="px-4 pt-3">
        {folderNotes.length === 0 ? (
          <div className="text-center py-20">
            <h2 className="text-xl font-semibold mb-2">No notes yet</h2>
            <p className="text-muted-foreground text-sm">Tap the + button to create your first note in this notebook.</p>
          </div>
        ) : (
          <NotesVirtualGrid
            notes={folderNotes}
            getRowKey={(row) =>
              row
                .map(
                  (n) =>
                    `${n.id}:${
                      n.updatedAt instanceof Date
                        ? n.updatedAt.getTime()
                        : new Date(n.updatedAt).getTime()
                    }`,
                )
                .join('|')
            }
            renderCard={(note) => (
              <NoteCard
                note={note}
                onEdit={handleEditNote}
                onDelete={handleDeleteNote}
                onArchive={handleArchiveNote}
                onTogglePin={handleTogglePin}
                onToggleFavorite={handleToggleFavorite}
              />
            )}
          />
        )}
      </main>

      <NoteEditor
        note={selectedNote}
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setSelectedNote(null);
        }}
        onSave={handleSaveNote}
        defaultType={'regular' as NoteType}
        defaultFolderId={id}
        returnTo={`/notebook/${id}`}
      />

      {!isEditorOpen && (
        <Button
          className="fixed left-4 right-4 z-50 h-12 text-base font-semibold md:hidden"
          style={{ bottom: 'calc(4.25rem + var(--safe-bottom, 0px))' }}
          size="lg"
          onClick={handleCreateNote}
        >
          <Plus className="h-5 w-5" />
          New note
        </Button>
      )}

      <BottomNavigation />
    </div>
  );
};

export default NotebookDetail;
