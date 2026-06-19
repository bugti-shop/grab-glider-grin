/**
 * Store bridge: routes local writes/deletes into the offline write queue, and
 * applies inbound realtime events back into the local IndexedDB stores.
 *
 * Design: additive mirror. Local app code keeps working unchanged; the bridge
 * is fire-and-forget on the write side, and on the read side it merges cloud
 * rows into the existing local cache by `id` and re-emits the same UI events
 * the local stores already use (`foldersUpdated`, `notesUpdated`, etc.).
 *
 * Only rows whose local id is a UUID round-trip to the cloud. Legacy non-UUID
 * ids stay local-only until they are migrated.
 */
import { enqueueWrite } from './writeQueue';
import { mappers, type MappedTable } from './mappers';
import type { SyncRow } from './syncTables';
import type { SyncChangeDetail } from './syncEngine';
import type { Folder } from '@/utils/folderStorage';
import type { Note, TodoItem } from '@/types/note';
import type { Habit } from '@/types/habit';
import { recordConflict, recordListenerEvent } from './diagnostics';

let installed = false;

// ---------- Local → Cloud ----------

export function pushFolders(folders: Folder[]): void {
  for (const f of folders) {
    const row = mappers.folders.toCloud(f, 'notes');
    if (row) enqueueWrite('folders', 'upsert', row as any);
  }
}
export function pushTaskFolders(folders: any[]): void {
  for (const f of folders) {
    const row = mappers.folders.toCloud(f, 'tasks');
    if (row) enqueueWrite('folders', 'upsert', row as any);
  }
}
export function pushFolderDelete(id: string): void {
  enqueueWrite('folders', 'delete', { id });
}

export function pushSections(sections: any[]): void {
  for (const s of sections) {
    const row = mappers.sections.toCloud(s);
    if (row) enqueueWrite('sections', 'upsert', row as any);
  }
}
export function pushSectionDelete(id: string): void {
  enqueueWrite('sections', 'delete', { id });
}

export function pushNotes(notes: Note[]): void {
  for (const n of notes) {
    const row = mappers.notes.toCloud(n);
    if (row) enqueueWrite('notes', n.isDeleted ? 'delete' : 'upsert', row as any);
  }
}
export function pushNoteDelete(id: string): void {
  enqueueWrite('notes', 'delete', { id });
}

export function pushTasks(tasks: TodoItem[]): void {
  for (const t of tasks) {
    const row = mappers.tasks.toCloud(t as any);
    if (row) enqueueWrite('tasks', (t as any).isDeleted ? 'delete' : 'upsert', row as any);
  }
}
export function pushTaskDelete(id: string): void {
  enqueueWrite('tasks', 'delete', { id });
}

export function pushHabits(habits: Habit[]): void {
  for (const h of habits) {
    const row = mappers.habits.toCloud(h);
    if (row) enqueueWrite('habits', (h as any).isDeleted ? 'delete' : 'upsert', row as any);
  }
}
export function pushHabitDelete(id: string): void {
  enqueueWrite('habits', 'delete', { id });
}

/**
 * Mirror user settings as a single row keyed by user_id. We bundle local
 * settings into `display_options` jsonb so the schema doesn't need to know
 * every key. This row is upserted on `id = <user_id>` server-side.
 */
let settingsDebounce: ReturnType<typeof setTimeout> | null = null;
export function pushSettingsSnapshot(snapshot: Record<string, unknown>): void {
  if (settingsDebounce) clearTimeout(settingsDebounce);
  settingsDebounce = setTimeout(async () => {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const userId = session.user.id;
      const row = {
        id: userId,
        user_id: userId,
        theme: String(snapshot['theme'] ?? snapshot['dark_mode'] ?? 'system'),
        language: String(snapshot['language'] ?? 'en'),
        notification_preferences: snapshot['notification_preferences'] ?? {},
        display_options: snapshot,
        first_day_of_week: Number(snapshot['firstDayOfWeek'] ?? 0),
        date_format: String(snapshot['dateFormat'] ?? 'YYYY-MM-DD'),
        is_deleted: false,
        updated_at: new Date().toISOString(),
      };
      enqueueWrite('user_settings', 'upsert', row as any);
    } catch {}
  }, 800);
}

// ---------- Cloud → Local ----------

async function applyFoldersFromCloud(rows: SyncRow[]) {
  const { getSetting, setSetting } = await import('@/utils/settingsStorage');
  const noteLocal = await getSetting<any[]>('folders', []);
  const taskLocalRaw = await getSetting<any[]>('todoFolders', []);
  const noteById = new Map((noteLocal ?? []).map((f: any) => [f.id, { ...f, createdAt: new Date(f.createdAt), updatedAt: f.updatedAt ? new Date(f.updatedAt) : new Date(f.createdAt ?? Date.now()) }]));
  const taskById = new Map((taskLocalRaw ?? []).map((f: any) => [f.id, { ...f, createdAt: new Date(f.createdAt), updatedAt: f.updatedAt ? new Date(f.updatedAt) : new Date(f.createdAt ?? Date.now()) }]));
  let noteChanged = false;
  let taskChanged = false;
  for (const r of rows) {
    const mapped = mappers.folders.fromCloud(r);
    if (!mapped) continue;
    const store = (mapped as any).__flowistFolderStore === 'tasks' ? 'tasks' : 'notes';
    const byId = store === 'tasks' ? taskById : noteById;
    if (r.is_deleted) { if (byId.delete(r.id)) store === 'tasks' ? taskChanged = true : noteChanged = true; continue; }
    const existing = byId.get(r.id) as any;
    if (!existing || new Date(existing.updatedAt ?? existing.createdAt ?? 0).getTime() < mapped.updatedAt.getTime()) {
      byId.set(r.id, mapped);
      store === 'tasks' ? taskChanged = true : noteChanged = true;
    } else if (new Date(existing.updatedAt ?? existing.createdAt ?? 0).getTime() > mapped.updatedAt.getTime()) {
      recordConflict({ table: 'folders', rowId: r.id, localUpdatedAt: +existing.updatedAt, cloudUpdatedAt: +mapped.updatedAt, resolution: 'kept_local' });
    }
  }
  if (noteChanged) {
    await setSetting('folders', Array.from(noteById.values()), { skipCloudSync: true });
    window.dispatchEvent(new Event('foldersRestored'));
    window.dispatchEvent(new Event('foldersUpdated'));
  }
  if (taskChanged) {
    await setSetting('todoFolders', Array.from(taskById.values()), { skipCloudSync: true } as any);
    window.dispatchEvent(new Event('foldersRestored'));
    window.dispatchEvent(new Event('foldersUpdated'));
  }
}

async function applyNotesFromCloud(rows: SyncRow[]) {
  const { loadNotesFromDB, saveNoteToDBSingle, deleteNoteFromDB } = await import('@/utils/noteStorage');
  const local = await loadNotesFromDB();
  const byId = new Map(local.map(n => [n.id, n]));
  for (const r of rows) {
    if (r.is_deleted) { await deleteNoteFromDB(r.id, true); continue; }
    const merged = mappers.notes.mergeCloud(byId.get(r.id), r) as Note;
    const existing = byId.get(r.id);
    if (!existing || (existing.updatedAt as Date) < (merged.updatedAt as Date)) {
      await saveNoteToDBSingle(merged, true);
    } else if (+(existing.updatedAt as Date) > +(merged.updatedAt as Date)) {
      recordConflict({ table: 'notes', rowId: r.id, localUpdatedAt: +(existing.updatedAt as Date), cloudUpdatedAt: +(merged.updatedAt as Date), resolution: 'kept_local' });
    }
  }
}

async function applyTasksFromCloud(rows: SyncRow[]) {
  const { loadTasksFromDB, saveTasksToDB } = await import('@/utils/taskStorage');
  const local = await loadTasksFromDB();
  const byId = new Map(local.map((t: any) => [t.id, t]));
  let changed = false;
  for (const r of rows) {
    if (r.is_deleted) { if (byId.delete(r.id)) changed = true; continue; }
    const merged = mappers.tasks.mergeCloud(byId.get(r.id), r) as TodoItem;
    const existing = byId.get(r.id);
    const localTs = new Date((existing as any)?.modifiedAt ?? (existing as any)?.updatedAt ?? (existing as any)?.createdAt ?? 0).getTime();
    const cloudTs = new Date((merged as any).modifiedAt ?? (merged as any).updatedAt ?? (merged as any).createdAt ?? r.updated_at ?? 0).getTime();
    if (!existing || localTs < cloudTs) { byId.set(r.id, merged as any); changed = true; }
    else if (localTs > cloudTs) {
      recordConflict({ table: 'tasks', rowId: r.id, localUpdatedAt: localTs, cloudUpdatedAt: cloudTs, resolution: 'kept_local' });
    }
  }
  if (changed) await saveTasksToDB(Array.from(byId.values()) as TodoItem[], true);
}

async function applySectionsFromCloud(rows: SyncRow[]) {
  const { getSetting, setSetting } = await import('@/utils/settingsStorage');
  const local = await getSetting<any[]>('todoSections', []);
  const byId = new Map((local ?? []).map((s: any) => [s.id, s]));
  let changed = false;
  for (const r of rows) {
    if (r.is_deleted) { if (byId.delete(r.id)) changed = true; continue; }
    const mapped = mappers.sections.fromCloud(r);
    if (!mapped) continue;
    byId.set(r.id, mapped);
    changed = true;
  }
  if (changed) {
    await setSetting('todoSections', Array.from(byId.values()), { skipCloudSync: true });
    window.dispatchEvent(new Event('sectionsRestored'));
    window.dispatchEvent(new Event('sectionsUpdated'));
  }
}

async function applyHabitsFromCloud(rows: SyncRow[]) {
  const { loadHabits, saveHabit, deleteHabit } = await import('@/utils/habitStorage');
  const local = await loadHabits();
  const byId = new Map(local.map(h => [h.id, h]));
  for (const r of rows) {
    if (r.is_deleted) { await deleteHabit(r.id).catch(() => {}); continue; }
    const merged = mappers.habits.mergeCloud(byId.get(r.id), r) as Habit;
    const existing = byId.get(r.id);
    const localTs = existing ? new Date((existing as any).updatedAt ?? 0).getTime() : 0;
    const cloudTs = new Date((merged as any).updatedAt ?? 0).getTime();
    if (!existing || localTs < cloudTs) await saveHabit(merged);
    else if (localTs > cloudTs) {
      recordConflict({ table: 'habits', rowId: r.id, localUpdatedAt: localTs, cloudUpdatedAt: cloudTs, resolution: 'kept_local' });
    }
  }
}

async function applySettingsFromCloud(rows: SyncRow[]) {
  if (!rows.length) return;
  const r: any = rows[rows.length - 1];
  const display = r.display_options as Record<string, unknown> | null;
  if (!display) return;
  const { setManySettings } = await import('@/utils/settingsStorage');
  const safeDisplay = { ...display };
  delete safeDisplay.folders;
  delete safeDisplay.todoFolders;
  delete safeDisplay.todoSections;
  await setManySettings(safeDisplay);
}

async function applyAttachmentsFromCloud(rows: SyncRow[]) {
  const { onAttachmentEvent } = await import('./cloudAttachments');
  // Duplicate detection: same parent_id + file_name with different ids
  const seen = new Map<string, string>(); // parent|name -> id
  for (const r of rows as any[]) {
    const key = `${r.parent_id}|${r.file_name}`;
    const prior = seen.get(key);
    if (prior && prior !== r.id) {
      recordConflict({
        table: 'file_attachments', rowId: r.id, parentId: r.parent_id, fileName: r.file_name,
        localUpdatedAt: 0, cloudUpdatedAt: +new Date(r.updated_at ?? Date.now()),
        resolution: 'duplicate_attachment',
      });
    } else {
      seen.set(key, r.id);
    }
    onAttachmentEvent(r);
  }
}

const ROUTERS: Partial<Record<string, (rows: SyncRow[]) => Promise<void>>> = {
  folders: applyFoldersFromCloud,
  notes: applyNotesFromCloud,
  tasks: applyTasksFromCloud,
  sections: applySectionsFromCloud,
  habits: applyHabitsFromCloud,
  user_settings: applySettingsFromCloud,
  file_attachments: applyAttachmentsFromCloud,
};

export function installCloudListener(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('flowist:sync:change', (ev: Event) => {
    const detail = (ev as CustomEvent<SyncChangeDetail>).detail;
    recordListenerEvent(detail.table as any);
    const router = ROUTERS[detail.table];
    if (router) router(detail.rows).catch(err => console.warn('[sync] apply failed', detail.table, err));
  });
}
