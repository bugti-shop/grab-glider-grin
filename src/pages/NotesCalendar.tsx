import { useState, useEffect, useRef, useCallback } from 'react';
import { genId } from '@/utils/genId';
import { useTranslation } from 'react-i18next';
import { NotesCalendarView } from '@/components/NotesCalendarView';

import { AppLogo } from '@/components/AppLogo';
import { Plus, StickyNote, FileText, FileEdit, Pen, FileCode, Mic, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NoteEditor } from '@/components/NoteEditor';
import { Note, Folder, NoteType } from '@/types/note';
import { BottomNavigation } from '@/components/BottomNavigation';
import { format, isSameDay } from 'date-fns';
import { NoteCard } from '@/components/NoteCard';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { saveNoteToDBSingle, deleteNoteFromDB } from '@/utils/noteStorage';
import { useNotes } from '@/contexts/NotesContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CalendarBackgroundSheet } from '@/components/CalendarBackgroundSheet';
import { getSetting } from '@/utils/settingsStorage';

const NotesCalendar = () => {
  const { t } = useTranslation();
  const { isPro, canCreateWithinSoftLimit, softRequireCreate, softRequireMutate } = useSubscription();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  
  const { notes, setNotes } = useNotes();
  
  const [selectedDateNotes, setSelectedDateNotes] = useState<Note[]>([]);
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

  // Filter notes for selected date
  useEffect(() => {
    if (date) {
      const notesForDate = notes.filter(note =>
        isSameDay(new Date(note.createdAt), date) &&
        selectedNoteTypes.includes(note.type)
      );
      setSelectedDateNotes(notesForDate);
    } else {
      setSelectedDateNotes([]);
    }
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
  const noteDates = notes.map(n => new Date(n.createdAt));

  return (
    <div className="min-h-screen min-h-screen-dynamic bg-background pb-14 flex flex-col">
      <div style={{ paddingTop: 'var(--safe-top, 0px)' }} className="flex-1 flex flex-col overflow-hidden">
        {/* Header with App Logo */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          <AppLogo />
          <h1 className="text-lg font-bold text-foreground">{t('nav.calendar', 'Calendar')}</h1>
        </div>
        {/* Calendar View with Background */}
        <NotesCalendarView
          selectedDate={date}
          onDateSelect={setDate}
          highlightedDates={noteDates}
          showEmptyState={selectedDateNotes.length === 0}
          emptyStateMessage={t('calendar.noNotes', 'No notes for the day.')}
          emptyStateSubMessage={t('calendar.clickToCreate', 'Click "+" to create your notes.')}
          calendarBackground={calendarBackground}
          onBackgroundSettingsClick={() => setIsBackgroundSheetOpen(true)}
        />


        {/* Notes for Selected Date - Scrollable */}
        {selectedDateNotes.length > 0 && (
          <div className="flex-1 flex flex-col min-h-0 px-4">
            <h2 className="text-lg font-semibold text-foreground py-2 flex-shrink-0">
              {format(date || new Date(), 'MMMM dd, yyyy')}
            </h2>
            <ScrollArea className="flex-1 perf-contain-scroll">
              <div className="space-y-3 pb-4">
                {selectedDateNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onEdit={handleEditNote}
                    onDelete={handleDeleteNote}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>


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
