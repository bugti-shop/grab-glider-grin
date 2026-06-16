import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Note } from '@/types/note';
import { loadNotesFromDB, saveNotesToDB, saveNoteToDBSingle, deleteNoteFromDB, migrateNotesToIndexedDB } from '@/utils/noteStorage';
import { getTextPreviewFromHtml } from '@/utils/contentPreview';
import { useSubscription, SOFT_FREE_LIMITS } from '@/contexts/SubscriptionContext';

// Lightweight note metadata for instant navigation
export interface NoteMeta {
  id: string;
  type: Note['type'];
  title: string;
  color?: Note['color'];
  customColor?: string;
  folderId?: string;
  isPinned?: boolean;
  isFavorite?: boolean;
  pinnedOrder?: number;
  isArchived?: boolean;
  archivedAt?: Date;
  isDeleted?: boolean;
  deletedAt?: Date;
  isHidden?: boolean;
  isProtected?: boolean;
  metaDescription?: string;
  reminderEnabled?: boolean;
  reminderTime?: Date;
  createdAt: Date;
  updatedAt: Date;
  contentPreview: string;
  hasFullContent: boolean;
}

const extractNoteMeta = (note: Note): NoteMeta => ({
  id: note.id,
  type: note.type,
  title: note.title,
  color: note.color,
  customColor: note.customColor,
  folderId: note.folderId,
  isPinned: note.isPinned,
  isFavorite: note.isFavorite,
  pinnedOrder: note.pinnedOrder,
  isArchived: note.isArchived,
  archivedAt: note.archivedAt,
  isDeleted: note.isDeleted,
  deletedAt: note.deletedAt,
  isHidden: note.isHidden,
  isProtected: note.isProtected,
  metaDescription: note.metaDescription,
  reminderEnabled: note.reminderEnabled,
  reminderTime: note.reminderTime,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
  contentPreview: getTextPreviewFromHtml(note.content, 200),
  hasFullContent: true,
});

// ── Split contexts ──

/** Data context: notes array, metadata, loading state. Changes when notes data changes. */
interface NotesDataContextType {
  notes: Note[];
  notesMeta: NoteMeta[];
  notesMap: Map<string, Note>;
  counts: { active: number; archived: number; trash: number };
  isLoading: boolean;
  isInitialized: boolean;
  getNoteById: (noteId: string) => Note | undefined;
}

/** Dispatch context: actions only. Stable references — never causes re-renders. */
interface NotesDispatchContextType {
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  saveNote: (note: Note) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
  updateNote: (noteId: string, updates: Partial<Note>) => Promise<void>;
  bulkUpdateNotes: (noteIds: string[], updates: Partial<Note>) => Promise<void>;
  refreshNotes: () => Promise<void>;
}

/** Combined type for backward compatibility */
interface NotesContextType extends NotesDataContextType, NotesDispatchContextType {}

const NotesDataContext = createContext<NotesDataContextType | undefined>(undefined);
const NotesDispatchContext = createContext<NotesDispatchContextType | undefined>(undefined);

export const NotesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const driveSyncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>('');

  // Memoized metadata — uses its own ref so it doesn't interfere with save-change detection
  const prevMetaNotesRef = useRef<Note[]>([]);
  const cachedMetaRef = useRef<NoteMeta[]>([]);

  const notesMeta = useMemo(() => {
    if (notes === prevMetaNotesRef.current && cachedMetaRef.current.length > 0) {
      return cachedMetaRef.current;
    }
    prevMetaNotesRef.current = notes;
    const result = notes.map(extractNoteMeta);
    cachedMetaRef.current = result;
    return result;
  }, [notes]);

  // O(1) lookup map — avoids array.find on 100k+ notes
  const notesMap = useMemo(() => new Map(notes.map(n => [n.id, n])), [notes]);

  // Pre-computed counts — avoids 3x full-array scans on every render
  const counts = useMemo(() => {
    let active = 0, archived = 0, trash = 0;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (n.isDeleted) trash++;
      else if (n.isArchived) archived++;
      else active++;
    }
    return { active, archived, trash };
  }, [notes]);

  // Separate ref for debounced-save change detection (not shared with useMemo)
  const prevSaveNotesRef = useRef<Note[]>([]);
  // Flag to suppress re-upload when notes came from a cloud restore
  const isFromSyncRef = useRef(false);

  // Load notes — defer if user is on Todo dashboard for faster startup
  useEffect(() => {
    let isMounted = true;

    const initializeNotes = async () => {
      try {
        console.log('[NotesContext] Initializing notes...');
        const startTime = performance.now();
        await migrateNotesToIndexedDB();
        const loadedNotes = await loadNotesFromDB();

        if (isMounted) {
          setNotes(loadedNotes);
          setIsInitialized(true);
          setIsLoading(false);
          const duration = (performance.now() - startTime).toFixed(0);
          console.log(`[NotesContext] Loaded ${loadedNotes.length} notes in ${duration}ms`);
        }
      } catch (error) {
        console.error('[NotesContext] Error loading notes:', error);
        if (isMounted) {
          setIsLoading(false);
          setIsInitialized(true);
        }
      }
    };

    // If user lands on Todo, defer notes loading to avoid blocking startup
    const isTodoRoute = window.location.pathname === '/' || window.location.pathname.startsWith('/todo');
    if (isTodoRoute) {
      const defer = 'requestIdleCallback' in window
        ? (cb: () => void) => requestIdleCallback(cb, { timeout: 3000 })
        : (cb: () => void) => setTimeout(cb, 500);
      defer(initializeNotes);
    } else {
      initializeNotes();
    }

    const handleNotesUpdated = () => {
      loadNotesFromDB().then(setNotes).catch(console.error);
    };
    const handleNotesRestored = () => {
      // Mark that this state change came from sync — don't re-upload
      isFromSyncRef.current = true;
      loadNotesFromDB().then(setNotes).catch(console.error);
    };

    window.addEventListener('notesUpdated', handleNotesUpdated);
    window.addEventListener('notesRestored', handleNotesRestored);
    

    return () => {
      isMounted = false;
      window.removeEventListener('notesUpdated', handleNotesUpdated);
      window.removeEventListener('notesRestored', handleNotesRestored);
      
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (driveSyncTimerRef.current) clearTimeout(driveSyncTimerRef.current);
    };
  }, []);

  // Debounced save
  const notesLengthRef = useRef(0);
  useEffect(() => {
    if (!isInitialized || notes.length === 0) return;
    const changed = notes !== prevSaveNotesRef.current || notes.length !== notesLengthRef.current;
    prevSaveNotesRef.current = notes;
    notesLengthRef.current = notes.length;
    if (!changed) return;

    // If this update came from a sync restore, save locally but don't dispatch
    // notesUpdated (which would trigger re-upload to Firebase → infinite loop)
    if (isFromSyncRef.current) {
      isFromSyncRef.current = false;
      return;
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveNotesToDB(notes);
        lastSavedRef.current = String(notes.length);
        // Auto-upload to Google Drive (short debounce for faster backup without flooding)
        driveSyncTimerRef.current && clearTimeout(driveSyncTimerRef.current);
        driveSyncTimerRef.current = setTimeout(async () => {
          try {
            const { syncNotesToDrive } = await import('@/utils/googleDriveSync');
            await syncNotesToDrive();
          } catch (e) {
            console.warn('[NotesContext] Auto-upload to Drive failed:', e);
          }
        }, 1000);
      } catch (error) {
        console.error('[NotesContext] Error saving notes:', error);
      }
    }, 500);
  }, [notes, isInitialized]);

  // ── Dispatch actions (stable — never change) ──

  // Soft paywall hooks
  const { isPro, isNewFreeUser, softRequireCreate, softRequireMutate } = useSubscription();
  // Stable refs so callbacks below don't need to depend on these (avoids re-creating on every render)
  const isProRef = useRef(isPro);
  const isNewFreeUserRef = useRef(isNewFreeUser);
  const softRequireCreateRef = useRef(softRequireCreate);
  const softRequireMutateRef = useRef(softRequireMutate);
  isProRef.current = isPro;
  isNewFreeUserRef.current = isNewFreeUser;
  softRequireCreateRef.current = softRequireCreate;
  softRequireMutateRef.current = softRequireMutate;
  const notesCountRef = useRef(0);
  notesCountRef.current = notes.length;

  const saveNote = useCallback(async (note: Note) => {
    // Gate: creating a new note vs editing existing
    const isExisting = notesMap.has(note.id);
    if (!isProRef.current && isNewFreeUserRef.current) {
      if (!isExisting) {
        // Create — check soft create limit (count ALL notes including archived/trashed)
        if (notesCountRef.current >= SOFT_FREE_LIMITS.notes) {
          softRequireCreateRef.current('notes', notesCountRef.current);
          return;
        }
      } else {
        // Edit — block + open paywall
        if (!softRequireMutateRef.current()) return;
      }
    }
    setNotes(prev => {
      const existingIdx = prev.findIndex(n => n.id === note.id);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = note;
        return updated;
      }
      return [note, ...prev];
    });

    try {
      await saveNoteToDBSingle(note);
    } catch (error) {
      console.error('[NotesContext] Error saving single note:', error);
    }
  }, [notesMap]);

  const deleteNote = useCallback(async (noteId: string) => {
    if (!isProRef.current && isNewFreeUserRef.current) {
      if (!softRequireMutateRef.current()) return;
    }
    setNotes(prev => prev.filter(n => n.id !== noteId));
    try {
      await deleteNoteFromDB(noteId);
    } catch (error) {
      console.error('[NotesContext] Error deleting note:', error);
    }
  }, []);

  const updateNote = useCallback(async (noteId: string, updates: Partial<Note>) => {
    if (!isProRef.current && isNewFreeUserRef.current) {
      if (!softRequireMutateRef.current()) return;
    }
    let updatedNote: Note | null = null;
    setNotes(prev =>
      prev.map(n => {
        if (n.id !== noteId) return n;
        updatedNote = {
          ...n,
          ...updates,
          updatedAt: new Date(),
        };
        return updatedNote;
      })
    );

    try {
      if (updatedNote) await saveNoteToDBSingle(updatedNote);
    } catch (error) {
      console.error('[NotesContext] Error persisting note update:', error);
    }
  }, []);

  const bulkUpdateNotes = useCallback(async (noteIds: string[], updates: Partial<Note>) => {
    const updatedNotes: Note[] = [];
    setNotes(prev =>
      prev.map(n => {
        if (!noteIds.includes(n.id)) return n;
        const next: Note = {
          ...n,
          ...updates,
          updatedAt: new Date(),
        };
        updatedNotes.push(next);
        return next;
      })
    );

    try {
      await Promise.all(updatedNotes.map(n => saveNoteToDBSingle(n)));
    } catch (error) {
      console.error('[NotesContext] Error persisting bulk note update:', error);
    }
  }, []);

  const refreshNotes = useCallback(async () => {
    try {
      const loadedNotes = await loadNotesFromDB();
      setNotes(loadedNotes);
    } catch (error) {
      console.error('[NotesContext] Error refreshing notes:', error);
    }
  }, []);

  const getNoteById = useCallback((noteId: string): Note | undefined => {
    return notesMap.get(noteId);
  }, [notesMap]);

  // ── Memoized context values ──

  const dataValue = useMemo<NotesDataContextType>(() => ({
    notes,
    notesMeta,
    notesMap,
    counts,
    isLoading,
    isInitialized,
    getNoteById,
  }), [notes, notesMeta, notesMap, counts, isLoading, isInitialized, getNoteById]);

  const dispatchValue = useMemo<NotesDispatchContextType>(() => ({
    setNotes,
    saveNote,
    deleteNote,
    updateNote,
    bulkUpdateNotes,
    refreshNotes,
  }), [saveNote, deleteNote, updateNote, bulkUpdateNotes, refreshNotes]);

  return (
    <NotesDispatchContext.Provider value={dispatchValue}>
      <NotesDataContext.Provider value={dataValue}>
        {children}
      </NotesDataContext.Provider>
    </NotesDispatchContext.Provider>
  );
};

// ── Hooks ──

/** Use only note data (notes, meta, loading). Re-renders when data changes. */
export const useNotesData = (): NotesDataContextType => {
  const context = useContext(NotesDataContext);
  if (!context) throw new Error('useNotesData must be used within a NotesProvider');
  return context;
};

/** Use only dispatch actions. Never re-renders — stable references. */
export const useNotesDispatch = (): NotesDispatchContextType => {
  const context = useContext(NotesDispatchContext);
  if (!context) throw new Error('useNotesDispatch must be used within a NotesProvider');
  return context;
};

/** Combined hook — backward compatible. Components using this re-render on data changes. */
export const useNotes = (): NotesContextType => {
  const data = useNotesData();
  const dispatch = useNotesDispatch();
  return { ...data, ...dispatch };
};

/** Optional hook that returns null if outside provider */
export const useNotesOptional = (): NotesContextType | null => {
  const data = useContext(NotesDataContext);
  const dispatch = useContext(NotesDispatchContext);
  if (!data || !dispatch) return null;
  return { ...data, ...dispatch };
};
