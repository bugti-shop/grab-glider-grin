import { Note } from '@/types/note';
import { getSetting, setSetting } from '@/utils/settingsStorage';
import { getTextPreviewFromHtml } from '@/utils/contentPreview';

const DB_NAME = 'nota-notes-db';
const DB_VERSION = 2;
const STORE_NAME = 'notes';
const META_STORE_NAME = 'notes_meta';
const BATCH_SIZE = 2000;

let db: IDBDatabase | null = null;

// In-memory cache for instant reads (mirrors task storage pattern)
let notesCache: Note[] | null = null;
let notesCacheIsMetadata = false;
let notesCacheVersion = 0;
let lastNoteSaveTime = 0;
const MIN_SAVE_INTERVAL = 50;
let pendingNotesFlushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingNotesFlush: Note[] | null = null;
let pendingNotesSkipSyncEvent = false;

const toValidDate = (value: unknown, fallback = new Date()): Date => {
  const date = value instanceof Date ? value : new Date(value as any);
  return Number.isFinite(date.getTime()) ? date : fallback;
};

const toOptionalDate = (value: unknown): Date | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const date = value instanceof Date ? value : new Date(value as any);
  return Number.isFinite(date.getTime()) ? date : undefined;
};

const toOptionalIso = (value: unknown): string | undefined => {
  const date = toOptionalDate(value);
  return date?.toISOString();
};

const hydrateVoiceRecordings = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.map((recording: any) => ({
    ...recording,
    timestamp: toValidDate(recording?.timestamp),
  }));
};

const hydrateNote = (note: any): Note => ({
  ...note,
  createdAt: toValidDate(note?.createdAt),
  updatedAt: toValidDate(note?.updatedAt),
  archivedAt: toOptionalDate(note?.archivedAt),
  deletedAt: toOptionalDate(note?.deletedAt),
  reminderTime: toOptionalDate(note?.reminderTime),
  voiceRecordings: hydrateVoiceRecordings(note?.voiceRecordings),
});

const CONTENT_STUB_FLAG = '__contentStub';
const CONTENT_PREVIEW_KEY = '__contentPreview';
const CONTENT_LENGTH_KEY = '__contentLength';

export const isNoteContentStub = (note: Note | null | undefined): boolean => {
  return Boolean(note && (note as any)[CONTENT_STUB_FLAG]);
};

export const makeMetadataNote = (note: any): Note => {
  const hydrated = hydrateNote(note);
  const fullContent = typeof hydrated.content === 'string' ? hydrated.content : '';
  const preview = (note as any)[CONTENT_PREVIEW_KEY] || getTextPreviewFromHtml(fullContent, 240);
  return {
    ...hydrated,
    // Keep the list light: cards/search use this preview, editor loads full text by id.
    content: preview,
    [CONTENT_STUB_FLAG]: true,
    [CONTENT_PREVIEW_KEY]: preview,
    [CONTENT_LENGTH_KEY]: fullContent.length,
  } as Note;
};

const serializeNote = (note: Note) => ({
  ...note,
  createdAt: toValidDate(note.createdAt).toISOString(),
  updatedAt: toValidDate(note.updatedAt).toISOString(),
  archivedAt: toOptionalIso(note.archivedAt),
  deletedAt: toOptionalIso(note.deletedAt),
  reminderTime: toOptionalIso(note.reminderTime),
  voiceRecordings: hydrateVoiceRecordings(note.voiceRecordings).map(r => ({
    ...r,
    timestamp: toValidDate(r.timestamp).toISOString(),
  })),
});

const serializeMetadataNote = (note: Note) => serializeNote(makeMetadataNote(note));

const isDbHealthy = (database: IDBDatabase): boolean => {
  try {
    if (!database.objectStoreNames.contains(STORE_NAME)) return false;
    if (!database.objectStoreNames.contains(META_STORE_NAME)) return false;
    const tx = database.transaction([STORE_NAME], 'readonly');
    tx.abort();
    return true;
  } catch {
    return false;
  }
};

const resetDb = () => {
  if (db) {
    try { db.close(); } catch {}
  }
  db = null;
};

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db && isDbHealthy(db)) {
      resolve(db);
      return;
    }
    resetDb();

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    const timeout = setTimeout(() => {
      reject(new Error('Notes IndexedDB open timed out'));
    }, 5000);

    request.onerror = () => {
      clearTimeout(timeout);
      console.error('Failed to open notes database:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      clearTimeout(timeout);
      db = request.result;
      db.onclose = () => { db = null; };
      db.onversionchange = () => { resetDb(); };
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('folderId', 'folderId', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
      if (!database.objectStoreNames.contains(META_STORE_NAME)) {
        const metaStore = database.createObjectStore(META_STORE_NAME, { keyPath: 'id' });
        metaStore.createIndex('createdAt', 'createdAt', { unique: false });
        metaStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        metaStore.createIndex('folderId', 'folderId', { unique: false });
        metaStore.createIndex('type', 'type', { unique: false });
      }
    };
  });
};

const withRetry = async <T>(operation: (database: IDBDatabase) => Promise<T>): Promise<T> => {
  try {
    const database = await openDB();
    return await operation(database);
  } catch (error) {
    console.warn('IndexedDB operation failed, retrying with fresh connection...', error);
    resetDb();
    const database = await openDB();
    return await operation(database);
  }
};

export const loadNotesFromDB = async (): Promise<Note[]> => {
  // Return cached data instantly if available
  if (notesCache !== null && !notesCacheIsMetadata) return notesCache;

  try {
    return await withRetry((database) => new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const notes = request.result.map(hydrateNote);
        // Strip any legacy "(Copy)" suffix that older versions persisted into
        // note titles. Done in the background — never blocks the load.
        import('@/utils/duplicateName').then(({ sanitizeCopySuffixes }) => {
          const { items: cleaned, changed } = sanitizeCopySuffixes(notes as any);
          if (changed) {
            notesCache = cleaned as Note[];
            setTimeout(() => { void saveNotesToDB(cleaned as Note[], true); }, 0);
          }
        }).catch(() => {});
        notesCache = notes;
        notesCacheIsMetadata = false;
        resolve(notes);
      };

      request.onerror = () => {
        console.error('Failed to load notes:', request.error);
        reject(request.error);
      };
    }));
  } catch (error) {
    console.error('Error loading notes from IndexedDB:', error);
    return [];
  }
};

export const loadNotesMetadataFromDB = async (): Promise<Note[]> => {
  if (notesCache !== null && notesCacheIsMetadata) return notesCache;

  try {
    return await withRetry((database) => new Promise((resolve, reject) => {
      const transaction = database.transaction([META_STORE_NAME, STORE_NAME], 'readonly');
      const metaStore = transaction.objectStore(META_STORE_NAME);
      const request = metaStore.getAll();
      const notes: Note[] = [];

      request.onsuccess = () => {
        if (request.result.length > 0) {
          const metaNotes = request.result.map(hydrateNote);
          notesCache = metaNotes;
          notesCacheIsMetadata = true;
          resolve(metaNotes);
          return;
        }

        // First open after upgrading older installs: derive small card records
        // once from the full-content store, then persist them for future opens.
        const fullStore = transaction.objectStore(STORE_NAME);
        const cursorRequest = fullStore.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) {
            notesCache = notes;
            notesCacheIsMetadata = true;
            setTimeout(() => {
              void withRetry((db2) => new Promise<void>((res) => {
                const tx = db2.transaction([META_STORE_NAME], 'readwrite');
                const store = tx.objectStore(META_STORE_NAME);
                notes.forEach((n) => {
                  try { store.put(serializeMetadataNote(n)); } catch {}
                });
                tx.oncomplete = () => res();
                tx.onerror = () => res();
              }));
            }, 0);
            resolve(notes);
            return;
          }
          notes.push(makeMetadataNote(cursor.value));
          cursor.continue();
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
      };

      request.onerror = () => {
        console.error('Failed to load notes metadata:', request.error);
        reject(request.error);
      };
    }));
  } catch (error) {
    console.error('Error loading notes metadata from IndexedDB:', error);
    return [];
  }
};

export const loadNoteFromDB = async (noteId: string): Promise<Note | null> => {
  try {
    return await withRetry((database) => new Promise<Note | null>((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME, META_STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const metaStore = transaction.objectStore(META_STORE_NAME);
      const request = store.get(noteId);
      const metaRequest = metaStore.get(noteId);

      transaction.oncomplete = () => {
        const full = request.result ? hydrateNote(request.result) : null;
        const meta = metaRequest.result ? hydrateNote(metaRequest.result) : null;
        if (!full) return resolve(meta);
        if (!meta) return resolve(full);
        resolve(hydrateNote({
          ...full,
          ...meta,
          content: full.content,
          [CONTENT_STUB_FLAG]: undefined,
          [CONTENT_PREVIEW_KEY]: (meta as any)[CONTENT_PREVIEW_KEY] ?? (full as any)[CONTENT_PREVIEW_KEY],
          [CONTENT_LENGTH_KEY]: (meta as any)[CONTENT_LENGTH_KEY] ?? (full as any)[CONTENT_LENGTH_KEY],
        }));
      };
      request.onerror = () => reject(request.error);
      metaRequest.onerror = () => reject(metaRequest.error);
    }));
  } catch (error) {
    console.error('Error loading single note from IndexedDB:', error);
    return null;
  }
};

const saveLargeNotesDataset = async (database: IDBDatabase, notes: Note[], skipSyncEvent: boolean): Promise<void> => {
  await new Promise<void>((resolve) => {
    const clearTx = database.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
    clearTx.objectStore(STORE_NAME).clear();
    clearTx.objectStore(META_STORE_NAME).clear();
    clearTx.oncomplete = () => resolve();
    clearTx.onerror = () => resolve();
  });

  for (let i = 0; i < notes.length; i += BATCH_SIZE) {
    const batch = notes.slice(i, i + BATCH_SIZE);

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const metaStore = transaction.objectStore(META_STORE_NAME);

      batch.forEach(note => {
        try {
          const hydrated = hydrateNote(note);
          store.put(serializeNote(hydrated));
          metaStore.put(serializeMetadataNote(hydrated));
        } catch {}
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    if (i + BATCH_SIZE < notes.length) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }

  if (!skipSyncEvent) window.dispatchEvent(new Event('notesUpdated'));
};

// Internal flush to IndexedDB
const flushNotesToDB = async (notes: Note[], skipSyncEvent: boolean): Promise<void> => {
  lastNoteSaveTime = Date.now();
  try {
    if (notes.length > BATCH_SIZE) {
      await withRetry((database) => saveLargeNotesDataset(database, notes, skipSyncEvent));
      return;
    }

    await withRetry((database) => new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const metaStore = transaction.objectStore(META_STORE_NAME);

      // For large datasets, clear + batch put is faster than diff
      if (notes.length > 500) {
        store.clear();
        const clearReq = metaStore.clear();
        clearReq.onsuccess = () => {
          notes.forEach(note => {
            try {
              const hydrated = hydrateNote(note);
              store.put(serializeNote(hydrated));
              metaStore.put(serializeMetadataNote(hydrated));
            } catch {}
          });
        };
        clearReq.onerror = () => {
          notes.forEach(note => {
            try {
              const hydrated = hydrateNote(note);
              store.put(serializeNote(hydrated));
              metaStore.put(serializeMetadataNote(hydrated));
            } catch {}
          });
        };
      } else {
        // Small dataset: diff-based update
        const noteIds = new Set(notes.map(n => n.id));
        const getAllRequest = store.getAllKeys();
        getAllRequest.onsuccess = () => {
          const existingKeys = getAllRequest.result as string[];
          existingKeys.forEach(key => {
            if (!noteIds.has(key)) {
              store.delete(key);
              metaStore.delete(key);
            }
          });
          notes.forEach(note => {
            const hydrated = hydrateNote(note);
            store.put(serializeNote(hydrated));
            metaStore.put(serializeMetadataNote(hydrated));
          });
        };
      }

      transaction.oncomplete = () => {
        if (!skipSyncEvent) window.dispatchEvent(new Event('notesUpdated'));
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    }));
  } catch (error) {
    console.error('Error saving notes to IndexedDB:', error);
  }
};

export const saveNotesToDB = async (notes: Note[], skipSyncEvent = false): Promise<void> => {
  if (notes.some(isNoteContentStub)) {
    console.warn('[noteStorage] Skipped bulk save for metadata-only notes; use saveNoteToDBSingle for row updates');
    return;
  }

  // Safety net: refuse to wipe a previously non-empty store with an empty array.
  // This protects against logout/login races where a context momentarily resets
  // its state before the real data finishes loading. Individual note deletes
  // continue to work via deleteNoteFromDB.
  if (notes.length === 0) {
    const hadCachedItems = Array.isArray(notesCache) && notesCache.length > 0;
    let hadStoredItems = false;
    if (!hadCachedItems) {
      try {
        const existing = await loadNotesFromDB();
        hadStoredItems = existing.length > 0;
      } catch {}
    }
    if (hadCachedItems || hadStoredItems) {
      console.warn('[noteStorage] Blocked attempt to wipe notes with an empty array');
      return;
    }
  }

  // Update in-memory cache immediately
  notesCache = notes;
  notesCacheIsMetadata = false;
  notesCacheVersion++;

  // Mirror to Lovable Cloud (offline-queued)
  if (!skipSyncEvent) {
    import('@/utils/cloudSync/storeBridge').then(({ pushNotes }) => {
      try { pushNotes(notes); } catch {}
    }).catch(() => {});
  }


  // Throttle IndexedDB writes
  const now = Date.now();
  if (now - lastNoteSaveTime < MIN_SAVE_INTERVAL) {
    pendingNotesFlush = notes;
    pendingNotesSkipSyncEvent = skipSyncEvent;
    if (pendingNotesFlushTimer) clearTimeout(pendingNotesFlushTimer);
    pendingNotesFlushTimer = setTimeout(() => {
      const queuedNotes = pendingNotesFlush ?? notes;
      const queuedSkipSyncEvent = pendingNotesSkipSyncEvent;
      pendingNotesFlush = null;
      pendingNotesSkipSyncEvent = false;
      pendingNotesFlushTimer = null;
      void flushNotesToDB(queuedNotes, queuedSkipSyncEvent);
    }, MIN_SAVE_INTERVAL);
    return;
  }

  if (pendingNotesFlushTimer) {
    clearTimeout(pendingNotesFlushTimer);
    pendingNotesFlushTimer = null;
    pendingNotesFlush = null;
    pendingNotesSkipSyncEvent = false;
  }

  return flushNotesToDB(notes, skipSyncEvent);
};

export const saveNoteToDBSingle = async (note: Note, skipCloudSync = false): Promise<void> => {
  let noteToPersist = hydrateNote(note);
  if (isNoteContentStub(note)) {
    const existing = await loadNoteFromDB(note.id);
    if (existing) {
      noteToPersist = hydrateNote({
        ...existing,
        ...note,
        content: existing.content,
        [CONTENT_STUB_FLAG]: undefined,
        [CONTENT_PREVIEW_KEY]: undefined,
        [CONTENT_LENGTH_KEY]: undefined,
      });
    }
  }

  // Update cache
  if (notesCache) {
    const cachedNote = notesCacheIsMetadata ? makeMetadataNote(noteToPersist) : noteToPersist;
    const idx = notesCache.findIndex(n => n.id === note.id);
    if (idx >= 0) {
      notesCache[idx] = cachedNote;
    } else {
      notesCache.push(cachedNote);
    }
    notesCacheVersion++;
  }

  // Mirror to Lovable Cloud
  if (!skipCloudSync) {
    import('@/utils/cloudSync/storeBridge').then(({ pushNotes }) => {
      try { pushNotes([noteToPersist]); } catch {}
    }).catch(() => {});
  }

  try {
    await withRetry((database) => new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const metaStore = transaction.objectStore(META_STORE_NAME);

      store.put(serializeNote(noteToPersist));
      metaStore.put(serializeMetadataNote(noteToPersist));

      transaction.oncomplete = () => {
        window.dispatchEvent(new Event(skipCloudSync ? 'notesRestored' : 'notesUpdated'));
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    }));
  } catch (error) {
    console.error('Error saving single note to IndexedDB:', error);
  }
};

/**
 * Bulk-write many notes in a single IndexedDB transaction. Optimized for
 * mass duplicate / mass import flows where firing N independent
 * `saveNoteToDBSingle` calls would queue N transactions and dispatch N
 * `notesUpdated` events (UI stutter at >500 notes).
 *
 * - One transaction per BATCH_SIZE chunk
 * - One coalesced `notesUpdated` event at the end
 * - Single cloud push for the whole batch
 */
export const bulkPutNotesInDB = async (
  notes: Note[],
  skipCloudSync = false,
): Promise<void> => {
  if (notes.length === 0) return;
  const hydrated = notes.map(hydrateNote);
  const hasContentStubs = hydrated.some(isNoteContentStub);
  const maxContentLength = hydrated.reduce((max, note) => {
    const len = typeof note.content === 'string' ? note.content.length : 0;
    return len > max ? len : max;
  }, 0);

  // Update in-memory cache so the UI reflects new rows immediately.
  if (notesCache) {
    const byId = new Map(notesCache.map((n, i) => [n.id, i]));
    for (const n of hydrated) {
      const idx = byId.get(n.id);
      if (idx !== undefined) {
        notesCache[idx] = !notesCacheIsMetadata && isNoteContentStub(n)
          ? hydrateNote({ ...notesCache[idx], ...n, content: notesCache[idx].content })
          : notesCacheIsMetadata
            ? makeMetadataNote(n)
            : n;
      } else {
        notesCache.push(notesCacheIsMetadata ? makeMetadataNote(n) : n);
      }
    }
    notesCacheVersion++;
  }

  // Chunked transactions — adaptive for duplicated 100k-word notes. Keeping a
  // 500-row transaction with giant HTML bodies can OOM mobile Chrome.
  const CHUNK = hasContentStubs ? 50 : maxContentLength > 50_000 ? 20 : 500;
  for (let start = 0; start < hydrated.length; start += CHUNK) {
    const slice = hydrated.slice(start, start + CHUNK);
    try {
      await withRetry((database) => new Promise<void>((resolve, reject) => {
        const tx = database.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const metaStore = tx.objectStore(META_STORE_NAME);
        for (const note of slice) {
          if (isNoteContentStub(note)) {
            // Metadata-only bulk actions (trash/archive/favorite/move) must not
            // read+clone the full note body. With thousands of 100k-word notes,
            // store.get(id) itself can crash the tab. The full content row stays
            // intact; the lightweight meta row drives list/calendar refreshes.
            metaStore.put(serializeMetadataNote(note));
          } else {
            store.put(serializeNote(note));
            metaStore.put(serializeMetadataNote(note));
          }
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }));
    } catch (e) {
      console.error('bulkPutNotesInDB chunk failed:', e);
    }
    // Yield to the UI between chunks so scrolling/clicks stay responsive.
    if (start + CHUNK < hydrated.length) await new Promise(r => setTimeout(r, 0));
  }

  // Single coalesced event so list/contexts refresh once.
  window.dispatchEvent(new Event(skipCloudSync ? 'notesRestored' : 'notesUpdated'));

  if (!skipCloudSync) {
    import('@/utils/cloudSync/storeBridge').then(({ pushNotes }) => {
      try { pushNotes(hydrated); } catch {}
    }).catch(() => {});
  }
};

export const deleteNoteFromDB = async (noteId: string, skipCloudSync = false): Promise<void> => {
  // Update cache
  if (notesCache) {
    notesCache = notesCache.filter(n => n.id !== noteId);
    notesCacheVersion++;
  }

  // Mirror delete to Lovable Cloud
  if (!skipCloudSync) {
    import('@/utils/cloudSync/storeBridge').then(({ pushNoteDelete }) => {
      try { pushNoteDelete(noteId); } catch {}
    }).catch(() => {});
  }

  try {
    await withRetry((database) => new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const metaStore = transaction.objectStore(META_STORE_NAME);
      store.delete(noteId);
      metaStore.delete(noteId);

      transaction.oncomplete = () => {
        window.dispatchEvent(new Event(skipCloudSync ? 'notesRestored' : 'notesUpdated'));
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    }));

    import('@/utils/deletionTracker').then(({ trackDeletion, loadDeletions }) => {
      trackDeletion(noteId, 'notes');
      import('@/utils/googleDriveSync').then(({ uploadCategory }) => {
        uploadCategory('flowist_deletions.json', loadDeletions()).catch(() => {});
      });
    });
  } catch (error) {
    console.error('Error deleting note from IndexedDB:', error);
  }
};

// Chunked bulk delete — used by "Empty Trash" / bulk selection so removing
// 10k+ notes never blocks the main thread or the cloud-push pipeline.
export const bulkDeleteNotesFromDB = async (
  noteIds: string[],
  skipCloudSync = false,
  onProgress?: (p: { processed: number; total: number }) => void,
): Promise<void> => {
  if (noteIds.length === 0) return;
  const idSet = new Set(noteIds);

  // 1. Cache update (synchronous, instant UI).
  if (notesCache) {
    notesCache = notesCache.filter(n => !idSet.has(n.id));
    notesCacheVersion++;
  }

  // 2. Track deletions in one shot for sync. Avoids 10k debounced uploads.
  if (!skipCloudSync) {
    try {
      const { trackDeletions, loadDeletions } = await import('@/utils/deletionTracker');
      trackDeletions(noteIds, 'notes');
      import('@/utils/googleDriveSync').then(({ uploadCategory }) => {
        uploadCategory('flowist_deletions.json', loadDeletions()).catch(() => {});
      }).catch(() => {});
    } catch {}
    // Mirror deletes to Lovable Cloud in batches via storeBridge.
    import('@/utils/cloudSync/storeBridge').then((mod: any) => {
      const fn = mod.pushNoteDeletes || mod.pushNoteDelete;
      if (typeof fn === 'function') {
        try {
          if (mod.pushNoteDeletes) fn(noteIds);
          else noteIds.forEach(id => fn(id));
        } catch {}
      }
    }).catch(() => {});
  }

  // 3. Chunked IndexedDB deletes (yield between chunks).
  const CHUNK = 500;
  const total = noteIds.length;
  for (let start = 0; start < noteIds.length; start += CHUNK) {
    const slice = noteIds.slice(start, start + CHUNK);
    try {
      await withRetry((database) => new Promise<void>((resolve, reject) => {
        const tx = database.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const metaStore = tx.objectStore(META_STORE_NAME);
        for (const id of slice) {
          try { store.delete(id); } catch {}
          try { metaStore.delete(id); } catch {}
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }));
    } catch (e) {
      console.error('bulkDeleteNotesFromDB chunk failed:', e);
    }
    try { onProgress?.({ processed: Math.min(start + CHUNK, total), total }); } catch {}
    if (start + CHUNK < noteIds.length) {
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // 4. Single coalesced refresh event.
  window.dispatchEvent(new Event(skipCloudSync ? 'notesRestored' : 'notesUpdated'));
};

// Clear notes cache (for fresh data reload)
export const clearNotesCache = () => {
  notesCache = null;
  notesCacheIsMetadata = false;
};

export const getNotesCacheVersion = () => notesCacheVersion;

// Migration from localStorage to IndexedDB (one-time)
export const migrateNotesToIndexedDB = async (): Promise<boolean> => {
  
  try {
    const migrated = await getSetting('notes_migrated_to_indexeddb', false);
    if (migrated) return false;

    let oldNotes: Note[] = [];
    try {
      const saved = localStorage.getItem('notes');
      if (saved) {
        const parsed = JSON.parse(saved);
        oldNotes = parsed.map((n: Note) => ({
          ...n,
          createdAt: new Date(n.createdAt),
          updatedAt: new Date(n.updatedAt),
          voiceRecordings: n.voiceRecordings?.map((r: any) => ({
            ...r,
            timestamp: new Date(r.timestamp),
          })) || [],
        }));
      }
    } catch {}

    if (oldNotes.length > 0) {
      await saveNotesToDB(oldNotes);
      await setSetting('notes_migrated_to_indexeddb', true);
      try { localStorage.removeItem('notes'); } catch {}
      console.log(`Migrated ${oldNotes.length} notes to IndexedDB`);
      return true;
    }
    
    await setSetting('notes_migrated_to_indexeddb', true);
    return false;
  } catch (error) {
    console.error('Migration failed:', error);
    return false;
  }
};

// Debounced save function to prevent excessive writes
let saveTimeout: NodeJS.Timeout | null = null;
export const debouncedSaveNotes = (notes: Note[], delay: number = 500): void => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    saveNotesToDB(notes);
  }, delay);
};

// Content compression for large notes
export const compressContent = (content: string): string => {
  return content
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
};

// Split large content into chunks for storage
export const splitLargeContent = (content: string, maxChunkSize: number = 500000): string[] => {
  const chunks: string[] = [];
  let start = 0;
  while (start < content.length) {
    chunks.push(content.slice(start, start + maxChunkSize));
    start += maxChunkSize;
  }
  return chunks;
};

// Get storage usage estimate
export const getStorageUsage = async (): Promise<{ used: number; quota: number }> => {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage || 0,
      quota: estimate.quota || 0,
    };
  }
  return { used: 0, quota: 0 };
};
