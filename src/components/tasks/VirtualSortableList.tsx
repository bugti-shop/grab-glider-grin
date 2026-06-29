/**
 * Virtualized, accessible drag-and-drop list — scales to 5,000+ rows.
 *
 * Architecture summary (matches /.lovable/plan.md):
 *
 *   ┌─ @dnd-kit/core  (DndContext + sensors + DragOverlay) ──────────┐
 *   │                                                                 │
 *   │  ┌─ SortableContext(items=ALL ids, strategy=verticalListSort.) │
 *   │  │                                                              │
 *   │  │   ┌─ @tanstack/react-virtual ─────────────────────────────┐ │
 *   │  │   │   only the ~20–30 visible rows are mounted, each wraps │ │
 *   │  │   │   useSortable(). Off-screen ids remain valid sort      │ │
 *   │  │   │   targets via SortableContext, but they pay zero       │ │
 *   │  │   │   render cost.                                         │ │
 *   │  │   └────────────────────────────────────────────────────────┘ │
 *   │  └──────────────────────────────────────────────────────────────┘
 *   └──────────────────────────────────────────────────────────────────┘
 *
 *   - Drop math: optimistic `arrayMove` → caller persists ONE rank
 *     (`onReorder(fromIndex, toIndex, { id, beforeId, afterId })`).
 *   - Sensors: Pointer (6px activation) + Touch (200ms delay, 8px tol) +
 *     Keyboard (Space pick up, ↑/↓ move, Space drop, Esc cancel).
 *   - A11y: dnd-kit's built-in `announcements` are wired to an aria-live
 *     region announcing "Picked up X. Moved to position N of TOTAL".
 *   - Collision detection: pointerWithin → closestCenter, filtered to
 *     currently-mounted rows so 5k phantom items don't trigger O(n) rect
 *     work per pointermove.
 */
import { useCallback, useMemo, useRef, useState, useEffect, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { arrayMove } from '@/utils/dnd/fractionalRank';

export interface VirtualSortableItem {
  id: string;
  /** Human-readable label used in screen-reader announcements. */
  label?: string;
}

export interface VirtualSortableReorderInfo {
  /** Item being moved. */
  id: string;
  /** Index in the new ordering, after the move is applied. */
  toIndex: number;
  /** Id immediately before the moved item in the new order (or undefined at head). */
  beforeId: string | undefined;
  /** Id immediately after the moved item in the new order (or undefined at tail). */
  afterId: string | undefined;
}

export interface VirtualSortableListProps<T extends VirtualSortableItem> {
  /** Full ordered dataset. Lives in memory; only the window is rendered. */
  items: readonly T[];
  /** Render one row. Receives drag state so callers can dim/lift the source row. */
  renderRow: (item: T, index: number, isDragging: boolean) => ReactNode;
  /** Optional ghost renderer for the DragOverlay portal. Defaults to renderRow. */
  renderOverlay?: (item: T) => ReactNode;
  /** Fixed row height. Use a tight estimate — the virtualizer re-measures. */
  rowHeight?: number;
  /** Window-render buffer (default 8). */
  overscan?: number;
  /** Fixed list height. When omitted, fills 100% of the parent. */
  maxHeight?: number | string;
  /** Stable reorder callback. Caller persists ONE rank (see writeQueue). */
  onReorder: (fromIndex: number, toIndex: number, info: VirtualSortableReorderInfo) => void;
  /** Optional empty state. */
  emptyState?: ReactNode;
  className?: string;
}

const overlayStyle: CSSProperties = {
  cursor: 'grabbing',
  boxShadow: '0 12px 28px hsl(var(--foreground) / 0.22), 0 0 0 2px hsl(var(--primary))',
  borderRadius: 8,
  background: 'hsl(var(--background))',
  pointerEvents: 'none',
};

/**
 * Single sortable row. Memoized via `useSortable` semantics — only re-renders
 * when its own transform/transition changes or when the row index moves.
 */
function SortableRow<T extends VirtualSortableItem>({
  item,
  index,
  rowHeight,
  start,
  renderRow,
  measureRef,
}: {
  item: T;
  index: number;
  rowHeight: number;
  start: number;
  renderRow: VirtualSortableListProps<T>['renderRow'];
  measureRef: (el: HTMLElement | null) => void;
}) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({
    id: item.id,
    // Re-measure animations are handled by the DragOverlay; skip per-row
    // transforms on the windowed siblings so virtualizer math stays clean.
    animateLayoutChanges: () => false,
  });

  const style: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    transform: `translate3d(0, ${start}px, 0)`,
    minHeight: rowHeight,
    // Hide (not unmount) the source row so the virtualizer's geometry stays
    // stable while the DragOverlay clone is on screen.
    visibility: isDragging ? 'hidden' : 'visible',
    transition,
    touchAction: 'manipulation',
  };

  const composedRef = useCallback(
    (el: HTMLElement | null) => {
      setNodeRef(el);
      measureRef(el);
    },
    [setNodeRef, measureRef],
  );

  // We deliberately ignore `transform` from useSortable for the windowed
  // sibling rows: shifting their CSS transform would fight the virtualizer's
  // `translate3d(0, start, 0)` and produce jitter at >1k items. Visual feedback
  // for the moving row is provided by the DragOverlay clone.
  void transform;
  void CSS;

  return (
    <div
      ref={composedRef}
      data-index={index}
      data-sortable-id={item.id}
      style={style}
      {...attributes}
      {...listeners}
    >
      {renderRow(item, index, isDragging)}
    </div>
  );
}

export function VirtualSortableList<T extends VirtualSortableItem>({
  items,
  renderRow,
  renderOverlay,
  rowHeight = 56,
  overscan = 8,
  maxHeight,
  onReorder,
  emptyState,
  className,
}: VirtualSortableListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const idToIndex = useMemo(() => {
    const m = new Map<string, number>();
    ids.forEach((id, i) => m.set(id, i));
    return m;
  }, [ids]);

  const sensors = useSensors(
    // Desktop: small activation distance prevents drags from firing on a click.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Mobile: long-press so vertical scroll wins by default.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: (i) => items[i]?.id ?? i,
  });

  /**
   * Mounted-only collision detection. For 5k items the default would walk
   * every droppable rect; we restrict to currently-rendered rows since
   * off-screen items can never be the active drop target on a pointer event.
   */
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const visibleIds = new Set<UniqueIdentifier>(
      virtualizer.getVirtualItems().map((vi) => items[vi.index]?.id).filter(Boolean) as string[],
    );
    const restricted = {
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => visibleIds.has(c.id)),
    };
    const pointer = pointerWithin(restricted);
    if (pointer.length > 0) return pointer;
    return closestCenter(restricted);
  }, [items, virtualizer]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const from = idToIndex.get(String(active.id));
      const to = idToIndex.get(String(over.id));
      if (from === undefined || to === undefined) return;

      const reorderedIds = arrayMove(ids, from, to);
      const beforeId = to > 0 ? reorderedIds[to - 1] : undefined;
      const afterId = to < reorderedIds.length - 1 ? reorderedIds[to + 1] : undefined;

      onReorder(from, to, { id: String(active.id), toIndex: to, beforeId, afterId });
    },
    [ids, idToIndex, onReorder],
  );

  const handleDragCancel = useCallback(() => setActiveId(null), []);

  const announcements: Announcements = useMemo(() => ({
    onDragStart: ({ active }) => {
      const item = items[idToIndex.get(String(active.id)) ?? -1];
      return `Picked up task ${item?.label ?? active.id}.`;
    },
    onDragOver: ({ active, over }) => {
      if (!over) return undefined;
      const overIndex = idToIndex.get(String(over.id));
      const item = items[idToIndex.get(String(active.id)) ?? -1];
      if (overIndex == null) return undefined;
      return `Task ${item?.label ?? active.id} is over position ${overIndex + 1} of ${items.length}.`;
    },
    onDragEnd: ({ active, over }) => {
      if (!over) return `Dropped task ${active.id}. No change.`;
      const overIndex = idToIndex.get(String(over.id));
      const item = items[idToIndex.get(String(active.id)) ?? -1];
      return `Dropped task ${item?.label ?? active.id} at position ${(overIndex ?? 0) + 1} of ${items.length}.`;
    },
    onDragCancel: ({ active }) => `Reordering of task ${active.id} cancelled.`,
  }), [items, idToIndex]);

  // Lock body scroll on touch while dragging — prevents the page from
  // pan-scrolling when the user holds and moves.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (activeId == null) return;
    document.body.classList.add('flowist-task-dragging');
    return () => { document.body.classList.remove('flowist-task-dragging'); };
  }, [activeId]);

  if (items.length === 0 && emptyState) return <>{emptyState}</>;

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const activeItem = activeId != null ? items[idToIndex.get(String(activeId)) ?? -1] : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      autoScroll={{ threshold: { x: 0, y: 0.15 } }}
    >
      <div
        ref={parentRef}
        className={className}
        data-flowist-virtual-list="sortable"
        data-virt-overscan={overscan}
        data-virt-row-count={items.length}
        style={{
          height: maxHeight ?? '100%',
          overflowX: 'hidden',
          overflowY: 'auto',
          contain: 'layout paint',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          touchAction: activeId != null ? 'none' : 'pan-y',
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div style={{ height: totalSize, position: 'relative', width: '100%' }}>
            {virtualItems.map((vi) => {
              const item = items[vi.index];
              if (!item) return null;
              return (
                <SortableRow
                  key={item.id}
                  item={item}
                  index={vi.index}
                  rowHeight={rowHeight}
                  start={vi.start}
                  renderRow={renderRow}
                  measureRef={virtualizer.measureElement}
                />
              );
            })}
          </div>
        </SortableContext>
      </div>

      {typeof document !== 'undefined' && createPortal(
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
          {activeItem ? (
            <div style={overlayStyle}>
              {(renderOverlay ?? ((it: T) => renderRow(it, idToIndex.get(it.id) ?? 0, false)))(activeItem)}
            </div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
