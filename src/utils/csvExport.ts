/**
 * CSV exporters for tasks and notes.
 * Pure utilities — no UI, no side effects beyond the download trigger.
 */
import type { TodoItem, Note } from '@/types/note';

const csvEscape = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  const s = typeof val === 'string' ? val : String(val);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const toRow = (cells: unknown[]): string => cells.map(csvEscape).join(',');

const isoOrEmpty = (d: unknown): string => {
  if (!d) return '';
  try {
    const date = d instanceof Date ? d : new Date(d as any);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString();
  } catch { return ''; }
};

/** Flatten subtasks so every task (including children) gets a CSV row. */
const flattenForExport = (items: readonly TodoItem[], parentId = ''): Array<TodoItem & { _parentId: string }> => {
  const out: Array<TodoItem & { _parentId: string }> = [];
  for (const t of items) {
    if (!t) continue;
    out.push({ ...(t as TodoItem), _parentId: parentId });
    if (Array.isArray(t.subtasks) && t.subtasks.length > 0) {
      out.push(...flattenForExport(t.subtasks, t.id));
    }
  }
  return out;
};

export const tasksToCsv = (tasks: readonly TodoItem[]): string => {
  const header = [
    'id', 'parentId', 'text', 'description', 'completed', 'status', 'priority',
    'isPinned', 'dueDate', 'reminderTime', 'repeatType', 'tags',
    'folderId', 'sectionId', 'createdAt', 'modifiedAt', 'completedAt',
  ];
  const rows = [toRow(header)];
  for (const t of flattenForExport(tasks)) {
    rows.push(toRow([
      t.id,
      t._parentId,
      t.text ?? '',
      t.description ?? '',
      t.completed ? 'true' : 'false',
      t.status ?? '',
      t.priority ?? '',
      t.isPinned ? 'true' : 'false',
      isoOrEmpty(t.dueDate),
      isoOrEmpty(t.reminderTime),
      t.repeatType ?? '',
      Array.isArray(t.tags) ? t.tags.join('|') : '',
      t.folderId ?? '',
      t.sectionId ?? '',
      isoOrEmpty(t.createdAt),
      isoOrEmpty(t.modifiedAt),
      isoOrEmpty(t.completedAt),
    ]));
  }
  return rows.join('\r\n');
};

export const notesToCsv = (notes: readonly Note[]): string => {
  const header = [
    'id', 'type', 'title', 'content', 'color', 'folderId',
    'tagIds', 'isPinned', 'isFavorite', 'isArchived', 'isDeleted',
    'reminderEnabled', 'reminderTime', 'createdAt', 'modifiedAt',
  ];
  const rows = [toRow(header)];
  for (const n of notes) {
    if (!n) continue;
    rows.push(toRow([
      n.id,
      n.type ?? '',
      n.title ?? '',
      n.content ?? '',
      n.color ?? n.customColor ?? '',
      n.folderId ?? '',
      Array.isArray(n.tagIds) ? n.tagIds.join('|') : '',
      n.isPinned ? 'true' : 'false',
      n.isFavorite ? 'true' : 'false',
      n.isArchived ? 'true' : 'false',
      n.isDeleted ? 'true' : 'false',
      n.reminderEnabled ? 'true' : 'false',
      isoOrEmpty(n.reminderTime),
      isoOrEmpty((n as any).createdAt),
      isoOrEmpty((n as any).modifiedAt ?? (n as any).updatedAt),
    ]));
  }
  return rows.join('\r\n');
};

export const downloadCsv = (filename: string, csv: string): void => {
  try {
    // Prepend BOM so Excel correctly detects UTF-8.
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[csvExport] download failed', err);
    throw err;
  }
};

const ts = (): string => {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
};

export const exportTasksCsv = (tasks: readonly TodoItem[]): { filename: string; count: number } => {
  const csv = tasksToCsv(tasks);
  const filename = `flowist-tasks-${ts()}.csv`;
  downloadCsv(filename, csv);
  return { filename, count: tasks.length };
};

export const exportNotesCsv = (notes: readonly Note[]): { filename: string; count: number } => {
  const csv = notesToCsv(notes);
  const filename = `flowist-notes-${ts()}.csv`;
  downloadCsv(filename, csv);
  return { filename, count: notes.length };
};
