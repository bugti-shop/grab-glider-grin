/**
 * Bi-directional bridge between checklist items inside a note's rich-text
 * content and the global task list.
 *
 * Approach:
 *   - Every `.checklist-item` in the note HTML is stamped with a stable
 *     `data-task-id` (UUID) the first time it is synced.
 *   - The item's text and completed state are mirrored to a global TodoItem.
 *   - We remember which task IDs a given note produced (persisted per note in
 *     localStorage) so removed items can be cleaned up on the next save.
 *   - Tasks created from notes are tagged with `sourceNoteId` so the rest of
 *     the app can identify / navigate back to their origin.
 */
import type { Note, TodoItem } from '@/types/note';
import { putTaskInDB, deleteTaskFromDB } from '@/utils/taskStorage';

const NOTE_TASK_MAP_PREFIX = 'flowist:note-task-ids:';

function loadMap(noteId: string): string[] {
  try {
    const raw = localStorage.getItem(NOTE_TASK_MAP_PREFIX + noteId);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveMap(noteId: string, ids: string[]): void {
  try {
    localStorage.setItem(NOTE_TASK_MAP_PREFIX + noteId, JSON.stringify(ids));
  } catch {
    /* quota — ignore */
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `nt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Extracted {
  html: string;
  items: Array<{ taskId: string; text: string; completed: boolean }>;
}

/**
 * Parses note content and stamps each `.checklist-item` with a stable
 * `data-task-id`. Returns the (possibly rewritten) HTML plus the extracted
 * checklist rows.
 */
export function stampChecklistIds(html: string): Extracted {
  if (!html || typeof window === 'undefined') {
    return { html, items: [] };
  }
  const container = document.createElement('div');
  container.innerHTML = html;
  const items: Extracted['items'] = [];
  const nodes = container.querySelectorAll<HTMLElement>('.checklist-item');
  nodes.forEach((li) => {
    let id = li.getAttribute('data-task-id');
    if (!id) {
      id = newId();
      li.setAttribute('data-task-id', id);
    }
    const checkbox = li.querySelector<HTMLInputElement>('input.checklist-checkbox');
    const completed = checkbox ? checkbox.checked || li.classList.contains('checked') : false;
    if (completed && checkbox && !checkbox.hasAttribute('checked')) {
      checkbox.setAttribute('checked', '');
    } else if (!completed && checkbox) {
      checkbox.removeAttribute('checked');
    }
    const textEl = li.querySelector('.checklist-text');
    const text = (textEl?.textContent || li.textContent || '').trim();
    if (text) items.push({ taskId: id, text, completed });
  });
  return { html: container.innerHTML, items };
}

/**
 * Syncs every checklist item in `note.content` to the global task list.
 * Called after a full note save.
 *
 * Returns the updated HTML — callers should persist it if it differs from the
 * incoming content so `data-task-id` attributes stick between sessions.
 */
export async function syncNoteChecklistToTasks(note: Note): Promise<string> {
  const { html, items } = stampChecklistIds(note.content || '');
  const previousIds = new Set(loadMap(note.id));
  const currentIds = new Set(items.map((i) => i.taskId));

  // Upsert current items into the global task list
  const nowIso = new Date();
  await Promise.all(
    items.map(async (item) => {
      const task = {
        id: item.taskId,
        text: item.text,
        completed: item.completed,
        priority: 'low' as const,
        description: `From note: ${note.title || 'Untitled'}`,
        tags: ['from-note'],
        sourceNoteId: note.id,
        createdAt: nowIso,
        updatedAt: nowIso,
      } as unknown as TodoItem;
      try {
        await putTaskInDB(task, false);
      } catch (e) {
        console.warn('[syncNoteTasks] put failed', item.taskId, e);
      }
    }),
  );

  // Delete tasks that were removed from the note
  const removed = [...previousIds].filter((id) => !currentIds.has(id));
  await Promise.all(
    removed.map((id) =>
      deleteTaskFromDB(id).catch((e) => console.warn('[syncNoteTasks] delete failed', id, e)),
    ),
  );

  saveMap(note.id, [...currentIds]);
  return html;
}
