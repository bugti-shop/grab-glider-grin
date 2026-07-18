import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { genId } from '@/utils/genId';
import { useTranslation } from 'react-i18next';
import { NotesCalendarDayWeekMonth } from '@/components/notes/NotesCalendarDayWeekMonth';

import { AppLogo } from '@/components/AppLogo';
import { Plus, StickyNote, FileText, FileEdit, Pen, FileCode, Mic, Image, MoreHorizontal, Search, Image as ImageIcon } from 'lucide-react';

import { isToday as isTodayFn } from 'date-fns';
import { Button } from '@/components/ui/button';
import { NoteEditor } from '@/components/NoteEditor';
import { Note, Folder, NoteType } from '@/types/note';
import { BottomNavigation } from '@/components/BottomNavigation';
import { format, isSameDay } from 'date-fns';
import { NoteCard } from '@/components/NoteCard';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { saveNoteToDBSingle, deleteNoteFromDB, loadNoteFromDB, isNoteContentStub } from '@/utils/noteStorage';
import { useNotes } from '@/contexts/NotesContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CalendarBackgroundSheet } from '@/components/CalendarBackgroundSheet';
import { getSetting, setSetting } from '@/utils/settingsStorage';
import { NotesVirtualGrid } from '@/components/notes/NotesVirtualGrid';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NotesCalendarFab } from '@/components/notes/NotesCalendarFab';
import {
  acquireEditLock,
  releaseEditLock,
  checkRevision,
  recordRevision,
  type EditLockToken,
} from '@/utils/noteEditLock';

type CalendarLayout = 'month' | 'weekStrip' | 'dashboard' | 'yearHeatmap' | 'darkHero' | 'dayWeekMonth' | 'cardGrid' | 'editorial' | 'timeline';

const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const stripMetadataFlags = (note: Note): Note => {
  const fullNote = { ...note } as Note & Record<string, unknown>;
  delete fullNote.__contentStub;
  delete fullNote.__contentPreview;
  delete fullNote.__contentLength;
  return fullNote as Note;
};


const CalendarPanelFallback = () => (
  <div className="mx-4 my-4 rounded-lg border border-border bg-card p-4 text-center">
    <p className="text-sm font-medium text-foreground">Calendar view couldn’t render.</p>
    <p className="mt-1 text-xs text-muted-foreground">Your notes are safe. Use the notes tab while this view recovers.</p>
  </div>
);

const NotesListFallback = () => (
  <div className="rounded-lg border border-border bg-card p-4 text-center text-sm text-muted-foreground">
    Notes for this date couldn’t render.
  </div>
);

const NotesCalendar = () => {
  const { t } = useTranslation();
  const { isPro, canCreateWithinSoftLimit, softRequireCreate, softRequireMutate } = useSubscription();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  
  const { notes, setNotes } = useNotes();
  const notesRef = useRef(notes);
  const selectedDateRef = useRef<Date | undefined>(date);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  useEffect(() => {
    selectedDateRef.current = date;
  }, [date]);
  
  // Use ref to track editing note ID to prevent stale reference issues
  const editingNoteIdRef = useRef<string | null>(null);
  const editLockTokenRef = useRef<EditLockToken | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [defaultType, setDefaultType] = useState<NoteType>('regular');
  const [selectedNoteTypes] = useState<NoteType[]>([
    'sticky', 'lined', 'regular', 'code', 'voice'
  ]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [calendarBackground, setCalendarBackground] = useState<string>('none');
  const [isBackgroundSheetOpen, setIsBackgroundSheetOpen] = useState(false);

  // Load folders and background preference
  useEffect(() => {
    const loadSettings = async () => {
      const [savedFolders, savedBackground] = await Promise.all([
        getSetting<Folder[]>('folders', []),
        getSetting<string>('calendarBackground', 'none'),
      ]);
      setFolders(savedFolders);
      setCalendarBackground(savedBackground);
    };
    loadSettings();
  }, []);




  const selectedDateNotes = useMemo(() => {
    if (!date) return [];
    return notes.filter(note =>
      isSameDay(new Date(note.createdAt), date) &&
      selectedNoteTypes.includes(note.type)
    );
  }, [date, notes, selectedNoteTypes]);

  // Keep editingNote in sync with notes array using ID reference, but never
  // replace a fully-loaded open editor with metadata-only calendar data.
  useEffect(() => {
    if (editingNoteIdRef.current && isEditorOpen) {
      const updatedNote = notes.find(n => n.id === editingNoteIdRef.current);
      if (updatedNote) {
        setEditingNote((current) => {
          // While the editor is open, do not replace the note prop on every
          // autosave/context refresh. That reset was causing focus loss,
          // blink-close behavior, and accidental duplicate drafts.
          if (current?.id === updatedNote.id) {
            return current;
          }
          return updatedNote;
        });
      }
    }
  }, [notes, isEditorOpen]);

  const handleSaveNote = useCallback(async (incomingNote: Note): Promise<boolean> => {
    const currentEditingId = editingNoteIdRef.current;
    const currentNotes = notesRef.current;
    const activeDate = selectedDateRef.current || new Date();

    if (currentEditingId) {
      if (!softRequireMutate()) return false;
      const existingNote = currentNotes.find(n => n.id === currentEditingId);

      // Revision guard: if another surface persisted a newer version of this
      // note while we were typing, refuse to overwrite it with our older
      // snapshot. The editor will pick up the newer version on its next
      // autosave tick.
      const guard = checkRevision(
        currentEditingId,
        incomingNote.updatedAt,
        existingNote?.updatedAt,
      );
      if (!guard.ok) {
        console.warn(
          '[NotesCalendar] Skipped stale save for note',
          currentEditingId,
          '- newer revision exists at',
          guard.latest,
        );
        return false;
      }

      const updatedNote: Note = stripMetadataFlags({
        ...(existingNote || incomingNote),
        ...incomingNote,
        id: currentEditingId,
        createdAt: existingNote?.createdAt || incomingNote.createdAt || activeDate,
        updatedAt: new Date(),
      });
      const updatedNotes = currentNotes.some(n => n.id === currentEditingId)
        ? currentNotes.map(n => n.id === currentEditingId ? updatedNote : n)
        : [updatedNote, ...currentNotes.filter(n => n.id !== currentEditingId)];
      notesRef.current = updatedNotes;
      setNotes(updatedNotes);
      await saveNoteToDBSingle(updatedNote);
      recordRevision(updatedNote.id, updatedNote.updatedAt);
    } else {
      if (!isPro && !softRequireCreate('notes', currentNotes.length)) return false;
      const newNote: Note = stripMetadataFlags({
        ...incomingNote,
        // Use the editor's draft id so the editor's own safety persistence
        // overwrites the same row instead of creating a second note.
        id: incomingNote.id || genId(),
        title: incomingNote.title || `Note - ${format(activeDate, 'MMM dd, yyyy')}`,
        createdAt: incomingNote.createdAt || activeDate,
        updatedAt: new Date(),
      });
      const updatedNotes = currentNotes.some(n => n.id === newNote.id)
        ? currentNotes.map(n => n.id === newNote.id ? newNote : n)
        : [...currentNotes, newNote];
      notesRef.current = updatedNotes;
      setNotes(updatedNotes);
      editingNoteIdRef.current = newNote.id;

      // First save for this draft — take the edit lock now that we have a
      // real id, so a second surface opening this note reuses this session.
      if (!editLockTokenRef.current) {
        const { token } = acquireEditLock(newNote.id, 'NotesCalendar');
        editLockTokenRef.current = token;
      }

      await saveNoteToDBSingle(newNote);
      recordRevision(newNote.id, newNote.updatedAt);
    }

    return true;
  }, [setNotes, isPro, softRequireCreate, softRequireMutate]);

  const openWithLock = useCallback((note: Note) => {
    // Release any previous session first.
    if (editingNoteIdRef.current && editLockTokenRef.current) {
      releaseEditLock(editingNoteIdRef.current, editLockTokenRef.current);
      editLockTokenRef.current = null;
    }
    editingNoteIdRef.current = note.id;
    const { token, alreadyHeld } = acquireEditLock(note.id, 'NotesCalendar');
    editLockTokenRef.current = token;
    if (alreadyHeld) {
      // Another surface already has this note open in this tab. Reuse its id
      // (which we do — same note.id) so we don't spawn a duplicate row on
      // the next autosave.
      console.info('[NotesCalendar] Reusing existing edit session for', note.id);
    }
    setEditingNote(note);
    setIsEditorOpen(true);
  }, []);

  const handleEditNote = useCallback((note: Note) => {
    if (isNoteContentStub(note)) {
      loadNoteFromDB(note.id).then((fullNote) => {
        if (editingNoteIdRef.current && editingNoteIdRef.current !== note.id) return;
        openWithLock(fullNote || note);
      }).catch(() => {
        openWithLock(note);
      });
      return;
    }
    openWithLock(note);
  }, [openWithLock]);

  const handleCreateNote = useCallback((type: NoteType) => {
    if (!canCreateWithinSoftLimit('notes', notes.length)) {
      softRequireCreate('notes', notes.length);
      return;
    }
    setDefaultType(type);
    if (editingNoteIdRef.current && editLockTokenRef.current) {
      releaseEditLock(editingNoteIdRef.current, editLockTokenRef.current);
    }
    editingNoteIdRef.current = null;
    editLockTokenRef.current = null;
    setEditingNote(null);
    setIsEditorOpen(true);
  }, [canCreateWithinSoftLimit, notes.length, softRequireCreate]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    const updatedNotes = notes.filter(n => n.id !== noteId);
    setNotes(updatedNotes);
    await deleteNoteFromDB(noteId);
    window.dispatchEvent(new Event('notesUpdated'));
  }, [notes, setNotes]);

  const handleCloseEditor = useCallback(() => {
    setIsEditorOpen(false);
    if (editingNoteIdRef.current && editLockTokenRef.current) {
      releaseEditLock(editingNoteIdRef.current, editLockTokenRef.current);
    }
    editingNoteIdRef.current = null;
    editLockTokenRef.current = null;
    setEditingNote(null);
  }, []);

  // Release the lock if this page unmounts with the editor still open.
  useEffect(() => {
    return () => {
      if (editingNoteIdRef.current && editLockTokenRef.current) {
        releaseEditLock(editingNoteIdRef.current, editLockTokenRef.current);
        editingNoteIdRef.current = null;
        editLockTokenRef.current = null;
      }
    };
  }, []);


  const handleBackgroundChange = useCallback((background: string) => {
    setCalendarBackground(background);
  }, []);

  // Get all note dates for calendar indicators
  const noteDates = useMemo(() => {
    const unique = new Map<string, Date>();
    for (const note of notes) {
      const created = new Date(note.createdAt);
      unique.set(dateKey(created), created);
    }
    return Array.from(unique.values());
  }, [notes]);

  return (
    <div className="min-h-screen min-h-screen-dynamic bg-background pb-14 flex flex-col">
      <div style={{ paddingTop: 'var(--safe-top, 0px)', paddingLeft: 'var(--safe-left, 0px)', paddingRight: 'var(--safe-right, 0px)' }} className="flex-1 flex flex-col min-h-0">
        {/* Header with App Logo + layout switcher */}
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <AppLogo />
            <h1 className="text-lg font-bold text-foreground truncate">{t('nav.calendar', 'Calendar')}</h1>
          </div>
        </div>

        {/* Scrollable area */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ErrorBoundary fallback={<CalendarPanelFallback />}>
            <NotesCalendarDayWeekMonth
              selectedDate={date || new Date()}
              onDateSelect={setDate}
              notes={notes}
              onEditNote={handleEditNote}
              onDeleteNote={handleDeleteNote}
            />
          </ErrorBoundary>
        </div>


      </div>

      {/* Floating Add Note button (dedicated Notes FAB) */}
      <NotesCalendarFab onClick={() => handleCreateNote('regular')} />



      <NoteEditor
        note={editingNote}
        isOpen={isEditorOpen}
        onClose={handleCloseEditor}
        onSave={handleSaveNote}
        defaultType={defaultType}
        returnTo="/calendar"
      />

      {/* Background Settings Sheet */}
      <CalendarBackgroundSheet
        isOpen={isBackgroundSheetOpen}
        onClose={() => setIsBackgroundSheetOpen(false)}
        currentBackground={calendarBackground}
        onBackgroundChange={handleBackgroundChange}
      />

      <BottomNavigation />
    </div>
  );
};

export default NotesCalendar;
