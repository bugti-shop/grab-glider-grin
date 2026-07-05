/**
 * Shared filter + sort logic for tasks and subtasks.
 *
 * Kept as a pure function so main-task pipelines (useTodayState) and inline
 * subtask rendering (Today.tsx renderSubtasksInline) apply identical rules.
 */
import type { TodoItem } from '@/types/note';

export type SortBy = 'date' | 'priority' | 'name' | 'created' | string;
export type DateFilter = 'all' | 'has-date' | 'no-date' | string;

export interface TaskFilterOptions {
  priorityFilter?: string; // 'all' | priority id
  statusFilter?: string;   // 'all' | status id
  dateFilter?: DateFilter;
  tagFilter?: string[];
  sortBy?: SortBy;
}

export function filterTasks<T extends TodoItem>(items: T[], opts: TaskFilterOptions): T[] {
  const { priorityFilter = 'all', statusFilter = 'all', dateFilter = 'all', tagFilter = [] } = opts;
  return items.filter((item) => {
    const priorityMatch = priorityFilter === 'all' || (item.priority || 'none') === priorityFilter;
    const statusMatch = statusFilter === 'all' || (item.status || 'not_started') === statusFilter;
    let dateMatch = true;
    if (dateFilter && dateFilter !== 'all') {
      const d = item.dueDate ? new Date(item.dueDate) : null;
      if (dateFilter === 'has-date') dateMatch = !!d;
      else if (dateFilter === 'no-date') dateMatch = !d;
    }
    const tagMatch =
      tagFilter.length === 0 || (item.tagIds || []).some((t) => tagFilter.includes(t));
    return priorityMatch && statusMatch && dateMatch && tagMatch;
  });
}

export function sortTasks<T extends TodoItem>(items: T[], sortBy: SortBy = 'date'): T[] {
  return [...items].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    switch (sortBy) {
      case 'date':
        return (
          (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) -
          (b.dueDate ? new Date(b.dueDate).getTime() : Infinity)
        );
      case 'priority': {
        const po: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3, undefined: 3 };
        return (po[a.priority || 'undefined'] ?? 3) - (po[b.priority || 'undefined'] ?? 3);
      }
      case 'name':
        return (a.text || '').localeCompare(b.text || '');
      case 'created':
        return parseInt(b.id) - parseInt(a.id);
      default:
        return 0;
    }
  });
}

export function filterAndSortTasks<T extends TodoItem>(items: T[], opts: TaskFilterOptions): T[] {
  return sortTasks(filterTasks(items, opts), opts.sortBy);
}
