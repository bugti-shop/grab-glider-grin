/**
 * Memoized flat task index. Recomputes only when the input array reference
 * changes (callers should pass the same array unless data actually changed).
 */
import { useMemo } from 'react';
import type { TodoItem } from '@/types/note';
import { flattenTasks, type FlatTaskIndex } from '@/utils/tasks/flattenTasks';

export function useFlatTaskIndex(items: readonly TodoItem[] | undefined | null): FlatTaskIndex {
  return useMemo(() => flattenTasks(items), [items]);
}
