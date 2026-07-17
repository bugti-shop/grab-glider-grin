import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { genId } from '@/utils/genId';
import { useTranslation } from 'react-i18next';
import { NotesCalendarPremium } from '@/components/notes/NotesCalendarPremium';

import { AppLogo } from '@/components/AppLogo';
import { Plus, StickyNote, FileText, FileEdit, Pen, FileCode, Mic, Image, MoreHorizontal, Search, Image as ImageIcon } from 'lucide-react';
import { isToday as isTodayFn } from 'date-fns';
import { Button } from '@/components/ui/button';
import { NoteEditor } from '@/components/NoteEditor';
import { Note, Folder, NoteType } from '@/types/note';
import { BottomNavigation } from '@/components/BottomNavigation';
import { format, isSameDay } from 'date-fns';
import { NoteCard } from '@/components/NoteCard';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { saveNoteToDBSingle, deleteNoteFromDB, loadNoteFromDB, isNoteContentStub } from '@/utils/noteStorage';
import { useNotes } from '@/contexts/NotesContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CalendarBackgroundSheet } from '@/components/CalendarBackgroundSheet';
import { getSetting } from '@/utils/settingsStorage';
import { NotesVirtualGrid } from '@/components/notes/NotesVirtualGrid';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

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
  
  // Use ref to track editing note ID to prevent stale reference issues
  const editingNoteIdRef = useRef<string | null>(null);
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
        getSetting<string>('calendarBackground', 'none')
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

  // Keep editingNote in sync with notes array using ID reference
  useEffect(() => {
    if (editingNoteIdRef.current && isEditorOpen) {
      const updatedNote = notes.find(n => n.id === editingNoteIdRef.current);
      if (updatedNote) {
        setEditingNote(updatedNote);
      }
    }
  }, [notes, isEditorOpen]);

  const handleSaveNote = useCallback(async (noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<boolean> => {
    const currentEditingId = editingNoteIdRef.current;

    if (currentEditingId) {
      if (!softRequireMutate()) return false;
      const existingNote = notes.find(n => n.id === currentEditingId);
      if (existingNote) {
        const updatedNote: Note = {
          ...existingNote,
          ...noteData,
          createdAt: existingNote.createdAt,
          updatedAt: new Date(),
        };
        const updatedNotes = notes.map(n => n.id === currentEditingId ? updatedNote : n);
        setNotes(updatedNotes);
        await saveNoteToDBSingle(updatedNote);
      }
    } else {
      if (!isPro && !softRequireCreate('notes', notes.length)) return false;
      const newNote: Note = {
        ...noteData,
        id: genId(),
        title: noteData.title || `Note - ${format(date || new Date(), 'MMM dd, yyyy')}`,
        createdAt: date || new Date(),
        updatedAt: date || new Date(),
      };
      const updatedNotes = [...notes, newNote];
      setNotes(updatedNotes);
      await saveNoteToDBSingle(newNote);
    }

    setIsEditorOpen(false);
    editingNoteIdRef.current = null;
    setEditingNote(null);
    window.dispatchEvent(new Event('notesUpdated'));
    return true;
  }, [notes, setNotes, date, isPro, softRequireCreate, softRequireMutate]);

  const handleEditNote = useCallback((note: Note) => {
    // Store the note ID in ref to prevent stale reference
    editingNoteIdRef.current = note.id;
    setEditingNote(note);
    setIsEditorOpen(true);
    if (isNoteContentStub(note)) {
      loadNoteFromDB(note.id).then((fullNote) => {
        if (fullNote) setEditingNote(fullNote);
      }).catch(() => {});
    }
  }, []);

  const handleCreateNote = useCallback((type: NoteType) => {
    if (!canCreateWithinSoftLimit('notes', notes.length)) {
      softRequireCreate('notes', notes.length);
      return;
    }
    setDefaultType(type);
    editingNoteIdRef.current = null;
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
    editingNoteIdRef.current = null;
    setEditingNote(null);
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
        {/* Header with App Logo */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-1 flex-shrink-0">
          <AppLogo />
          <h1 className="text-lg font-bold text-foreground">{t('nav.calendar', 'Calendar')}</h1>
        </div>

        {/* Scrollable area: calendar + notes list scroll together so the full month is revealed */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ErrorBoundary fallback={<CalendarPanelFallback />}>
            <NotesCalendarPremium
              selectedDate={date}
              onDateSelect={setDate}
              highlightedDates={noteDates}
              onBackgroundSettingsClick={() => setIsBackgroundSheetOpen(true)}
              onAddClick={() => handleCreateNote('regular')}
            />
          </ErrorBoundary>

          <div className="mt-2 rounded-t-[28px] bg-card shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.08)] pt-3 pb-6 px-4">
            {/* Drag handle */}
            <div className="mx-auto mb-3 h-[5px] w-10 rounded-full bg-muted-foreground/25" />
            {/* Section header: "Today, Nov 14" + options */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[19px] font-bold text-foreground tracking-tight">
                {date && isTodayFn(date) ? (
                  <>
                    {t('common.today', 'Today')},{' '}
                    <span className="text-[#2563eb]">{format(date, 'MMM d')}</span>
                  </>
                ) : (
                  <span className="text-[#2563eb]">{format(date || new Date(), 'EEEE, MMM d')}</span>
                )}
                {selectedDateNotes.length > 0 && (
                  <span className="ml-2 text-[13px] font-medium text-muted-foreground align-middle">
                    {selectedDateNotes.length}
                  </span>
                )}
              </h2>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={t('common.options', 'Options')}
                    className="h-9 w-9 flex items-center justify-center rounded-full border border-border/60 active:bg-muted transition-colors"
                  >
                    <MoreHorizontal className="h-[18px] w-[18px] text-foreground/80" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-card">
                  <DropdownMenuItem onClick={() => setDate(new Date())}>
                    {t('calendar.goToToday', 'Go to Today')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsBackgroundSheetOpen(true)} className="gap-2">
                    <ImageIcon className="h-4 w-4" />
                    {t('calendar.changeBackground', 'Change Background')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <ErrorBoundary fallback={<NotesListFallback />}>
              {selectedDateNotes.length > 0 ? (
                <div className="space-y-3">
                  <NotesVirtualGrid
                    notes={selectedDateNotes}
                    estimatedRowHeight={190}
                    useWindowing={false}
                    getRowKey={(row) => row.map((n) => `${n.id}:${n.updatedAt instanceof Date ? n.updatedAt.getTime() : new Date(n.updatedAt).getTime()}`).join('|')}
                    renderCard={(note) => (
                      <NoteCard
                        note={note}
                        onEdit={handleEditNote}
                        onDelete={handleDeleteNote}
                      />
                    )}
                  />
                </div>
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {t('notes.noNotesForDate', 'No notes for this date yet.')}
                </div>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Floating Add Note button */}
      <Button
        size="icon"
        onClick={() => handleCreateNote('regular')}
        aria-label={t('notes.addNote', 'Add note')}
        className="fixed right-4 z-40 h-14 w-14 rounded-full shadow-lg bg-black text-white hover:bg-black/90"
        style={{ bottom: 'calc(72px + var(--safe-bottom, 0px))' }}
      >
        <Plus className="h-6 w-6" />
      </Button>


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
