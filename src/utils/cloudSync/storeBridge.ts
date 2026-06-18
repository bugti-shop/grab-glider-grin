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
    const row = mappers.folders.toCloud(f);
    if (row) enqueueWrite('folders', 'upsert', row as any);
  }
}
export function pushFolderDelete(id: string): void {
  enqueueWrite('folders', 'delete', { id });
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
  const { loadFolders, saveFolders } = await import('@/utils/folderStorage');
  const local = await loadFolders();
  const byId = new Map(local.map(f => [f.id, f]));
  for (const r of rows) {
    const mapped = mappers.folders.fromCloud(r);
    if (!mapped) continue;
    if (r.is_deleted) { byId.delete(r.id); continue; }
    const existing = byId.get(r.id);
    if (!existing || existing.updatedAt < mapped.updatedAt) byId.set(r.id, mapped);
    else if (existing.updatedAt.getTime() > mapped.updatedAt.getTime()) {
      recordConflict({ table: 'folders', rowId: r.id, localUpdatedAt: +existing.updatedAt, cloudUpdatedAt: +mapped.updatedAt, resolution: 'kept_local' });
    }
  }
  await saveFolders(Array.from(byId.values()));
}

async function applyNotesFromCloud(rows: SyncRow[]) {
  const { loadNotesFromDB, saveNoteToDBSingle, deleteNoteFromDB } = await import('@/utils/noteStorage');
  const local = await loadNotesFromDB();
  const byId = new Map(local.map(n => [n.id, n]));
  for (const r of rows) {
    if (r.is_deleted) { await deleteNoteFromDB(r.id); continue; }
    const merged = mappers.notes.mergeCloud(byId.get(r.id), r) as Note;
    const existing = byId.get(r.id);
    if (!existing || (existing.updatedAt as Date) < (merged.updatedAt as Date)) {
      await saveNoteToDBSingle(merged);
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
    const localTs = (existing as any)?.updatedAt ? new Date((existing as any).updatedAt).getTime() : 0;
    const cloudTs = (merged as any).updatedAt ? new Date((merged as any).updatedAt).getTime() : 0;
    if (!existing || localTs < cloudTs) { byId.set(r.id, merged as any); changed = true; }
    else if (localTs > cloudTs) {
      recordConflict({ table: 'tasks', rowId: r.id, localUpdatedAt: localTs, cloudUpdatedAt: cloudTs, resolution: 'kept_local' });
    }
  }
  if (changed) await saveTasksToDB(Array.from(byId.values()) as TodoItem[], true);
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
  await setManySettings(display);
}

async function applyAttachmentsFromCloud(rows: SyncRow[]) {
  const { onAttachmentEvent } = await import('./cloudAttachments');
  for (const r of rows) onAttachmentEvent(r as any);
}

const ROUTERS: Partial<Record<string, (rows: SyncRow[]) => Promise<void>>> = {
  folders: applyFoldersFromCloud,
  notes: applyNotesFromCloud,
  tasks: applyTasksFromCloud,
  habits: applyHabitsFromCloud,
  user_settings: applySettingsFromCloud,
  file_attachments: applyAttachmentsFromCloud,
};

export function installCloudListener(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('flowist:sync:change', (ev: Event) => {
    const detail = (ev as CustomEvent<SyncChangeDetail>).detail;
    const router = ROUTERS[detail.table];
    if (router) router(detail.rows).catch(err => console.warn('[sync] apply failed', detail.table, err));
  });
}
