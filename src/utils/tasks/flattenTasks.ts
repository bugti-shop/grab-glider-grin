/**
 * Flattens a (possibly nested) task tree into a single linear array for
 * virtualization. Each output row carries either a `parentChip` (for
 * subtasks promoted to the top level) or `undefined`.
 *
 * O(n) over total nodes — safe at 100k+ rows.
 */
import type { TodoItem } from '@/types/note';

export interface FlatTaskRow {
  task: TodoItem;
  /** Title of the parent task, if this row is a promoted subtask. */
  parentChip?: string;
  /** Depth in the original tree (0 = root). Kept for optional styling. */
  depth: number;
}

export interface FlatTaskIndex {
  flat: FlatTaskRow[];
  indexById: Map<string, number>;
  parentChipById: Map<string, string>;
}

export function flattenTasks(items: readonly TodoItem[] | undefined | null): FlatTaskIndex {
  const flat: FlatTaskRow[] = [];
  const indexById = new Map<string, number>();
  const parentChipById = new Map<string, string>();

  if (!items || items.length === 0) {
    return { flat, indexById, parentChipById };
  }

  const walk = (list: readonly TodoItem[], depth: number, parentTitle?: string) => {
    for (const t of list) {
      if (!t || typeof t.id !== 'string') continue;
      const chip = depth > 0 ? parentTitle : undefined;
      const row: FlatTaskRow = { task: t, parentChip: chip, depth };
      indexById.set(t.id, flat.length);
      if (chip) parentChipById.set(t.id, chip);
      flat.push(row);
      const subs = (t as any).subtasks as TodoItem[] | undefined;
      if (Array.isArray(subs) && subs.length > 0) {
        walk(subs, depth + 1, (t as any).text ?? (t as any).title ?? parentTitle);
      }
    }
  };

  walk(items, 0);
  return { flat, indexById, parentChipById };
}
