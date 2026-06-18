/**
 * Lightweight diagnostics surface for the cloud sync engine.
 *
 * Three signals, all read live without touching IndexedDB:
 *   • queue backlog       — pending writes per table (writeQueue)
 *   • last listener event — timestamp of the most recent realtime event we
 *                           processed per table
 *   • detected conflicts  — rolling buffer of cases where a local row was
 *                           newer than the inbound cloud row (we kept local;
 *                           cloud will overwrite on next push). Also covers
 *                           attachment-type conflicts (same parent_id +
 *                           file_name observed on multiple devices).
 */
import { SYNC_TABLES, type SyncTable } from './syncTables';

const STORAGE_KEY_LISTENER = 'flowist_sync_diag_listener_v1';
const STORAGE_KEY_CONFLICTS = 'flowist_sync_diag_conflicts_v1';
const MAX_CONFLICTS = 50;

export interface ConflictRecord {
  id: string;
  table: SyncTable | 'file_attachments';
  rowId: string;
  parentId?: string;
  fileName?: string;
  localUpdatedAt: number;
  cloudUpdatedAt: number;
  detectedAt: number;
  resolution: 'kept_local' | 'kept_cloud' | 'duplicate_attachment';
}

// ---------- listener heartbeat ----------

type ListenerMap = Partial<Record<SyncTable | 'file_attachments', number>>;
function loadListener(): ListenerMap {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_LISTENER) ?? '{}'); } catch { return {}; }
}
function saveListener(m: ListenerMap) {
  try { localStorage.setItem(STORAGE_KEY_LISTENER, JSON.stringify(m)); } catch {}
}

export function recordListenerEvent(table: SyncTable | 'file_attachments'): void {
  const m = loadListener();
  m[table] = Date.now();
  saveListener(m);
}

export function getListenerTimestamps(): ListenerMap {
  return loadListener();
}

// ---------- conflicts ----------

function loadConflicts(): ConflictRecord[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_CONFLICTS) ?? '[]'); } catch { return []; }
}
function saveConflicts(c: ConflictRecord[]) {
  try { localStorage.setItem(STORAGE_KEY_CONFLICTS, JSON.stringify(c)); } catch {}
}

export function recordConflict(c: Omit<ConflictRecord, 'id' | 'detectedAt'>): void {
  const all = loadConflicts();
  all.unshift({ ...c, id: `${c.table}:${c.rowId}:${Date.now()}`, detectedAt: Date.now() });
  if (all.length > MAX_CONFLICTS) all.length = MAX_CONFLICTS;
  saveConflicts(all);
  try { window.dispatchEvent(new Event('flowist:sync:diag-changed')); } catch {}
}

export function getConflicts(): ConflictRecord[] {
  return loadConflicts();
}

export function clearConflicts(): void {
  saveConflicts([]);
  try { window.dispatchEvent(new Event('flowist:sync:diag-changed')); } catch {}
}

// ---------- backlog ----------

const WRITE_QUEUE_KEY = 'flowist_sync_write_queue_v1';

export function getQueueBacklog(): Record<string, number> {
  try {
    const raw = localStorage.getItem(WRITE_QUEUE_KEY);
    if (!raw) return {};
    const q = JSON.parse(raw) as Array<{ table: string }>;
    const out: Record<string, number> = {};
    for (const t of [...SYNC_TABLES] as string[]) out[t] = 0;
    for (const entry of q) out[entry.table] = (out[entry.table] ?? 0) + 1;
    return out;
  } catch { return {}; }
}

export function getTotalBacklog(): number {
  const b = getQueueBacklog();
  return Object.values(b).reduce((a, n) => a + n, 0);
}
