/**
 * One-time migration: assign UUIDs to legacy local rows whose id is not a UUID
 * so they immediately participate in cloud listener merges (which key by UUID).
 *
 * Scope: folders, notes, tasks (incl. subtasks), habits.
 * - Generates `crypto.randomUUID()` for every non-UUID id.
 * - Rewrites cross-references (note.folderId, task.folderId, task.parentId, etc.).
 * - Persists via the regular save APIs so the writeQueue mirrors them to cloud.
 * - Guarded by a localStorage flag so it runs at most once per device.
 */
const FLAG_KEY = 'flowist:legacyIdMigration:v1';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID_RE.test(s);
const newId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });

type Remap = Map<string, string>;

const remapId = (remap: Remap, id: string | undefined): string | undefined =>
  id && remap.has(id) ? remap.get(id)! : id;

export interface MigrationReport {
  alreadyRan: boolean;
  folders: number;
  notes: number;
  tasks: number;
  habits: number;
}

let runningPromise: Promise<MigrationReport> | null = null;

const LOCK_NAME = 'flowist:legacyIdMigration:v1:lock';
const LOCK_LS_KEY = 'flowist:legacyIdMigration:v1:lock-held';
const LOCK_TTL_MS = 60_000;

/**
 * Acquire an inter-tab / inter-process lock so two tabs (or a tab + a SW)
 * can't run the migration concurrently and produce conflicting UUID rewrites.
 *
 * Prefers the Web Locks API (truly atomic across same-origin contexts on the
 * same device). Falls back to a TTL'd localStorage flag + storage-event check
 * for browsers without Web Locks.
 */
async function withMigrationLock<T>(fn: () => Promise<T>): Promise<T | { skipped: true }> {
  const nav: any = typeof navigator !== 'undefined' ? navigator : null;
  if (nav?.locks?.request) {
    return await nav.locks.request(
      LOCK_NAME,
      { mode: 'exclusive', ifAvailable: true },
      async (lock: any) => {
        if (!lock) return { skipped: true } as const;
        return await fn();
      },
    );
  }
  // Fallback: TTL'd localStorage lock
  try {
    const now = Date.now();
    const raw = localStorage.getItem(LOCK_LS_KEY);
    if (raw) {
      const ts = parseInt(raw, 10);
      if (Number.isFinite(ts) && now - ts < LOCK_TTL_MS) {
        return { skipped: true } as const;
      }
    }
    localStorage.setItem(LOCK_LS_KEY, String(now));
  } catch {}
  try {
    return await fn();
  } finally {
    try { localStorage.removeItem(LOCK_LS_KEY); } catch {}
  }
}

export function runLegacyIdMigration(): Promise<MigrationReport> {
  if (runningPromise) return runningPromise;
  runningPromise = (async (): Promise<MigrationReport> => {
    const report: MigrationReport = { alreadyRan: false, folders: 0, notes: 0, tasks: 0, habits: 0 };
    try {
      if (typeof window === 'undefined') return report;
      if (localStorage.getItem(FLAG_KEY) === 'done') {
        report.alreadyRan = true;
        return report;
      }

      const result = await withMigrationLock(async () => {
        // Re-check the flag inside the lock: another tab may have completed
        // the migration while we were waiting.
        if (localStorage.getItem(FLAG_KEY) === 'done') {
          report.alreadyRan = true;
          return report;
        }
        await doMigrate(report);
        localStorage.setItem(FLAG_KEY, 'done');
        return report;
      });

      if ((result as any)?.skipped) {
        // Another tab is running the migration. Treat this run as a no-op;
        // the cloud listener will pick up its writes via realtime.
        console.info('[legacyIdMigration] skipped — another tab holds the lock');
        report.alreadyRan = true;
        return report;
      }
      return report as MigrationReport;
    } catch (e) {
      console.warn('[legacyIdMigration] aborted', e);
      return report;
    }
  })();
  return runningPromise;
}

async function doMigrate(report: MigrationReport): Promise<void> {


      const remap: Remap = new Map();

      // --- Folders ---
      try {
        const { loadFolders, saveFolders } = await import('@/utils/folderStorage');
        const folders = await loadFolders();
        let changed = false;
        for (const f of folders) {
          if (!isUuid(f.id)) {
            const next = newId();
            remap.set(f.id, next);
            f.id = next;
            f.updatedAt = new Date();
            changed = true;
            report.folders++;
          }
        }
        if (changed) await saveFolders(folders);
      } catch (e) { console.warn('[legacyIdMigration] folders failed', e); }

      // --- Notes ---
      try {
        const { loadNotesFromDB, saveNotesToDB } = await import('@/utils/noteStorage');
        const notes = await loadNotesFromDB();
        let changed = false;
        for (const n of notes as any[]) {
          if (!isUuid(n.id)) {
            const next = newId();
            remap.set(n.id, next);
            n.id = next;
            n.updatedAt = new Date();
            changed = true;
            report.notes++;
          }
          if (n.folderId && remap.has(n.folderId)) {
            n.folderId = remap.get(n.folderId);
            changed = true;
          }
        }
        if (changed) await saveNotesToDB(notes);
      } catch (e) { console.warn('[legacyIdMigration] notes failed', e); }

      // --- Tasks (incl. subtasks recursively) ---
      try {
        const { loadTasksFromDB, saveTasksToDB } = await import('@/utils/taskStorage');
        const tasks = await loadTasksFromDB();
        let changed = false;
        const visit = (t: any) => {
          if (!isUuid(t.id)) {
            const next = newId();
            remap.set(t.id, next);
            t.id = next;
            t.modifiedAt = new Date();
            changed = true;
            report.tasks++;
          }
          if (Array.isArray(t.subtasks)) t.subtasks.forEach(visit);
        };
        tasks.forEach(visit);
        // Pass 2: rewrite refs after every id is known
        const rewriteRefs = (t: any) => {
          const folderRemapped = remapId(remap, t.folderId);
          if (folderRemapped !== t.folderId) { t.folderId = folderRemapped; changed = true; }
          const parentRemapped = remapId(remap, t.parentId);
          if (parentRemapped !== t.parentId) { t.parentId = parentRemapped; changed = true; }
          if (Array.isArray(t.subtasks)) t.subtasks.forEach(rewriteRefs);
        };
        tasks.forEach(rewriteRefs);
        if (changed) await saveTasksToDB(tasks);
      } catch (e) { console.warn('[legacyIdMigration] tasks failed', e); }

      // --- Habits ---
      try {
        const { loadHabits, saveHabitsBatch } = await import('@/utils/habitStorage');
        const habits = await loadHabits();
        let changed = false;
        for (const h of habits as any[]) {
          if (!isUuid(h.id)) {
            const next = newId();
            remap.set(h.id, next);
            h.id = next;
            changed = true;
            report.habits++;
          }
        }
        if (changed) await saveHabitsBatch(habits);
      } catch (e) { console.warn('[legacyIdMigration] habits failed', e); }

      console.info('[legacyIdMigration] complete', report);
}

