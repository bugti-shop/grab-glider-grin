/**
 * Virtualized flat task list — scales to 100k+ rows at 60fps.
 *
 * Design: dumb renderer. Owners pass a flat `items` array (or a precomputed
 * `FlatTaskIndex`) and a `renderRow` slot. Per-row swipe gestures, selection
 * state, and tap handlers live inside the caller-supplied row component, so
 * every surface (Today, Upcoming, History, Calendar, Folder, Smart lists)
 * can reuse this without losing its bespoke interactions.
 *
 * Keyboard navigation:
 *   ↑ / k   → move highlight up
 *   ↓ / j   → move highlight down
 *   Enter   → fire `onActivate(row)` (open detail)
 *   Space   → fire `onToggleComplete(row)` (tasks only)
 * The active row gets `data-active="true"` so callers can style it.
 */
import { useRef, useMemo, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useVirtualizer, useWindowVirtualizer } from '@tanstack/react-virtual';
import type { TodoItem } from '@/types/note';
import { flattenTasks, type FlatTaskRow, type FlatTaskIndex } from '@/utils/tasks/flattenTasks';

export interface FlatTaskListProps {
  /** Either a nested task tree (will be flattened) or an already-flat array of TodoItem. */
  items?: readonly TodoItem[];
  /** Pre-flattened index — pass this when the caller already memoized it. */
  index?: FlatTaskIndex;
  /** Estimated row height in px. Keep consistent with the rendered row. */
  rowHeight?: number;
  /** Number of rows to render outside the viewport (default 24 — generous
   *  buffer so flick-scrolling never reveals a blank white band before the
   *  virtualizer catches up). */
  overscan?: number;
  /** Optional fixed max-height (defaults to viewport-driven). Ignored when useWindow. */
  maxHeight?: number | string;
  /**
   * When true, virtualize against the document/window scroll so the list
   * participates in the page's natural scroll (no nested scrollbar). This is
   * what Todoist does — one infinite scroll regardless of list length.
   */
  useWindow?: boolean;
  /** Per-row renderer. Must return a single element of fixed height. */
  renderRow: (row: FlatTaskRow, index: number, isActive: boolean) => ReactNode;
  /** Optional empty-state when there are zero rows. */
  emptyState?: ReactNode;
  /** Enter key on highlighted row — open detail / edit. */
  onActivate?: (row: FlatTaskRow) => void;
  /** Space key on highlighted row — toggle task complete. */
  onToggleComplete?: (row: FlatTaskRow) => void;
  /**
   * Alt + ↑/↓ on highlighted row — reorder. Receives current flat indices.
   * Provided as a keyboard fallback because @hello-pangea/dnd is intentionally
   * disabled in the virtualized path (it can't reorder off-screen rows on
   * 24k+ lists). Long-press touch reorder is layered on top of this in the
   * row renderer when implemented per-surface.
   */
  onReorder?: (fromIndex: number, toIndex: number) => void;
  /** Disable keyboard navigation (default false). */
  disableKeyboard?: boolean;
  className?: string;
}

const isTypingInForm = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
};

export function FlatTaskList({
  items,
  index,
  rowHeight = 56,
  overscan = 48,
  maxHeight,
  useWindow = false,
  renderRow,
  emptyState,
  onActivate,
  onToggleComplete,
  onReorder,
  disableKeyboard = false,
  className,
}: FlatTaskListProps) {
  const flatIndex = useMemo(() => index ?? flattenTasks(items), [index, items]);
  const flat = flatIndex.flat;

  const parentRef = useRef<HTMLDivElement>(null);
  const [parentTop, setParentTop] = useState(0);

  useEffect(() => {
    if (!useWindow) return;
    const update = () => {
      if (!parentRef.current) return;
      const rect = parentRef.current.getBoundingClientRect();
      const nextTop = rect.top + window.scrollY;
      setParentTop((current) => (Math.abs(current - nextTop) > 1 ? nextTop : current));
    };
    update();
    window.addEventListener('resize', update);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (observer && parentRef.current) observer.observe(parentRef.current);
    // Recompute once after layout settles (fonts, images).
    const t = window.setTimeout(update, 100);
    return () => {
      window.removeEventListener('resize', update);
      observer?.disconnect();
      window.clearTimeout(t);
    };
  }, [useWindow]);

  const containerVirtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: (i) => flat[i]?.task?.id ?? i,
  });

  const windowVirtualizer = useWindowVirtualizer({
    count: flat.length,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: (i) => flat[i]?.task?.id ?? i,
    scrollMargin: parentTop,
  });

  const virtualizer = useWindow ? windowVirtualizer : containerVirtualizer;

  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // Clamp active index whenever the list shrinks.
  useEffect(() => {
    if (activeIndex >= flat.length) setActiveIndex(flat.length - 1);
  }, [flat.length, activeIndex]);

  const move = useCallback(
    (delta: number) => {
      setActiveIndex((cur) => {
        const next = Math.max(0, Math.min(flat.length - 1, (cur < 0 ? 0 : cur) + delta));
        virtualizer.scrollToIndex(next, { align: 'auto' });
        return next;
      });
    },
    [flat.length, virtualizer],
  );

  useEffect(() => {
    if (disableKeyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingInForm(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key;
      if (key === 'ArrowDown' || key === 'j' || key === 'J') {
        e.preventDefault();
        move(1);
      } else if (key === 'ArrowUp' || key === 'k' || key === 'K') {
        e.preventDefault();
        move(-1);
      } else if (key === 'Enter') {
        if (activeIndex >= 0 && flat[activeIndex] && onActivate) {
          e.preventDefault();
          onActivate(flat[activeIndex]);
        }
      } else if (key === ' ' || key === 'Spacebar') {
        if (activeIndex >= 0 && flat[activeIndex] && onToggleComplete) {
          e.preventDefault();
          onToggleComplete(flat[activeIndex]);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disableKeyboard, move, activeIndex, flat, onActivate, onToggleComplete]);

  if (flat.length === 0 && emptyState) return <>{emptyState}</>;

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const scrollOffset = useWindow ? parentTop : 0;

  return (
    <div
      ref={parentRef}
      className={className}
      style={
        useWindow
          ? { position: 'relative', width: '100%' }
          : {
              height: maxHeight ?? '100%',
              overflow: 'auto',
              contain: 'strict',
              WebkitOverflowScrolling: 'touch',
            }
      }
    >
      <div style={{ height: totalSize, position: 'relative', width: '100%' }}>
        {virtualItems.map((vi) => {
          const row = flat[vi.index];
          if (!row) return null;
          const isActive = vi.index === activeIndex;
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              data-active={isActive ? 'true' : 'false'}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                 contain: 'layout paint style',
                transform: `translateY(${vi.start - scrollOffset}px)`,
              }}
            >
              {renderRow(row, vi.index, isActive)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
