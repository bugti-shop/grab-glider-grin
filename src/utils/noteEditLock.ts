/**
 * Note edit lock + revision registry.
 *
 * Prevents two problems that happen when the same note is opened from more
 * than one surface (calendar cell, notes list, deep link, etc.):
 *
 *   1. Duplicate rows — two editors both create a "new" draft for the same
 *      logical note because neither knew about the other's draft id.
 *   2. Stale overwrite — editor B saves a snapshot that is older than what
 *      editor A just persisted, silently reverting the user's typing.
 *
 * The lock is process-local (in-memory); it is not a distributed lock. Its
 * job is to coordinate the multiple React surfaces inside the current tab.
 */

export type EditLockToken = string;

interface LockEntry {
  token: EditLockToken;
  owner: string;              // human label for debugging ("NotesCalendar", "NotesList", ...)
  acquiredAt: number;
  lastKnownUpdatedAt: number; // ms since epoch of the last save we observed
}

const locks = new Map<string, LockEntry>();
const revisions = new Map<string, number>(); // noteId -> updatedAt (ms)

const now = () => Date.now();

const toMs = (value: Date | string | number | undefined | null): number => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const genToken = (): EditLockToken =>
  `lock_${now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Try to acquire the edit lock for `noteId`. If someone else already holds
 * it, returns { token, alreadyHeld: true } and the caller should reuse that
 * editor instead of opening a second one.
 */
export function acquireEditLock(noteId: string, owner: string): {
  token: EditLockToken;
  alreadyHeld: boolean;
} {
  const existing = locks.get(noteId);
  if (existing) {
    return { token: existing.token, alreadyHeld: true };
  }
  const token: EditLockToken = genToken();
  locks.set(noteId, {
    token,
    owner,
    acquiredAt: now(),
    lastKnownUpdatedAt: revisions.get(noteId) ?? 0,
  });
  return { token, alreadyHeld: false };
}

export function releaseEditLock(noteId: string, token: EditLockToken): void {
  const existing = locks.get(noteId);
  if (existing && existing.token === token) {
    locks.delete(noteId);
  }
}

export function hasEditLock(noteId: string): boolean {
  return locks.has(noteId);
}

export function isLockOwner(noteId: string, token: EditLockToken | null | undefined): boolean {
  if (!token) return false;
  const existing = locks.get(noteId);
  return !!existing && existing.token === token;
}

/**
 * Record a successful save so later saves can detect they are stale.
 */
export function recordRevision(noteId: string, updatedAt: Date | string | number): void {
  const ms = toMs(updatedAt);
  if (!ms) return;
  const prev = revisions.get(noteId) ?? 0;
  if (ms > prev) revisions.set(noteId, ms);
  const lock = locks.get(noteId);
  if (lock) lock.lastKnownUpdatedAt = revisions.get(noteId) ?? ms;
}

export function getRevision(noteId: string): number {
  return revisions.get(noteId) ?? 0;
}

/**
 * Guard an incoming save. Returns `ok` if it is safe to write, or `stale`
 * with the newer timestamp so the caller can merge/refresh instead of
 * blindly overwriting.
 */
export function checkRevision(
  noteId: string,
  incomingUpdatedAt: Date | string | number | undefined | null,
  baseUpdatedAt?: Date | string | number | null,
): { ok: true } | { ok: false; reason: 'stale'; latest: number } {
  const stored = revisions.get(noteId) ?? 0;
  const incoming = toMs(incomingUpdatedAt);
  const base = toMs(baseUpdatedAt ?? incomingUpdatedAt);
  // If the stored revision is newer than what this editor started from AND
  // newer than what it's trying to write, the write is stale.
  if (stored > 0 && stored > base && stored > incoming) {
    return { ok: false, reason: 'stale', latest: stored };
  }
  return { ok: true };
}

/** Test / logout helper. */
export function _resetNoteEditLock(): void {
  locks.clear();
  revisions.clear();
}
