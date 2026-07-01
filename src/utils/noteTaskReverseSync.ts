/**
 * Reverse bridge: when a task originating from a note is toggled/edited from
 * anywhere in the app, mirror the change back into the note's `.checklist-item`
 * HTML so the checkbox and text stay in sync.
 *
 * Listens to the `flowist:sync:change` event dispatched by the cloud sync
 * engine (see cloudSync/syncEngine.ts) for the `tasks` table.
 */
import type { SyncChangeDetail } from '@/utils/cloudSync/syncEngine';
import type { Note, TodoItem } from '@/types/note';
import { loadNoteFromDB, saveNoteToDBSingle } from '@/utils/noteStorage';

let started = false;

function payloadObject(row: any): any {
  const p = row?.payload;
  if (!p) return {};
  if (typeof p === 'string') { try { return JSON.parse(p); } catch { return {}; } }
  return p;
}

function rowToTask(row: any): TodoItem | null {
  if (!row?.id) return null;
  const payload = payloadObject(row) as Partial<TodoItem>;
  return {
    ...payload,
    id: row.id,
    text: row.title ?? payload.text ?? '',
    completed: !!row.is_completed,
  } as TodoItem;
}

async function applyTaskToNote(task: TodoItem): Promise<void> {
  const noteId = task.sourceNoteId;
  if (!noteId) return;
  const note: Note | null = await loadNoteFromDB(noteId);
  if (!note || !note.content) return;

  const container = document.createElement('div');
  container.innerHTML = note.content;
  const li = container.querySelector<HTMLElement>(`.checklist-item[data-task-id="${task.id}"]`);
  if (!li) return;

  let changed = false;
  const checkbox = li.querySelector<HTMLInputElement>('input.checklist-checkbox');
  const currentlyChecked = checkbox ? (checkbox.checked || checkbox.hasAttribute('checked')) : li.classList.contains('checked');
  if (currentlyChecked !== !!task.completed) {
    if (checkbox) {
      if (task.completed) checkbox.setAttribute('checked', '');
      else checkbox.removeAttribute('checked');
      checkbox.checked = !!task.completed;
    }
    li.classList.toggle('checked', !!task.completed);
    changed = true;
  }
  const textEl = li.querySelector('.checklist-text');
  if (textEl && task.text && textEl.textContent !== task.text) {
    textEl.textContent = task.text;
    changed = true;
  }

  if (!changed) return;
  const nextHtml = container.innerHTML;
  const updated: Note = {
    ...note,
    content: nextHtml,
    updatedAt: new Date(),
  };
  try {
    // Guard: don't push a sync event back through the queue; the note save
    // itself will trigger normal cloud sync. Passing false keeps default.
    await saveNoteToDBSingle(updated);
  } catch (e) {
    console.warn('[noteTaskReverseSync] save failed', e);
  }
}

function onSyncChange(e: Event) {
  const detail = (e as CustomEvent<SyncChangeDetail>).detail;
  if (!detail || detail.table !== 'tasks') return;
  for (const row of detail.rows) {
    const task = rowToTask(row);
    if (!task || !task.sourceNoteId) continue;
    void applyTaskToNote(task);
  }
}

export function startNoteTaskReverseSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('flowist:sync:change', onSyncChange as EventListener);
}

export function stopNoteTaskReverseSync(): void {
  if (!started) return;
  started = false;
  window.removeEventListener('flowist:sync:change', onSyncChange as EventListener);
}
