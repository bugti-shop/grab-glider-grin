/**
 * Adapter that turns TodoItems into Note-shaped objects so the Notes calendar
 * layouts can render tasks. IDs are preserved so click handlers can look up the
 * original task and open the task detail sheet.
 */
import type { TodoItem, Note, NoteType, Priority } from '@/types/note';

const priorityToType: Record<string, NoteType> = {
  high: 'sticky',
  medium: 'lined',
  low: 'code',
  none: 'regular',
};

export function taskToPseudoNote(task: TodoItem): Note {
  const dueDate = task.dueDate ? new Date(task.dueDate) : new Date(task.createdAt || Date.now());
  const type: NoteType = priorityToType[(task.priority as Priority) || 'none'] || 'regular';
  return {
    id: task.id,
    title: task.text || 'Untitled task',
    content: task.notes || '',
    type,
    createdAt: dueDate,
    updatedAt: task.modifiedAt ? new Date(task.modifiedAt) : dueDate,
    tags: (task.tagIds || []) as any,
    folderId: task.folderId,
  } as unknown as Note;
}

export function tasksToPseudoNotes(tasks: TodoItem[]): Note[] {
  const out: Note[] = [];
  for (const t of tasks) {
    if (!t?.dueDate) continue;
    out.push(taskToPseudoNote(t));
  }
  return out;
}
