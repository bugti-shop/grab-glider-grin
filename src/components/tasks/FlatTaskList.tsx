/**
 * Virtualized flat task list — scales to 100k+ rows at 60fps.
 *
 * Design: dumb renderer. Owners pass a flat `items` array (or a precomputed
 * `FlatTaskIndex`) and a `renderRow` slot. Per-row swipe gestures, selection
 * state, and tap handlers live inside the caller-supplied row component, so
 * every surface (Today, Upcoming, History, Calendar, Folder, Smart lists)
 * can reuse this without losing its bespoke interactions.
 */
import { useRef, useMemo, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TodoItem } from '@/types/note';
import { flattenTasks, type FlatTaskRow, type FlatTaskIndex } from '@/utils/tasks/flattenTasks';

export interface FlatTaskListProps {
  /** Either a nested task tree (will be flattened) or an already-flat array of TodoItem. */
  items?: readonly TodoItem[];
  /** Pre-flattened index — pass this when the caller already memoized it. */
  index?: FlatTaskIndex;
  /** Estimated row height in px. Keep consistent with the rendered row. */
  rowHeight?: number;
  /** Number of rows to render outside the viewport (default 8). */
  overscan?: number;
  /** Optional fixed max-height (defaults to viewport-driven). */
  maxHeight?: number | string;
  /** Per-row renderer. Must return a single element of fixed height. */
  renderRow: (row: FlatTaskRow, index: number) => ReactNode;
  /** Optional empty-state when there are zero rows. */
  emptyState?: ReactNode;
  className?: string;
}

export function FlatTaskList({
  items,
  index,
  rowHeight = 56,
  overscan = 8,
  maxHeight,
  renderRow,
  emptyState,
  className,
}: FlatTaskListProps) {
  const flatIndex = useMemo(() => index ?? flattenTasks(items), [index, items]);
  const flat = flatIndex.flat;

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: (i) => flat[i]?.task?.id ?? i,
  });

  if (flat.length === 0 && emptyState) return <>{emptyState}</>;

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div
      ref={parentRef}
      className={className}
      style={{
        height: maxHeight ?? '100%',
        overflow: 'auto',
        contain: 'strict',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{ height: totalSize, position: 'relative', width: '100%' }}>
        {virtualItems.map((vi) => {
          const row = flat[vi.index];
          if (!row) return null;
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vi.start}px)`,
              }}
            >
              {renderRow(row, vi.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
