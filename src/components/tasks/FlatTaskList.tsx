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
import { useRef, useMemo, useState, useEffect, useCallback, memo, type ReactNode, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer, useWindowVirtualizer } from '@tanstack/react-virtual';
import { toast } from 'sonner';
import type { TodoItem } from '@/types/note';
import { flattenTasks, type FlatTaskRow, type FlatTaskIndex } from '@/utils/tasks/flattenTasks';
import { logPerfEvent, startScopedScrollFpsMonitor } from '@/utils/perfLogger';
import { getAdaptiveOverscan, useVirtualizationSettings } from '@/utils/virtualizationSettings';

const TOUCH_LONG_PRESS_MS = 180;
const TOUCH_SCROLL_CANCEL_PX = 16;
const TOUCH_DRAG_START_PX = 18;
const TOUCH_AXIS_CANCEL_PX = 28;
const TOUCH_CANCEL_PX = 42;
const CLICK_SUPPRESS_MS = 350;

/**
 * Memoized row body. Skips re-rendering when the task reference, position,
 * and active state are unchanged — so completing one task in a 5k list only
 * re-renders the toggled row plus any newly-virtualized neighbors, not the
 * whole window.
 */
interface MemoRowBodyProps {
  row: FlatTaskRow;
  index: number;
  isActive: boolean;
  render: (row: FlatTaskRow, index: number, isActive: boolean) => ReactNode;
}
const MemoRowBody = memo(function MemoRowBody({ row, index, isActive, render }: MemoRowBodyProps) {
  return <>{render(row, index, isActive)}</>;
}, (prev, next) =>
  prev.row.task === next.row.task &&
  prev.index === next.index &&
  prev.isActive === next.isActive &&
  prev.render === next.render,
);

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
  const flatIndex = useMemo(() => index ?? flattenTasks(items), [index, items]);
  const flat = flatIndex.flat;
  const resolvedRowHeight = rowHeight ?? virtualizationSettings.tasks.rowHeight;
  const resolvedOverscan = getAdaptiveOverscan(overscan ?? virtualizationSettings.tasks.overscan, flat.length);
  const resolvedUseWindow = useWindow ?? virtualizationSettings.tasks.windowing;

  const parentRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [parentTop, setParentTop] = useState(0);
  const dragFromRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [insertIndicator, setInsertIndicator] = useState<{ insertionIndex: number; top: number } | null>(null);
  const autoscrollRafRef = useRef<number | null>(null);
  const dragGenerationRef = useRef(0);
  const suppressClickUntilRef = useRef(0);
  const ghostRafRef = useRef<number | null>(null);
  const pointerDragRef = useRef<{
    pointerId: number;
    from: number;
    over: number;
    startX: number;
    startY: number;
    lastY: number;
    startTime: number;
    currentY: number;
    dragging: boolean;
    armed: boolean;
    scrollMode: boolean;
    title: string;
    element: HTMLElement;
    timer: number | null;
  } | null>(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [pointerDrag, setPointerDrag] = useState<{ from: number; over: number; title: string; y: number } | null>(null);
  const [pointerPreparingIndex, setPointerPreparingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(pointer: coarse)');
    const update = () => setIsCoarsePointer(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

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
    // Recompute once after layout settles (fonts, images).
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
      // Alt + ↑/↓ → reorder active row (fallback for virtualized lists where DnD is off).
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

  // Native HTML5 drag-reorder. Works with virtualization because the OS owns
  // the drag image and we only listen on the live rows currently in the DOM.
  // No thread-blocking measurement of off-screen nodes → safe at 24k+ rows.
  const stopAutoscroll = useCallback(() => {
    if (autoscrollRafRef.current != null) {
      cancelAnimationFrame(autoscrollRafRef.current);
      autoscrollRafRef.current = null;
    }
  }, []);

  const stopGhostRaf = useCallback(() => {
    if (ghostRafRef.current != null) {
      cancelAnimationFrame(ghostRafRef.current);
      ghostRafRef.current = null;
    }
  }, []);

  const clearPointerDrag = useCallback(() => {
    const active = pointerDragRef.current;
    if (active?.timer != null) window.clearTimeout(active.timer);
    pointerDragRef.current = null;
    stopGhostRaf();
    setPointerDrag(null);
    setPointerPreparingIndex(null);
    if (typeof document !== 'undefined') document.body.classList.remove('flowist-task-dragging');
  }, [stopGhostRaf]);

  const tickAutoscroll = useCallback((clientY: number) => {
    const EDGE = 60;
    const SPEED = 18;
    const scrollerRect = resolvedUseWindow
      ? { top: 0, bottom: window.innerHeight }
      : parentRef.current?.getBoundingClientRect();
    if (!scrollerRect) return;
    let dy = 0;
    if (clientY < scrollerRect.top + EDGE) dy = -SPEED * ((scrollerRect.top + EDGE - clientY) / EDGE);
    else if (clientY > scrollerRect.bottom - EDGE) dy = SPEED * ((clientY - (scrollerRect.bottom - EDGE)) / EDGE);
    if (dy !== 0) {
      const scroller = resolvedUseWindow ? window : parentRef.current;
      if (scroller && 'scrollBy' in scroller) (scroller as Window | HTMLElement).scrollBy({ top: dy });
    }
    autoscrollRafRef.current = requestAnimationFrame(() => tickAutoscroll(clientY));
  }, [resolvedUseWindow]);

  const cancelDrag = useCallback(() => {
    dragGenerationRef.current += 1;
    stopAutoscroll();
    clearPointerDrag();
    dragFromRef.current = null;
    setDragOverIndex(null);
    setInsertIndicator(null);
  }, [clearPointerDrag, stopAutoscroll]);

  const armPointerDrag = useCallback((pointerId: number) => {
    const current = pointerDragRef.current;
    if (!current || current.pointerId !== pointerId || current.dragging) return;
    current.armed = true;
    current.timer = null;
    try {
      (window as any).__flowistTaskDragArmed = {
        from: current.from,
        pointerId,
        startY: Math.round(current.startY),
        ts: Date.now(),
      };
    } catch {}
  }, []);

  const finishReorder = useCallback((from: number | null, insertionIndex: number, via: 'drop' | 'blank-drop' | 'pointer-drop') => {
    cancelDrag();
    if (from == null || from < 0 || from >= flat.length || insertionIndex < 0 || insertionIndex > flat.length) {
      try { (window as any).__flowistLastTaskReorder = { ok: false, reason: 'invalid-target', via, from, insertionIndex, count: flat.length, ts: Date.now() }; } catch {}
      toast.error('Could not move task', { id: 'task-reorder' });
      logPerfEvent('reorder', { list: 'tasks', via, ok: false, reason: 'invalid-target', from, to: insertionIndex, count: flat.length });
      return;
    }
    if (from === insertionIndex || from + 1 === insertionIndex) {
      try { (window as any).__flowistLastTaskReorder = { ok: true, skipped: true, reason: 'same-position', via, from, insertionIndex, count: flat.length, ts: Date.now() }; } catch {}
      return;
    }
    if (!onReorder) {
      try { (window as any).__flowistLastTaskReorder = { ok: false, reason: 'missing-handler', via, from, insertionIndex, count: flat.length, ts: Date.now() }; } catch {}
      return;
    }
    const to = insertionIndex > from ? insertionIndex - 1 : insertionIndex;
    if (from === to) {
      try { (window as any).__flowistLastTaskReorder = { ok: true, skipped: true, reason: 'same-index', via, from, to, insertionIndex, count: flat.length, ts: Date.now() }; } catch {}
      return;
    }
    const start = performance.now();
    try {
      onReorder(from, to);
      try { (window as any).__flowistLastTaskReorder = { ok: true, via, from, to, insertionIndex, count: flat.length, ms: Math.round(performance.now() - start), ts: Date.now() }; } catch {}
      logPerfEvent('reorder', { list: 'tasks', via, ok: true, from, to, count: flat.length, ms: Math.round(performance.now() - start) });
      toast.success('Task moved', { id: 'task-reorder', duration: 900 });
    } catch (error) {
      try { (window as any).__flowistLastTaskReorder = { ok: false, reason: 'exception', via, from, to, insertionIndex, count: flat.length, error: String((error as Error)?.message ?? error), ts: Date.now() }; } catch {}
      logPerfEvent('reorder', { list: 'tasks', via, ok: false, from, to, count: flat.length, error: String((error as Error)?.message ?? error) });
      toast.error('Could not move task', { id: 'task-reorder' });
    }
  }, [cancelDrag, flat.length, onReorder]);

  const getVirtualInsertionFromClientY = useCallback((clientY: number) => {
    const rows = virtualizer.getVirtualItems();
    if (rows.length === 0) return { insertionIndex: 0, top: 0 };

    const parentRect = parentRef.current?.getBoundingClientRect();
    const scrollTop = resolvedUseWindow ? window.scrollY : (parentRef.current?.scrollTop ?? 0);

    for (const item of rows) {
      const top = resolvedUseWindow
        ? item.start - window.scrollY
        : (parentRect?.top ?? 0) + item.start - scrollTop;
      const center = top + item.size / 2;
      if (clientY < center) {
        return { insertionIndex: item.index, top: resolvedUseWindow ? item.start - parentTop : item.start };
      }
    }

    const last = rows[rows.length - 1];
    return {
      insertionIndex: Math.min(flat.length, (last?.index ?? flat.length - 1) + 1),
      top: (resolvedUseWindow ? (last?.start ?? 0) - parentTop : (last?.start ?? 0)) + (last?.size ?? resolvedRowHeight),
    };
  }, [flat.length, parentTop, resolvedRowHeight, resolvedUseWindow, virtualizer]);

  const getRowTopRelativeToList = useCallback((rowEl: HTMLElement) => {
    const rect = rowEl.getBoundingClientRect();
    const parentRect = parentRef.current?.getBoundingClientRect();
    return rect.top - (parentRect?.top ?? 0) + (resolvedUseWindow ? 0 : (parentRef.current?.scrollTop ?? 0));
  }, [resolvedUseWindow]);

  const commitSyntheticDragOver = useCallback((target: EventTarget | Element | null, insertionIndex: number) => {
    try {
      (window as any).__flowistLastTaskDragOverPrevented = {
        target: target instanceof Element ? (target.closest('[data-index]') ? 'row' : 'list-gap') : 'document',
        insertionIndex,
        ts: Date.now(),
      };
    } catch {}
  }, []);

  const getInsertionPlacement = useCallback((clientY: number, target: EventTarget | Element | null) => {
    const targetEl = target instanceof Element ? target.closest('[data-index]') as HTMLElement | null : null;
    const rows = Array.from(parentRef.current?.querySelectorAll<HTMLElement>('[data-index]') ?? [])
      .map((rowEl) => ({ rowEl, index: Number(rowEl.dataset.index), rect: rowEl.getBoundingClientRect() }))
      .filter((row) => Number.isFinite(row.index))
      .sort((a, b) => a.index - b.index);

    const buildDebug = (
      source: string,
      row: (typeof rows)[number],
      insertionIndex: number,
      extra: Record<string, unknown> = {},
    ) => ({
      source,
      targetIndex: row.index,
      insertionIndex,
      pointerY: Math.round(clientY),
      targetTop: Math.round(row.rect.top),
      targetBottom: Math.round(row.rect.bottom),
      midpoint: Math.round(row.rect.top + row.rect.height / 2),
      ...extra,
    });

    const placeBefore = (row: (typeof rows)[number], source = targetEl ? 'target-row' : 'gap-before-row', extra?: Record<string, unknown>) => {
      const insertionIndex = Math.max(0, Math.min(flat.length, row.index));
      return {
        insertionIndex,
        top: getRowTopRelativeToList(row.rowEl),
        debug: buildDebug(source, row, insertionIndex, extra),
      };
    };

    const placeAfter = (row: (typeof rows)[number], source = targetEl ? 'target-row' : 'gap-after-row', extra?: Record<string, unknown>) => {
      const insertionIndex = Math.max(0, Math.min(flat.length, row.index + 1));
      return {
        insertionIndex,
        top: getRowTopRelativeToList(row.rowEl) + row.rect.height,
        debug: buildDebug(source, row, insertionIndex, extra),
      };
    };

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const next = rows[i + 1];
      if (clientY < row.rect.top) return placeBefore(row);
      if (clientY <= row.rect.bottom) {
        return clientY < row.rect.top + row.rect.height / 2 ? placeBefore(row) : placeAfter(row);
      }
      if (next && clientY > row.rect.bottom && clientY < next.rect.top) {
        // Correct drops in the blank virtualized gap between two rendered rows
        // using getBoundingClientRect midpoints, Todoist-style.
        const prevMid = row.rect.top + row.rect.height / 2;
        const nextMid = next.rect.top + next.rect.height / 2;
        const split = (prevMid + nextMid) / 2;
        return clientY < split
          ? placeAfter(row, 'gap-midpoint-prev', { nextIndex: next.index, split: Math.round(split) })
          : placeBefore(next, 'gap-midpoint-next', { previousIndex: row.index, split: Math.round(split) });
      }
    }

    if (rows.length > 0) {
      let nearest = rows[0];
      let nearestDistance = Math.abs(clientY - (nearest.rect.top + nearest.rect.height / 2));
      for (const row of rows.slice(1)) {
        const distance = Math.abs(clientY - (row.rect.top + row.rect.height / 2));
        if (distance < nearestDistance) {
          nearest = row;
          nearestDistance = distance;
        }
      }
      return clientY < nearest.rect.top + nearest.rect.height / 2
        ? placeBefore(nearest, 'nearest-midpoint-gap', { distance: Math.round(nearestDistance) })
        : placeAfter(nearest, 'nearest-midpoint-gap', { distance: Math.round(nearestDistance) });
    }

    const virtualPlacement = getVirtualInsertionFromClientY(clientY);
    return { ...virtualPlacement, debug: { source: 'virtual-fallback', pointerY: Math.round(clientY) } };
  }, [flat.length, getRowTopRelativeToList, getVirtualInsertionFromClientY]);

  const updateInsertionIndicator = useCallback((clientY: number, target: EventTarget | Element | null) => {
    const placement = getInsertionPlacement(clientY, target);
    const instrumentation = {
      insertionIndex: placement.insertionIndex,
      top: Math.round(placement.top),
      clientY: Math.round(clientY),
      ...('debug' in placement ? placement.debug : {}),
    };
    try {
      (window as any).__flowistLastTaskInsert = instrumentation;
    } catch {}
    commitSyntheticDragOver(target, placement.insertionIndex);
    setInsertIndicator((current) => {
      if (current && current.insertionIndex === placement.insertionIndex && Math.abs(current.top - placement.top) < 0.5) return current;
      return placement;
    });
    setDragOverIndex(Math.min(flat.length - 1, placement.insertionIndex));
    return placement.insertionIndex;
  }, [commitSyntheticDragOver, flat.length, getInsertionPlacement]);

  const finishPointerDropAt = useCallback((active: NonNullable<typeof pointerDragRef.current>, clientY: number, target: EventTarget | Element | null) => {
    const insertionIndex = updateInsertionIndicator(clientY, target);
    active.over = insertionIndex;
    try {
      (window as any).__flowistLastTaskDrop = {
        from: active.from,
        insertionIndex,
        clientY: Math.round(clientY),
        via: 'touch',
        insert: (window as any).__flowistLastTaskInsert,
        ts: Date.now(),
      };
    } catch {}
    logPerfEvent('reorder', {
      list: 'tasks',
      via: 'touch-drop-computed',
      from: active.from,
      insertionIndex,
      count: flat.length,
      insert: (window as any).__flowistLastTaskInsert,
    });
    finishReorder(active.from, insertionIndex, 'pointer-drop');
  }, [finishReorder, flat.length, updateInsertionIndicator]);

  const paintGhostAt = useCallback((clientY: number) => {
    if (ghostRafRef.current != null) return;
    ghostRafRef.current = requestAnimationFrame(() => {
      ghostRafRef.current = null;
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate3d(0, ${clientY}px, 0) translateY(-50%)`;
      }
    });
  }, []);

  const isInteractiveDragTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    return !!target.closest('button, input, textarea, select, a, [role="button"], [contenteditable="true"], [data-no-dnd="true"]');
  };

  const activatePointerDrag = useCallback((active: NonNullable<typeof pointerDragRef.current>) => {
    if (active.dragging) return;
    active.dragging = true;
    if (active.timer != null) {
      window.clearTimeout(active.timer);
      active.timer = null;
    }
    dragGenerationRef.current += 1;
    dragFromRef.current = active.from;
    setDragOverIndex(active.from);
    const placement = getInsertionPlacement(active.currentY, active.element);
    active.over = placement.insertionIndex;
    setInsertIndicator(placement);
    setPointerDrag({ from: active.from, over: active.over, title: active.title, y: active.currentY });
    try { active.element.setPointerCapture(active.pointerId); } catch {}
    if (typeof document !== 'undefined') document.body.classList.add('flowist-task-dragging');
    paintGhostAt(active.currentY);
    if ('vibrate' in navigator) navigator.vibrate?.(8);
  }, [getInsertionPlacement, paintGhostAt]);

  const startPointerDrag = useCallback((event: ReactPointerEvent<HTMLElement>, index: number, row: FlatTaskRow) => {
    if (!dndEnabled || event.pointerType === 'mouse' || isInteractiveDragTarget(event.target)) return;
    if (pointerDragRef.current) return;
    if (event.pointerType === 'pen' && event.buttons !== 1) return;

    const element = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const title = row.task.text || 'Task';

    const active = {
      pointerId,
      from: index,
      over: index,
      startX,
      startY,
      lastY: startY,
      startTime: performance.now(),
      currentY: startY,
      dragging: false,
      armed: false,
      scrollMode: false,
      title,
      element,
      timer: null as number | null,
    };
    pointerDragRef.current = active;
    setPointerPreparingIndex(index);

    active.timer = window.setTimeout(() => armPointerDrag(pointerId), TOUCH_LONG_PRESS_MS);
  }, [armPointerDrag, dndEnabled]);

  const startTouchDrag = useCallback((event: ReactTouchEvent<HTMLElement>, index: number, row: FlatTaskRow) => {
    // A real TouchEvent is already proof of a coarse input path. Do not gate on
    // matchMedia('(pointer: coarse)') here: Chromium/Playwright and a few
    // Android WebViews can report it late/false, which allowed drag initiation
    // visuals to work but prevented the actual drop lifecycle from starting.
    if (!dndEnabled || pointerDragRef.current || isInteractiveDragTarget(event.target)) return;
    const touch = event.touches[0];
    if (!touch) return;

    const element = event.currentTarget;
    const pointerId = touch.identifier || -1;
    const startX = touch.clientX;
    const startY = touch.clientY;
    const active = {
      pointerId,
      from: index,
      over: index,
      startX,
      startY,
      lastY: startY,
      startTime: performance.now(),
      currentY: startY,
      dragging: false,
      armed: false,
      scrollMode: false,
      title: row.task.text || 'Task',
      element,
      timer: null as number | null,
    };
    pointerDragRef.current = active;
    setPointerPreparingIndex(index);
    active.timer = window.setTimeout(() => armPointerDrag(pointerId), TOUCH_LONG_PRESS_MS);
  }, [armPointerDrag, dndEnabled]);

  const moveTouchDrag = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    const active = pointerDragRef.current;
    const touch = event.touches[0];
    if (!active || !touch || active.pointerId !== (touch.identifier || -1)) return;

    const dx = touch.clientX - active.startX;
    const dy = touch.clientY - active.startY;
    active.currentY = touch.clientY;

    if (!active.dragging) {
      if (!active.armed && Math.abs(dy) > TOUCH_SCROLL_CANCEL_PX && Math.abs(dx) < TOUCH_AXIS_CANCEL_PX) {
        if (active.timer != null) window.clearTimeout(active.timer);
        active.timer = null;
        pointerDragRef.current = null;
        setPointerPreparingIndex(null);
        return;
      }
      if (active.armed && Math.abs(dy) >= TOUCH_DRAG_START_PX && Math.abs(dx) < TOUCH_AXIS_CANCEL_PX) {
        event.preventDefault();
        activatePointerDrag(active);
      } else if (Math.abs(dx) > TOUCH_AXIS_CANCEL_PX || (!active.armed && Math.abs(dy) > TOUCH_CANCEL_PX)) {
        if (active.timer != null) window.clearTimeout(active.timer);
        pointerDragRef.current = null;
        setPointerPreparingIndex(null);
        return;
      } else {
        return;
      }
    }

    event.preventDefault();
    const over = updateInsertionIndicator(touch.clientY, document.elementFromPoint(touch.clientX, touch.clientY));
    if (over !== active.over) {
      active.over = over;
      setPointerDrag((current) => current ? { ...current, over } : current);
    }
    paintGhostAt(touch.clientY);
    stopAutoscroll();
    autoscrollRafRef.current = requestAnimationFrame(() => tickAutoscroll(touch.clientY));
  }, [activatePointerDrag, paintGhostAt, stopAutoscroll, tickAutoscroll, updateInsertionIndicator]);

  const endTouchDrag = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    const active = pointerDragRef.current;
    if (!active) return;
    if (active.timer != null) window.clearTimeout(active.timer);
    if (active.dragging) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntilRef.current = Date.now() + CLICK_SUPPRESS_MS;
      const touch = event.changedTouches[0];
      const clientY = touch?.clientY ?? active.currentY;
      const target = touch ? document.elementFromPoint(touch.clientX, touch.clientY) : event.target;
      finishPointerDropAt(active, clientY, target);
    } else {
      if (active.armed) suppressClickUntilRef.current = Date.now() + CLICK_SUPPRESS_MS;
      clearPointerDrag();
    }
  }, [clearPointerDrag, finishPointerDropAt]);

  useEffect(() => {
    const root = parentRef.current;
    if (!root || !dndEnabled) return;

    const onTouchStart = (event: TouchEvent) => {
      if (pointerDragRef.current || isInteractiveDragTarget(event.target)) return;
      const touch = event.touches[0];
      const element = event.target instanceof Element ? event.target.closest('[data-index]') as HTMLElement | null : null;
      if (!touch || !element) return;
      const index = Number(element.dataset.index);
      const row = Number.isFinite(index) ? flat[index] : undefined;
      if (!row) return;

      const pointerId = touch.identifier || -1;
      const active = {
        pointerId,
        from: index,
        over: index,
        startX: touch.clientX,
        startY: touch.clientY,
        lastY: touch.clientY,
        startTime: performance.now(),
        currentY: touch.clientY,
        dragging: false,
        armed: false,
        scrollMode: false,
        title: row.task.text || 'Task',
        element,
        timer: null as number | null,
      };
      pointerDragRef.current = active;
      setPointerPreparingIndex(index);
      active.timer = window.setTimeout(() => armPointerDrag(pointerId), TOUCH_LONG_PRESS_MS);
    };

    const onTouchMove = (event: TouchEvent) => {
      const active = pointerDragRef.current;
      const touch = event.touches[0];
      if (!active || !touch || active.pointerId !== (touch.identifier || -1)) return;

      const dx = touch.clientX - active.startX;
      const dy = touch.clientY - active.startY;
      active.currentY = touch.clientY;

      if (!active.dragging) {
        if (!active.armed && Math.abs(dy) > TOUCH_SCROLL_CANCEL_PX && Math.abs(dx) < TOUCH_AXIS_CANCEL_PX) {
          if (active.timer != null) window.clearTimeout(active.timer);
          pointerDragRef.current = null;
          setPointerPreparingIndex(null);
          return;
        }
        if (active.armed && Math.abs(dy) >= TOUCH_DRAG_START_PX && Math.abs(dx) < TOUCH_AXIS_CANCEL_PX) {
          event.preventDefault();
          activatePointerDrag(active);
        } else if (Math.abs(dx) > TOUCH_AXIS_CANCEL_PX || (!active.armed && Math.abs(dy) > TOUCH_CANCEL_PX)) {
          if (active.timer != null) window.clearTimeout(active.timer);
          pointerDragRef.current = null;
          setPointerPreparingIndex(null);
          return;
        } else {
          return;
        }
      }

      event.preventDefault();
      const over = updateInsertionIndicator(touch.clientY, document.elementFromPoint(touch.clientX, touch.clientY));
      if (over !== active.over) {
        active.over = over;
        setPointerDrag((current) => current ? { ...current, over } : current);
      }
      paintGhostAt(touch.clientY);
      stopAutoscroll();
      autoscrollRafRef.current = requestAnimationFrame(() => tickAutoscroll(touch.clientY));
    };

    const onTouchEnd = (event: TouchEvent) => {
      const active = pointerDragRef.current;
      if (!active) return;
      if (active.timer != null) window.clearTimeout(active.timer);
      if (active.dragging) {
        event.preventDefault();
        suppressClickUntilRef.current = Date.now() + CLICK_SUPPRESS_MS;
        const touch = event.changedTouches[0];
        const clientY = touch?.clientY ?? active.currentY;
        const target = touch ? document.elementFromPoint(touch.clientX, touch.clientY) : event.target;
        finishPointerDropAt(active, clientY, target);
      } else {
        if (active.armed) suppressClickUntilRef.current = Date.now() + CLICK_SUPPRESS_MS;
        clearPointerDrag();
      }
    };

    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchmove', onTouchMove, { passive: false });
    root.addEventListener('touchend', onTouchEnd, { passive: false });
    root.addEventListener('touchcancel', onTouchEnd, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', onTouchEnd, { passive: false, capture: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: false, capture: true });
    return () => {
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchmove', onTouchMove);
      root.removeEventListener('touchend', onTouchEnd);
      root.removeEventListener('touchcancel', onTouchEnd);
      document.removeEventListener('touchmove', onTouchMove, { capture: true });
      document.removeEventListener('touchend', onTouchEnd, { capture: true });
      document.removeEventListener('touchcancel', onTouchEnd, { capture: true });
    };
  }, [activatePointerDrag, armPointerDrag, clearPointerDrag, dndEnabled, finishPointerDropAt, flat, paintGhostAt, stopAutoscroll, tickAutoscroll, updateInsertionIndicator]);

  const movePointerDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const active = pointerDragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;

    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    active.currentY = event.clientY;

    if (!active.dragging) {
      // Quick movement means the user is scrolling, so cancel DnD and let the
      // browser's native pan-y scroll continue uninterrupted.
      if (!active.armed && Math.abs(dy) > TOUCH_SCROLL_CANCEL_PX && Math.abs(dx) < TOUCH_AXIS_CANCEL_PX) {
        if (active.timer != null) window.clearTimeout(active.timer);
        active.timer = null;
        pointerDragRef.current = null;
        setPointerPreparingIndex(null);
        return;
      }
      if (active.armed && Math.abs(dy) >= TOUCH_DRAG_START_PX && Math.abs(dx) < TOUCH_AXIS_CANCEL_PX) {
        event.preventDefault();
        activatePointerDrag(active);
      } else if (Math.abs(dx) > TOUCH_AXIS_CANCEL_PX || (!active.armed && Math.abs(dy) > TOUCH_CANCEL_PX)) {
        if (active.timer != null) window.clearTimeout(active.timer);
        pointerDragRef.current = null;
        setPointerPreparingIndex(null);
        return;
      } else {
        return;
      }
    }

    event.preventDefault();
    const over = updateInsertionIndicator(event.clientY, event.target);
    if (over !== active.over) {
      active.over = over;
      setPointerDrag((current) => current ? { ...current, over } : current);
    }
    paintGhostAt(event.clientY);
    stopAutoscroll();
    autoscrollRafRef.current = requestAnimationFrame(() => tickAutoscroll(event.clientY));
  }, [paintGhostAt, stopAutoscroll, tickAutoscroll, updateInsertionIndicator]);

  const endPointerDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const active = pointerDragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;

    if (active.timer != null) window.clearTimeout(active.timer);
    if (active.dragging) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntilRef.current = Date.now() + CLICK_SUPPRESS_MS;
      finishPointerDropAt(active, event.clientY, event.target);
    } else {
      if (active.armed) suppressClickUntilRef.current = Date.now() + CLICK_SUPPRESS_MS;
      clearPointerDrag();
    }
  }, [clearPointerDrag, finishPointerDropAt]);

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
      onClickCapture={dndEnabled ? (e) => {
        if (Date.now() < suppressClickUntilRef.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      } : undefined}
      onDragOver={dndEnabled ? (e) => {
        if (dragFromRef.current == null) return;
        e.preventDefault();
        try { (window as any).__flowistLastTaskDragOverPrevented = { target: 'list', ts: Date.now() }; } catch {}
        try { e.dataTransfer.dropEffect = 'move'; } catch {}
        updateInsertionIndicator(e.clientY, e.target);
        stopAutoscroll();
        autoscrollRafRef.current = requestAnimationFrame(() => tickAutoscroll(e.clientY));
      } : undefined}
      onDrop={dndEnabled ? (e) => {
        if (dragFromRef.current == null) return;
        e.preventDefault();
        e.stopPropagation();
        const to = updateInsertionIndicator(e.clientY, e.target);
        try { (window as any).__flowistLastTaskNativeDrop = { target: 'list', from: dragFromRef.current, insertionIndex: to, ts: Date.now() }; } catch {}
        finishReorder(dragFromRef.current, to, 'blank-drop');
      } : undefined}
      onDragLeave={dndEnabled ? () => {
        // Keep the active drag alive while the cursor passes over virtual gaps;
        // `dragend`/`drop` owns cleanup so valid drops are never cancelled early.
      } : undefined}
      style={
        resolvedUseWindow
          ? { position: 'relative', width: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }
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
          const isDragOver = dragOverIndex === vi.index;
          const isTouchDragCandidate = isCoarsePointer && (pointerPreparingIndex === vi.index || dragFromRef.current === vi.index);
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              data-active={isActive ? 'true' : 'false'}
              ref={virtualizer.measureElement}
              draggable={dndEnabled}
              onPointerDown={dndEnabled ? (e) => startPointerDrag(e, vi.index, row) : undefined}
              onPointerMove={dndEnabled ? movePointerDrag : undefined}
              onPointerUp={dndEnabled ? endPointerDrag : undefined}
              onPointerCancel={dndEnabled ? endPointerDrag : undefined}
              onTouchStart={dndEnabled ? (e) => startTouchDrag(e, vi.index, row) : undefined}
              onTouchMove={dndEnabled ? moveTouchDrag : undefined}
              onTouchEnd={dndEnabled ? endTouchDrag : undefined}
              onTouchCancel={dndEnabled ? endTouchDrag : undefined}
              onDragStart={dndEnabled ? (e) => {
                dragGenerationRef.current += 1;
                dragFromRef.current = vi.index;
                const placement = getInsertionPlacement(e.clientY, e.currentTarget);
                setInsertIndicator(placement);
                try {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(vi.index));
                  e.dataTransfer.setData('application/x-flowist-task-index', String(vi.index));
                  const ghost = document.createElement('div');
                  ghost.textContent = row.task.text || 'Task';
                  ghost.style.cssText = 'position:fixed;top:-1000px;left:-1000px;z-index:2147483647;max-width:320px;padding:10px 14px;border:2px solid hsl(var(--primary));border-radius:6px;background:hsl(var(--background));color:hsl(var(--foreground));font:600 14px system-ui;box-shadow:0 18px 40px hsl(var(--foreground) / 0.18);pointer-events:none;';
                  document.body.appendChild(ghost);
                  e.dataTransfer.setDragImage(ghost, 16, 20);
                  window.setTimeout(() => ghost.remove(), 0);
                } catch {}
              } : undefined}
              onDragEnter={dndEnabled ? (e) => {
                if (dragFromRef.current == null) return;
                e.preventDefault();
                try { (window as any).__flowistLastTaskDragOverPrevented = { target: 'row-enter', index: vi.index, ts: Date.now() }; } catch {}
                try { e.dataTransfer.dropEffect = 'move'; } catch {}
                updateInsertionIndicator(e.clientY, e.currentTarget);
              } : undefined}
              onDragOver={dndEnabled ? (e) => {
                if (dragFromRef.current == null) return;
                e.preventDefault();
                try { (window as any).__flowistLastTaskDragOverPrevented = { target: 'row-over', index: vi.index, ts: Date.now() }; } catch {}
                try { e.dataTransfer.dropEffect = 'move'; } catch {}
                updateInsertionIndicator(e.clientY, e.currentTarget);
                stopAutoscroll();
                autoscrollRafRef.current = requestAnimationFrame(() => tickAutoscroll(e.clientY));
              } : undefined}
              onDragLeave={dndEnabled ? () => {} : undefined}
              onDrop={dndEnabled ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                const payload = Number(e.dataTransfer.getData('application/x-flowist-task-index') || e.dataTransfer.getData('text/plain'));
                const from = Number.isFinite(payload) ? payload : dragFromRef.current;
                const to = updateInsertionIndicator(e.clientY, e.currentTarget);
                try { (window as any).__flowistLastTaskNativeDrop = { target: 'row', from, insertionIndex: to, index: vi.index, ts: Date.now() }; } catch {}
                finishReorder(from, to, 'drop');
              } : undefined}
              onDragEnd={dndEnabled ? cancelDrag : undefined}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                contain: 'layout paint style',
                transform: `translateY(${vi.start - scrollOffset}px)`,
                // While a pointer/touch drag is active, hide the source row's
                // contents so the floating ghost is the ONLY visible copy of
                // the task. This kills the "ghost looks transparent / two
                // tasks showing" effect the user reported. Keep the row's
                // layout (visibility:hidden, not display:none) so the
                // virtualizer's measured height stays stable.
                visibility: pointerDrag && dragFromRef.current === vi.index ? 'hidden' : 'visible',
                backgroundColor: 'hsl(var(--background))',
                boxShadow: isDragOver
                  ? undefined
                  : dragFromRef.current === vi.index && !pointerDrag
                    ? '0 8px 24px hsl(var(--foreground) / 0.18), inset 0 0 0 2px hsl(var(--primary))'
                    : isTouchDragCandidate
                      ? 'inset 0 0 0 2px hsl(var(--primary) / 0.7)'
                      : undefined,
                opacity: 1,
                cursor: dragFromRef.current === vi.index ? 'grabbing' : dndEnabled ? 'grab' : undefined,
                touchAction: dndEnabled ? 'pan-y' : undefined,
                willChange: dragFromRef.current === vi.index ? 'transform, box-shadow' : undefined,
              }}
            >
              <MemoRowBody row={row} index={vi.index} isActive={isActive} render={renderRow} />
            </div>
          );
        })}
        {insertIndicator && dragFromRef.current != null && (
          <div
            data-flowist-insert-line="true"
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: insertIndicator.top,
              height: 2,
              backgroundColor: 'hsl(var(--primary))',
              boxShadow: '0 0 0 1px hsl(var(--primary) / 0.35)',
              pointerEvents: 'none',
              zIndex: 60,
            }}
          />
        )}
      </div>
      {pointerDrag && typeof document !== 'undefined' && createPortal((
        <div
          ref={ghostRef}
          className="pointer-events-none fixed left-3 right-3 z-[70] rounded-md border-2 border-primary bg-background px-4 py-3 text-sm font-semibold shadow-2xl ring-4 ring-primary/20"
          style={{
            top: 0,
            transform: `translate3d(0, ${pointerDrag.y}px, 0) translateY(-50%) scale(1.02)`,
            willChange: 'transform',
            backfaceVisibility: 'hidden',
            transition: 'box-shadow 120ms ease-out',
          }}
        >
          <div className="truncate">{pointerDrag.title}</div>
        </div>
      ), document.body)}
    </div>
  );
}
