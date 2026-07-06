/**
 * Virtualized flat task list — scales to 100k+ rows at 60fps.
 *
 * Design: dumb renderer. Owners pass a flat `items` array (or a precomputed
 * `FlatTaskIndex`) and a `renderRow` slot. Per-row swipe gestures, selection
 * state, and tap handlers live inside the caller-supplied row component, so
 * every surface (Today, Upcoming, History, Calendar, Folder, Smart lists)
 * can reuse this without losing its bespoke interactions.
 *
 * Drag-and-drop:
 *   • Lists with ≤ HELLO_PANGEA_CAP rows → rendered un-virtualized with
 *     @hello-pangea/dnd for library-grade drop accuracy + a11y.
 *   • Larger virtualized lists → use the Capacitor-safe pointer-event
 *     reorder hook (usePointerDragReorder). Pointer events only — no HTML5
 *     native drag API, which is unreliable inside Android/iOS WebViews.
 *
 * Keyboard navigation:
 *   ↑ / k         → move highlight up
 *   ↓ / j         → move highlight down
 *   Enter         → fire `onActivate(row)` (open detail)
 *   Space         → fire `onToggleComplete(row)` (tasks only)
 *   Alt + ↑/↓     → reorder active row (fallback when DnD off-screen)
 * The active row gets `data-active="true"` so callers can style it.
 */
import { useRef, useMemo, useState, useEffect, useCallback, memo, type ReactNode } from 'react';
import { useVirtualizer, useWindowVirtualizer } from '@tanstack/react-virtual';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import type { TodoItem } from '@/types/note';
import { flattenTasks, type FlatTaskRow, type FlatTaskIndex } from '@/utils/tasks/flattenTasks';
import { logPerfEvent, startScopedScrollFpsMonitor } from '@/utils/perfLogger';
import { getAdaptiveOverscan, useVirtualizationSettings } from '@/utils/virtualizationSettings';
import { usePointerDragReorder } from '@/hooks/usePointerDragReorder';

/**
 * Maximum row count at which we render with @hello-pangea/dnd directly
 * (no virtualization). Beyond this cap we fall back to the windowed
 * virtualizer + the Capacitor-safe pointer drag hook, because
 * hello-pangea/dnd cannot reorder rows that are not mounted in the DOM.
 */
const HELLO_PANGEA_CAP = 200;

/**
 * Memoized row body. Skips re-rendering when the task reference, position,
 * and active state are unchanged — so completing one task in a 5k list only
 * re-renders the toggled row plus any newly-virtualized neighbors, not the
 * whole window.
 *
 * When the caller passes a `version` string (derived from per-row state slices
 * such as swipe/expand/pending flags), we compare that instead of the render
 * function reference. This lets callers use an inline `renderRow` — which
 * would otherwise change every parent re-render and defeat the memo — while
 * still guaranteeing rows repaint when their own state actually changes.
 * The latest render fn is read from `renderRef` at render time, so the closure
 * inside the row body is never stale.
 */
interface MemoRowBodyProps {
  row: FlatTaskRow;
  index: number;
  isActive: boolean;
  version?: string | number;
  renderRef: React.MutableRefObject<(row: FlatTaskRow, index: number, isActive: boolean) => ReactNode>;
  render?: (row: FlatTaskRow, index: number, isActive: boolean) => ReactNode;
}
const MemoRowBody = memo(function MemoRowBody({ row, index, isActive, renderRef }: MemoRowBodyProps) {
  return <>{renderRef.current(row, index, isActive)}</>;
}, (prev, next) => {
  if (prev.row.task !== next.row.task) return false;
  if (prev.index !== next.index) return false;
  if (prev.isActive !== next.isActive) return false;
  // Prefer explicit per-row versioning when the caller supplies it.
  if (prev.version !== undefined || next.version !== undefined) {
    return prev.version === next.version;
  }
  // Legacy path: fall back to render-fn identity comparison.
  return prev.render === next.render;
});


export interface FlatTaskListProps {
  /** Either a nested task tree (will be flattened) or an already-flat array of TodoItem. */
  items?: readonly TodoItem[];
  /** Pre-flattened index — pass this when the caller already memoized it. */
  index?: FlatTaskIndex;
  /** Estimated row height in px. Keep consistent with the rendered row. */
  rowHeight?: number;
   /** Number of rows to render outside the viewport. Automatically clamped on
    *  10k+ lists so bottom-nav switches and fast scroll stay lightweight. */
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
   * Drag/keyboard reorder handler. Receives current flat indices. Required
   * to enable drag-and-drop (either hello-pangea below the cap or the
   * pointer-event hook above it).
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
  rowHeight,
  overscan,
  maxHeight,
  useWindow,
  renderRow,
  emptyState,
  onActivate,
  onToggleComplete,
  onReorder,
  disableKeyboard = false,
  className,
}: FlatTaskListProps) {
  const [virtualizationSettings] = useVirtualizationSettings();
  const liveFlatIndex = useMemo(() => index ?? flattenTasks(items), [index, items]);
  // Drag freeze: while a drag gesture is active we keep rendering the
  // snapshot captured at drag-start so virtualization indices, row positions,
  // and DOM keys cannot shift mid-gesture (e.g. from a concurrent task
  // completion queue). Released after onReorder commits.
  const [frozenIndex, setFrozenIndex] = useState<FlatTaskIndex | null>(null);
  const flatIndex = frozenIndex ?? liveFlatIndex;
  const flat = flatIndex.flat;
  const resolvedRowHeight = rowHeight ?? virtualizationSettings.tasks.rowHeight;
  const resolvedOverscan = getAdaptiveOverscan(overscan ?? virtualizationSettings.tasks.overscan, flat.length, 'tasks');
  const resolvedUseWindow = useWindow ?? virtualizationSettings.tasks.windowing;
  const useFixedMassiveRows = flat.length >= 10_000;

  const parentRef = useRef<HTMLDivElement>(null);
  const [parentTop, setParentTop] = useState(0);

  useEffect(() => {
    if (!resolvedUseWindow) return;
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
    const t = window.setTimeout(update, 100);
    return () => {
      window.removeEventListener('resize', update);
      observer?.disconnect();
      window.clearTimeout(t);
    };
  }, [resolvedUseWindow]);

  const containerVirtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => resolvedRowHeight,
    overscan: resolvedOverscan,
    getItemKey: (i) => flat[i]?.task?.id ?? i,
  });

  const windowVirtualizer = useWindowVirtualizer({
    count: flat.length,
    estimateSize: () => resolvedRowHeight,
    overscan: resolvedOverscan,
    getItemKey: (i) => flat[i]?.task?.id ?? i,
    scrollMargin: parentTop,
  });

  const virtualizer = resolvedUseWindow ? windowVirtualizer : containerVirtualizer;
  const dndEnabled = !!onReorder;

  const [activeIndex, setActiveIndex] = useState<number>(-1);
  useEffect(() => {
    if (activeIndex >= flat.length) setActiveIndex(flat.length - 1);
  }, [flat.length, activeIndex]);

  // ----- Pointer-event drag (Capacitor-safe) for the virtualized path ------
  const handlePointerReorder = useCallback((from: number, to: number) => {
    if (!onReorder || from === to) return;
    const started = performance.now();
    try {
      onReorder(from, to);
      try { (window as any).__flowistLastTaskReorder = { ok: true, via: 'pointer-hook', from, to, count: flat.length, ms: Math.round(performance.now() - started), ts: Date.now() }; } catch {}
      logPerfEvent('reorder', { list: 'tasks', via: 'pointer-hook', ok: true, from, to, count: flat.length, ms: Math.round(performance.now() - started) });
      toast.success('Task moved', { id: 'task-reorder', duration: 900 });
    } catch (error) {
      logPerfEvent('reorder', { list: 'tasks', via: 'pointer-hook', ok: false, from, to, count: flat.length, error: String((error as Error)?.message ?? error) });
      toast.error('Could not move task', { id: 'task-reorder' });
    }
  }, [flat.length, onReorder]);

  // Id → index map built from the LIVE list (not the frozen snapshot) so
  // the hook can resolve the dragged row's current index right at drop time,
  // even if completion-queue churn shifted indices during the gesture.
  const liveIdIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    const live = liveFlatIndex.flat;
    for (let i = 0; i < live.length; i++) {
      const id = live[i]?.task?.id;
      if (id != null) m.set(String(id), i);
    }
    return m;
  }, [liveFlatIndex]);
  const getItemId = useCallback((i: number) => flat[i]?.task?.id ?? null, [flat]);
  const resolveIndexById = useCallback((id: string | number) => {
    const found = liveIdIndexMap.get(String(id));
    return found == null ? -1 : found;
  }, [liveIdIndexMap]);
  const handleDragStart = useCallback(() => {
    // Freeze the rendered list at the snapshot present when the drag began.
    setFrozenIndex(liveFlatIndex);
  }, [liveFlatIndex]);
  const handleDragEnd = useCallback(() => {
    // Release the freeze on the next frame so the post-reorder state can
    // paint cleanly without a flicker back to the stale snapshot.
    requestAnimationFrame(() => setFrozenIndex(null));
  }, []);

  const pointerDrag = usePointerDragReorder({
    itemCount: flat.length,
    onReorder: handlePointerReorder,
    disabled: !dndEnabled,
    getItemId,
    resolveIndexById,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
  });

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
      if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        if (onReorder && activeIndex >= 0 && flat[activeIndex]) {
          const delta = e.key === 'ArrowDown' ? 1 : -1;
          const target = activeIndex + delta;
          if (target >= 0 && target < flat.length) {
            e.preventDefault();
            try {
              const started = performance.now();
              onReorder(activeIndex, target);
              logPerfEvent('reorder', { list: 'tasks', via: 'keyboard', ok: true, from: activeIndex, to: target, count: flat.length, ms: Math.round(performance.now() - started) });
              toast.success('Task moved', { id: 'task-reorder', duration: 900 });
            } catch (error) {
              logPerfEvent('reorder', { list: 'tasks', via: 'keyboard', ok: false, from: activeIndex, to: target, count: flat.length, error: String((error as Error)?.message ?? error) });
              toast.error('Could not move task', { id: 'task-reorder' });
            }
            setActiveIndex(target);
            virtualizer.scrollToIndex(target, { align: 'auto' });
          }
        }
        return;
      }
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
  }, [disableKeyboard, move, activeIndex, flat, onActivate, onToggleComplete, onReorder, virtualizer]);

  useEffect(() => {
    const target = resolvedUseWindow ? window : parentRef.current;
    if (!target) return;
    return startScopedScrollFpsMonitor(target, 'FlatTaskList', {
      itemCount: flat.length,
      overscan: resolvedOverscan,
      rowHeight: resolvedRowHeight,
      windowing: resolvedUseWindow ? 'window' : 'container',
    });
  }, [flat.length, resolvedOverscan, resolvedRowHeight, resolvedUseWindow]);

  if (flat.length === 0 && emptyState) return <>{emptyState}</>;

  // -------- @hello-pangea/dnd path (≤ HELLO_PANGEA_CAP, non-virtualized) ---
  // When the list fits under the cap, render every row directly so
  // hello-pangea/dnd owns the drag lifecycle. Library-grade drop accuracy,
  // native keyboard reorder (Space → ↑/↓ → Space), and a11y announcements.
  if (dndEnabled && flat.length > 0 && flat.length <= HELLO_PANGEA_CAP) {
    const lockBodyScroll = () => {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      document.documentElement.style.overflow = 'hidden';
    };
    const unlockBodyScroll = () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
      document.documentElement.style.overflow = '';
    };
    const onDragStart = () => {
      lockBodyScroll();
    };
    const onDragEnd = (result: DropResult) => {
      unlockBodyScroll();
      const from = result.source.index;
      const to = result.destination?.index;
      if (to == null || to === from) return;
      const start = performance.now();
      try {
        onReorder!(from, to);
        try { (window as any).__flowistLastTaskReorder = { ok: true, via: 'hello-pangea', from, to, count: flat.length, ms: Math.round(performance.now() - start), ts: Date.now() }; } catch {}
        logPerfEvent('reorder', { list: 'tasks', via: 'hello-pangea', ok: true, from, to, count: flat.length, ms: Math.round(performance.now() - start) });
        toast.success('Task moved', { id: 'task-reorder', duration: 900 });
      } catch (error) {
        logPerfEvent('reorder', { list: 'tasks', via: 'hello-pangea', ok: false, from, to, count: flat.length, error: String((error as Error)?.message ?? error) });
        toast.error('Could not move task', { id: 'task-reorder' });
      }
    };
    return (
      <div
        ref={parentRef}
        className={className}
        data-flowist-virtual-list="tasks"
        data-virt-windowing="hello-pangea"
        data-virt-row-count={flat.length}
      >
        <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <Droppable droppableId="flat-task-list">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                {flat.map((row, i) => {
                  const key = String(row.task?.id ?? i);
                  const isActive = i === activeIndex;
                  return (
                    <Draggable key={key} draggableId={key} index={i}>
                      {(dragProvided, snapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          data-index={i}
                          data-active={isActive ? 'true' : 'false'}
                          style={{
                            ...dragProvided.draggableProps.style,
                            backgroundColor: 'hsl(var(--background))',
                            boxShadow: snapshot.isDragging
                              ? '0 8px 24px hsl(var(--foreground) / 0.18), inset 0 0 0 2px hsl(var(--primary))'
                              : undefined,
                            cursor: snapshot.isDragging ? 'grabbing' : 'grab',
                          }}
                        >
                          <MemoRowBody row={row} index={i} isActive={isActive} render={renderRow} />
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>
    );
  }
  // -------- end @hello-pangea/dnd path -------------------------------------

  // -------- Virtualized + usePointerDragReorder path -----------------------
  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const scrollOffset = resolvedUseWindow ? parentTop : 0;

  return (
    <div
      ref={parentRef}
      className={className}
      data-flowist-virtual-list="tasks"
      data-virt-overscan={resolvedOverscan}
      data-virt-row-height={resolvedRowHeight}
      data-virt-windowing={resolvedUseWindow ? 'window' : 'container'}
      data-virt-fixed-rows={useFixedMassiveRows ? 'true' : 'false'}
      style={
        resolvedUseWindow
          ? { position: 'relative', width: '100%', WebkitOverflowScrolling: 'touch', overflowAnchor: 'none' }
          : {
              height: maxHeight ?? '100%',
              overflowX: 'hidden',
              overflowY: 'auto',
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
          const isBeingDragged = pointerDrag.draggingIndex === vi.index;
          const itemProps = dndEnabled ? pointerDrag.getItemProps(vi.index) : null;
          const handleProps = dndEnabled ? pointerDrag.getHandleProps(vi.index) : null;
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              data-active={isActive ? 'true' : 'false'}
              {...(itemProps ?? {})}
              {...(handleProps ?? {})}
              ref={useFixedMassiveRows ? undefined : virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: useFixedMassiveRows ? resolvedRowHeight : undefined,
                overflow: useFixedMassiveRows ? 'hidden' : undefined,
                contain: 'layout paint style',
                containIntrinsicSize: `${resolvedRowHeight}px auto`,
                transform: `translateY(${vi.start - scrollOffset}px)`,
                // Source row is dimmed by the hook (opacity) while dragged;
                // we additionally hide its hit area via the hook's pointer-
                // events override. Visual styles below stay untouched.
                backgroundColor: 'hsl(var(--background))',
                boxShadow: isBeingDragged
                  ? '0 8px 24px hsl(var(--foreground) / 0.18), inset 0 0 0 2px hsl(var(--primary))'
                  : undefined,
                opacity: 1,
                willChange: 'transform',
                cursor: dndEnabled ? (isBeingDragged ? 'grabbing' : 'grab') : undefined,
                // pan-y keeps vertical list scroll working; the pointer hook
                // arms via long-press and aborts cleanly on scroll-like motion.
                touchAction: dndEnabled ? (pointerDrag.isDragging ? 'none' : 'pan-y') : undefined,
                ...((itemProps?.style ?? {}) as React.CSSProperties),
                ...((handleProps?.style ?? {}) as React.CSSProperties),
              }}
            >
              <MemoRowBody row={row} index={vi.index} isActive={isActive} render={renderRow} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
