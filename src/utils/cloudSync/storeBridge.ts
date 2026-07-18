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
import { enqueueWrite, enqueueWrites, flushQueue, getQueueLength } from './writeQueue';
import { mappers, type MappedTable } from './mappers';
import type { SyncRow, SyncTable } from './syncTables';
import type { SyncChangeDetail } from './syncEngine';
import type { Folder } from '@/utils/folderStorage';
import type { Note, TodoItem } from '@/types/note';
import type { Habit } from '@/types/habit';
import { recordConflict, recordListenerEvent } from './diagnostics';
import { isTombstoned, markDeleted, markDeletedMany, clearTombstone } from './tombstones';

let installed = false;

// ---------- Initial full upload (post sign-in) ----------

/**
 * Push every locally-stored row up to the cloud once per (user, device).
 * Runs after startSync's bootstrap so users who created data BEFORE signing
 * in (or on a fresh install pre-auth) actually get their notes / tasks /
 * habits / sections / countdowns / settings mirrored to the cloud.
 *
 * Idempotent: keyed by localStorage flag `flowist:initialUpload:done:<uid>`.
 * Individual upserts are keyed by row id so re-runs don't duplicate anything.
 */
export async function runInitialFullUpload(userId: string): Promise<void> {
  // v3 deliberately ignores the earlier “queued” marker. Older builds marked
  // upload done before the queue had actually reached the backend, so users who
  // hit permission/queue/schema failures never retried their notes/tasks/habits.
  const flagKey = `flowist:initialUpload:v3:done:${userId}`;
  try { if (localStorage.getItem(flagKey) === '1') return; } catch {}

  try {
    // Notes
    try {
      const { loadNotesFromDB } = await import('@/utils/noteStorage');
      const notes = await loadNotesFromDB();
      if (notes.length) pushNotes(notes as any);
    } catch (e) { console.warn('[initialUpload] notes failed', e); }

    // Tasks
    try {
      const { loadTasksFromDB } = await import('@/utils/taskStorage');
      const tasks = await loadTasksFromDB();
      if (tasks.length) pushTasks(tasks as any);
    } catch (e) { console.warn('[initialUpload] tasks failed', e); }

    // Note folders + Task folders + Task sections
    try {
      const { getSetting } = await import('@/utils/settingsStorage');
      const [noteFolders, legacyNoteFolders, taskFolders, sections] = await Promise.all([
        getSetting<any[]>('nota_folders', []),
        getSetting<any[]>('folders', []),
        getSetting<any[]>('todoFolders', []),
        getSetting<any[]>('todoSections', []),
      ]);
      const mergedNoteFolders = [...(noteFolders ?? []), ...(legacyNoteFolders ?? [])]
        .filter((folder, index, all) => folder?.id && all.findIndex((item) => item?.id === folder.id) === index);
      if (mergedNoteFolders?.length) pushFolders(mergedNoteFolders as any);
      if (taskFolders?.length) pushTaskFolders(taskFolders as any);
      if (sections?.length) pushSections(sections as any);
    } catch (e) { console.warn('[initialUpload] folders/sections failed', e); }

    // Habits
    try {
      const { loadHabits } = await import('@/utils/habitStorage');
      const habits = await loadHabits();
      if (habits.length) pushHabits(habits as any);
    } catch (e) { console.warn('[initialUpload] habits failed', e); }

    // Habit sections
    try {
      const { loadHabitSections } = await import('@/utils/habitSectionsStorage');
      const hs = loadHabitSections();
      if (hs?.length) pushHabitSections(hs as any);
    } catch (e) { console.warn('[initialUpload] habit sections failed', e); }

    // Countdowns
    try {
      const { loadCountdowns } = await import('@/utils/countdownStorage');
      const cs = await loadCountdowns();
      if (cs?.length) pushCountdowns(cs as any);
    } catch (e) { console.warn('[initialUpload] countdowns failed', e); }

    for (let i = 0; i < 12; i++) {
      await flushQueue().catch(() => {});
      if (getQueueLength() === 0) break;
    }
    if (getQueueLength() === 0) {
      try { localStorage.setItem(flagKey, '1'); } catch {}
      console.info('[initialUpload] complete for', userId);
    } else {
      console.warn('[initialUpload] queued writes remain; will retry next start', getQueueLength());
    }
  } catch (e) {
    console.warn('[initialUpload] aborted', e);
  }
}

// ---------- Local → Cloud ----------

// Any upsert helper filters out rows the user just deleted so a stale editor
// autosave / batch save can never resurrect a tombstoned row.
const notTombstoned = (table: SyncTable, id: string, ts?: number) =>
  !isTombstoned(table, id, ts);

export function pushFolders(folders: Folder[]): void {
  const writes = [] as Parameters<typeof enqueueWrites>[0];
  for (const f of folders) {
    const row = mappers.folders.toCloud(f, 'notes');
    if (row && notTombstoned('folders', (row as any).id, +new Date((row as any).updated_at ?? Date.now()))) {
      writes.push({ table: 'folders', op: 'upsert', row: row as any });
    }
  }
  if (writes.length) enqueueWrites(writes);
}
export function pushTaskFolders(folders: any[]): void {
  const writes = [] as Parameters<typeof enqueueWrites>[0];
  for (const f of folders) {
    const row = mappers.folders.toCloud(f, 'tasks');
    if (row && notTombstoned('folders', (row as any).id, +new Date((row as any).updated_at ?? Date.now()))) {
      writes.push({ table: 'folders', op: 'upsert', row: row as any });
    }
  }
  if (writes.length) enqueueWrites(writes);
}
export function pushFolderDelete(id: string): void {
  markDeleted('folders', id);
  enqueueWrite('folders', 'delete', { id });
}

export function pushSections(sections: any[]): void {
  const writes = [] as Parameters<typeof enqueueWrites>[0];
  for (const s of sections) {
    const row = mappers.sections.toCloud(s);
    if (row && notTombstoned('sections', (row as any).id, +new Date((row as any).updated_at ?? Date.now()))) {
      writes.push({ table: 'sections', op: 'upsert', row: row as any });
    }
  }
  if (writes.length) enqueueWrites(writes);
}
export function pushSectionDelete(id: string): void {
  markDeleted('sections', id);
  enqueueWrite('sections', 'delete', { id });
}

export function pushNotes(notes: Note[]): void {
  const writes = [] as Parameters<typeof enqueueWrites>[0];
  for (const n of notes) {
    const row = mappers.notes.toCloud(n);
    if (!row) continue;
    if (n.isDeleted) {
      markDeleted('notes', row.id);
      writes.push({ table: 'notes', op: 'delete', row: row as any });
      continue;
    }
    const ts = +new Date((row as any).updated_at ?? (n as any).updatedAt ?? Date.now());
    if (notTombstoned('notes', row.id, ts)) {
      writes.push({ table: 'notes', op: 'upsert', row: row as any });
    }
  }
  if (writes.length) enqueueWrites(writes);
}
export function pushNoteDelete(id: string): void {
  markDeleted('notes', id);
  enqueueWrite('notes', 'delete', { id });
}
export function pushNoteDeletes(ids: string[]): void {
  markDeletedMany('notes', ids);
  enqueueWrites(ids.map((id) => ({ table: 'notes', op: 'delete', row: { id } })) as any);
}

export function pushTasks(tasks: TodoItem[]): void {
  const writes = [] as Parameters<typeof enqueueWrites>[0];
  for (const t of tasks) {
    const row = mappers.tasks.toCloud(t as any);
    if (!row) continue;
    if ((t as any).isDeleted) {
      markDeleted('tasks', row.id);
      writes.push({ table: 'tasks', op: 'delete', row: row as any });
      continue;
    }
    const ts = +new Date((row as any).updated_at ?? (t as any).modifiedAt ?? Date.now());
    if (notTombstoned('tasks', row.id, ts)) {
      writes.push({ table: 'tasks', op: 'upsert', row: row as any });
    }
  }
  if (writes.length) enqueueWrites(writes);
}
export function pushTaskDelete(id: string): void {
  markDeleted('tasks', id);
  enqueueWrite('tasks', 'delete', { id });
}
export function pushTaskDeletes(ids: string[]): void {
  markDeletedMany('tasks', ids);
  enqueueWrites(ids.map((id) => ({ table: 'tasks', op: 'delete', row: { id } })) as any);
}

export function pushHabits(habits: Habit[]): void {
  const writes = [] as Parameters<typeof enqueueWrites>[0];
  for (const h of habits) {
    const row = mappers.habits.toCloud(h);
    if (!row) continue;
    if ((h as any).isDeleted) {
      markDeleted('habits', row.id);
      writes.push({ table: 'habits', op: 'delete', row: row as any });
      continue;
    }
    const ts = +new Date((row as any).updated_at ?? (h as any).updatedAt ?? Date.now());
    if (notTombstoned('habits', row.id, ts)) {
      writes.push({ table: 'habits', op: 'upsert', row: row as any });
    }
  }
  if (writes.length) enqueueWrites(writes);
}
export function pushHabitDelete(id: string): void {
  markDeleted('habits', id);
  enqueueWrite('habits', 'delete', { id });
}

export function pushCountdowns(items: any[]): void {
  const writes = [] as Parameters<typeof enqueueWrites>[0];
  for (const c of items) {
    const row = (mappers as any).countdowns.toCloud(c);
    if (row && notTombstoned('countdowns', (row as any).id, +new Date((row as any).updated_at ?? Date.now()))) {
      writes.push({ table: 'countdowns', op: 'upsert', row });
    }
  }
  if (writes.length) enqueueWrites(writes);
}
export function pushCountdownDelete(id: string): void {
  markDeleted('countdowns', id);
  enqueueWrite('countdowns', 'delete', { id });
}

export function pushHabitSections(items: any[]): void {
  const writes = [] as Parameters<typeof enqueueWrites>[0];
  for (const s of items) {
    const row = (mappers as any).habitSections.toCloud(s);
    if (row && notTombstoned('habit_sections', (row as any).id, +new Date((row as any).updated_at ?? Date.now()))) {
      writes.push({ table: 'habit_sections', op: 'upsert', row });
    }
  }
  if (writes.length) enqueueWrites(writes);
}
export function pushHabitSectionDelete(id: string): void {
  markDeleted('habit_sections', id);
  enqueueWrite('habit_sections', 'delete', { id });
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
  const [noteLocal, legacyNoteLocal] = await Promise.all([
    getSetting<any[]>('nota_folders', []),
    getSetting<any[]>('folders', []),
  ]);
  const taskLocalRaw = await getSetting<any[]>('todoFolders', []);
  const noteById = new Map([...(noteLocal ?? []), ...(legacyNoteLocal ?? [])].map((f: any) => [f.id, { ...f, createdAt: new Date(f.createdAt), updatedAt: f.updatedAt ? new Date(f.updatedAt) : new Date(f.createdAt ?? Date.now()) }]));
  const taskById = new Map((taskLocalRaw ?? []).map((f: any) => [f.id, { ...f, createdAt: new Date(f.createdAt), updatedAt: f.updatedAt ? new Date(f.updatedAt) : new Date(f.createdAt ?? Date.now()) }]));
  let noteChanged = false;
  let taskChanged = false;
  for (const r of rows) {
    const mapped = mappers.folders.fromCloud(r);
    if (!mapped) continue;
    const store = (mapped as any).__flowistFolderStore === 'tasks' ? 'tasks' : 'notes';
    const byId = store === 'tasks' ? taskById : noteById;
    const cloudTs = +new Date(r.updated_at ?? Date.now());
    if (r.is_deleted) {
      markDeleted('folders', r.id, cloudTs);
      if (byId.delete(r.id)) store === 'tasks' ? taskChanged = true : noteChanged = true;
      continue;
    }
    // Suppress resurrections: local tombstone newer than this cloud row.
    if (isTombstoned('folders', r.id, cloudTs)) continue;
    const existing = byId.get(r.id) as any;
    if (!existing || new Date(existing.updatedAt ?? existing.createdAt ?? 0).getTime() < mapped.updatedAt.getTime()) {
      clearTombstone('folders', r.id);
      byId.set(r.id, mapped);
      store === 'tasks' ? taskChanged = true : noteChanged = true;
    } else if (new Date(existing.updatedAt ?? existing.createdAt ?? 0).getTime() > mapped.updatedAt.getTime()) {
      recordConflict({ table: 'folders', rowId: r.id, localUpdatedAt: +existing.updatedAt, cloudUpdatedAt: +mapped.updatedAt, resolution: 'kept_local' });
    }
  }
  if (noteChanged) {
    await setSetting('nota_folders', Array.from(noteById.values()), { skipCloudSync: true });
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
  const { loadNotesMetadataFromDB, loadNoteFromDB, saveNoteToDBSingle, deleteNoteFromDB } = await import('@/utils/noteStorage');
  const meta = await loadNotesMetadataFromDB();
  const metaById = new Map(meta.map(n => [n.id, n]));
  const clipIdsToPurgeFromCloud: string[] = [];
  let didWrite = false;
  let didDelete = false;
  for (const r of rows) {
    const payload = (r as any).payload as any;
    const isWebClip = !!(payload && payload.fullPageSnapshot);
    const cloudTs = +new Date(r.updated_at ?? Date.now());

    if (r.is_deleted) {
      markDeleted('notes', r.id, cloudTs);
      await deleteNoteFromDB(r.id, true);
      didDelete = true;
      continue;
    }
    if (isWebClip) {
      clipIdsToPurgeFromCloud.push(r.id);
      continue;
    }
    if (isTombstoned('notes', r.id, cloudTs)) {
      enqueueWrite('notes', 'delete', { id: r.id } as any);
      continue;
    }
    const existingMeta = metaById.get(r.id);
    const localTs = existingMeta ? +new Date(existingMeta.updatedAt as any) : 0;
    if (existingMeta && localTs >= cloudTs) {
      if (localTs > cloudTs) {
        recordConflict({ table: 'notes', rowId: r.id, localUpdatedAt: localTs, cloudUpdatedAt: cloudTs, resolution: 'kept_local' });
      }
      continue;
    }
    const existingFull = existingMeta ? await loadNoteFromDB(r.id) : undefined;
    const merged = mappers.notes.mergeCloud(existingFull ?? undefined, r) as Note;
    clearTombstone('notes', r.id);
    await saveNoteToDBSingle(merged, true);
    didWrite = true;
  }

  // Coalesced UI refresh so lists / editors reload from IDB after realtime.
  if (didWrite || didDelete) {
    window.dispatchEvent(new Event('notesUpdated'));
    // Also notify open editors so they can hot-refresh the current note body.
    window.dispatchEvent(new CustomEvent('flowist:notes:cloudApplied'));
  }


  // Best-effort: purge legacy web-clip rows from the cloud on idle so the
  // sync table stops carrying multi-MB HTML snapshots. This does NOT touch
  // the local IndexedDB copy — clips remain fully usable offline.
  if (clipIdsToPurgeFromCloud.length) {
    const schedule = (cb: () => void) =>
      (typeof (window as any).requestIdleCallback === 'function'
        ? (window as any).requestIdleCallback(cb, { timeout: 4000 })
        : setTimeout(cb, 1500));
    schedule(() => {
      try {
        for (const id of clipIdsToPurgeFromCloud) {
          enqueueWrite('notes', 'delete', { id } as any);
        }
      } catch { /* best-effort */ }
    });
  }
}

async function applyTasksFromCloud(rows: SyncRow[]) {
  const { loadTasksFromDB, saveTasksToDB } = await import('@/utils/taskStorage');
  const local = await loadTasksFromDB();
  const byId = new Map(local.map((t: any) => [t.id, t]));
  let changed = false;
  for (const r of rows) {
    const rowCloudTs = new Date(r.updated_at ?? Date.now()).getTime();
    if (r.is_deleted) {
      markDeleted('tasks', r.id, rowCloudTs);
      if (byId.delete(r.id)) changed = true;
      continue;
    }
    // Suppress resurrections.
    if (isTombstoned('tasks', r.id, rowCloudTs)) {
      enqueueWrite('tasks', 'delete', { id: r.id } as any);
      continue;
    }
    const existing = byId.get(r.id) as any;
    const cloudMerged = mappers.tasks.mergeCloud(existing, r) as TodoItem;
    const localTs = new Date(existing?.modifiedAt ?? existing?.updatedAt ?? existing?.createdAt ?? 0).getTime();
    const cloudTs = new Date((cloudMerged as any).modifiedAt ?? (cloudMerged as any).updatedAt ?? (cloudMerged as any).createdAt ?? r.updated_at ?? 0).getTime();
    if (existing && localTs < cloudTs) clearTombstone('tasks', r.id);

    // Field-level conflict resolution so completion + calendar fields never diverge:
    //   - completion is monotonic-preferring-true (and the later completedAt wins when both completed)
    //   - dueDate / reminderTime take the value from whichever side has the newer timestamp,
    //     even when the other side wins the overall row.
    const localCompleted = !!existing?.completed;
    const cloudCompleted = !!(cloudMerged as any).completed;
    const localCompletedAt = existing?.completedAt ? +new Date(existing.completedAt) : 0;
    const cloudCompletedAt = (cloudMerged as any).completedAt ? +new Date((cloudMerged as any).completedAt) : 0;

    const pickNewer = <T,>(a: T | undefined, b: T | undefined): T | undefined => {
      if (localTs >= cloudTs) return a ?? b;
      return b ?? a;
    };

    let winner: any;
    if (!existing || localTs < cloudTs) {
      winner = { ...cloudMerged };
    } else if (localTs > cloudTs) {
      winner = { ...existing };
      recordConflict({ table: 'tasks', rowId: r.id, localUpdatedAt: localTs, cloudUpdatedAt: cloudTs, resolution: 'kept_local' });
    } else {
      winner = { ...existing, ...cloudMerged };
    }

    // Completion: prefer completed=true; tiebreak by later completedAt.
    if (localCompleted && cloudCompleted) {
      winner.completed = true;
      winner.completedAt = new Date(Math.max(localCompletedAt, cloudCompletedAt));
    } else if (localCompleted || cloudCompleted) {
      // One side completed, the other not — accept the completion from whichever side recorded it later.
      const completionTs = localCompleted ? localTs : cloudTs;
      const unCompleteTs = localCompleted ? cloudTs : localTs;
      if (completionTs >= unCompleteTs) {
        winner.completed = true;
        winner.completedAt = new Date(localCompleted ? (localCompletedAt || localTs) : (cloudCompletedAt || cloudTs));
      } else {
        winner.completed = false;
        winner.completedAt = undefined;
      }
    }

    // Calendar fields — take from the side with the newer modifiedAt (already encoded by pickNewer).
    winner.dueDate = pickNewer(existing?.dueDate, (cloudMerged as any).dueDate);
    winner.reminderTime = pickNewer(existing?.reminderTime, (cloudMerged as any).reminderTime);

    // Keep the row's modifiedAt as the max of both sides so future merges stay stable.
    winner.modifiedAt = new Date(Math.max(localTs, cloudTs) || Date.now());

    const before = existing ? JSON.stringify({ c: existing.completed, ca: existing.completedAt, d: existing.dueDate, r: existing.reminderTime, m: existing.modifiedAt }) : '';
    const after = JSON.stringify({ c: winner.completed, ca: winner.completedAt, d: winner.dueDate, r: winner.reminderTime, m: winner.modifiedAt });
    if (!existing || before !== after || localTs < cloudTs) {
      byId.set(r.id, winner);
      changed = true;
    }
  }
  if (changed) {
    await saveTasksToDB(Array.from(byId.values()) as TodoItem[], true);
    window.dispatchEvent(new Event('tasksRestored'));
    window.dispatchEvent(new Event('tasksUpdated'));
  }
}


async function applySectionsFromCloud(rows: SyncRow[]) {
  const { getSetting, setSetting } = await import('@/utils/settingsStorage');
  const local = await getSetting<any[]>('todoSections', []);
  const byId = new Map((local ?? []).map((s: any) => [s.id, s]));
  let changed = false;
  for (const r of rows) {
    const cloudTs = +new Date(r.updated_at ?? Date.now());
    if (r.is_deleted) {
      markDeleted('sections', r.id, cloudTs);
      if (byId.delete(r.id)) changed = true;
      continue;
    }
    if (isTombstoned('sections', r.id, cloudTs)) {
      enqueueWrite('sections', 'delete', { id: r.id } as any);
      continue;
    }
    const mapped = mappers.sections.fromCloud(r);
    if (!mapped) continue;
    clearTombstone('sections', r.id);
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
  const { loadHabits, _applyCloudHabits } = await import('@/utils/habitStorage');
  const local = await loadHabits();
  const byId = new Map(local.map(h => [h.id, h]));
  let changed = false;
  for (const r of rows) {
    const rowCloudTs = +new Date(r.updated_at ?? Date.now());
    if (r.is_deleted) {
      markDeleted('habits', r.id, rowCloudTs);
      if (byId.delete(r.id)) changed = true;
      continue;
    }
    if (isTombstoned('habits', r.id, rowCloudTs)) {
      enqueueWrite('habits', 'delete', { id: r.id } as any);
      continue;
    }
    const merged = mappers.habits.mergeCloud(byId.get(r.id), r) as Habit;
    const existing = byId.get(r.id);
    const localTs = existing ? new Date((existing as any).updatedAt ?? 0).getTime() : 0;
    const cloudTs = new Date((merged as any).updatedAt ?? 0).getTime();
    if (!existing || localTs < cloudTs) { clearTombstone('habits', r.id); byId.set(r.id, merged); changed = true; }
    else if (localTs > cloudTs) {
      recordConflict({ table: 'habits', rowId: r.id, localUpdatedAt: localTs, cloudUpdatedAt: cloudTs, resolution: 'kept_local' });
    }
  }
  if (changed) await _applyCloudHabits(Array.from(byId.values()));
}

async function applySettingsFromCloud(rows: SyncRow[]) {
  if (!rows.length) return;
  const r: any = rows[rows.length - 1];
  const display = r.display_options as Record<string, unknown> | null;
  if (!display) return;
  const { setManySettings } = await import('@/utils/settingsStorage');
  const safeDisplay = { ...display };
  delete safeDisplay.folders;
  delete safeDisplay.nota_folders;
  delete safeDisplay.todoFolders;
  delete safeDisplay.todoSections;
  // Calendar layout is app-controlled, not a user preference. Prevent stale
  // signed-in cloud snapshots from restoring old colored card / notes layouts.
  delete safeDisplay.calendarLayoutMode;
  // Virtual journey lives in local IndexedDB only — a stale cloud snapshot
  // must never overwrite a freshly-selected journey on refresh.
  delete safeDisplay.flowist_virtual_journey;
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

async function applyCountdownsFromCloud(rows: SyncRow[]) {
  const { loadCountdowns, _applyCloudCountdowns } = await import('@/utils/countdownStorage');
  const local = await loadCountdowns();
  const byId = new Map(local.map((c: any) => [c.id, c]));
  let changed = false;
  for (const r of rows as any[]) {
    if (r.is_deleted) { if (byId.delete(r.id)) changed = true; continue; }
    const merged = (mappers as any).countdowns.mergeCloud(byId.get(r.id), r);
    const existing: any = byId.get(r.id);
    const localTs = existing ? +new Date(existing.updatedAt ?? existing.createdAt ?? 0) : 0;
    const cloudTs = +new Date(merged.updatedAt ?? r.updated_at ?? 0);
    if (!existing || localTs <= cloudTs) { byId.set(r.id, merged); changed = true; }
  }
  if (changed) await _applyCloudCountdowns(Array.from(byId.values()));
}

async function applyHabitSectionsFromCloud(rows: SyncRow[]) {
  const { loadHabitSections, _applyCloudHabitSections } = await import('@/utils/habitSectionsStorage');
  const local = loadHabitSections();
  const byId = new Map(local.map((s: any) => [s.id, s]));
  let changed = false;
  for (const r of rows as any[]) {
    if (r.is_deleted) { if (byId.delete(r.id)) changed = true; continue; }
    const mapped = (mappers as any).habitSections.fromCloud(r);
    if (!mapped) continue;
    byId.set(r.id, mapped);
    changed = true;
  }
  if (changed) _applyCloudHabitSections(Array.from(byId.values()));
}

const ROUTERS: Partial<Record<string, (rows: SyncRow[]) => Promise<void>>> = {
  folders: applyFoldersFromCloud,
  notes: applyNotesFromCloud,
  tasks: applyTasksFromCloud,
  sections: applySectionsFromCloud,
  habits: applyHabitsFromCloud,
  countdowns: applyCountdownsFromCloud,
  habit_sections: applyHabitSectionsFromCloud,
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
