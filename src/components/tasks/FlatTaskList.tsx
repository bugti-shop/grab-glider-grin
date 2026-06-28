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
import { toast } from 'sonner';
import type { TodoItem } from '@/types/note';
import { flattenTasks, type FlatTaskRow, type FlatTaskIndex } from '@/utils/tasks/flattenTasks';
import { logPerfEvent, startScopedScrollFpsMonitor } from '@/utils/perfLogger';
import { getAdaptiveOverscan, useVirtualizationSettings } from '@/utils/virtualizationSettings';

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
  const [parentTop, setParentTop] = useState(0);
  const dragFromRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const autoscrollRafRef = useRef<number | null>(null);
  const dragGenerationRef = useRef(0);

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

  const tickAutoscroll = useCallback((clientY: number) => {
    const EDGE = 80;
    const SPEED = 18;
    const vh = window.innerHeight;
    let dy = 0;
    if (clientY < EDGE) dy = -SPEED * ((EDGE - clientY) / EDGE);
    else if (clientY > vh - EDGE) dy = SPEED * ((clientY - (vh - EDGE)) / EDGE);
    if (dy !== 0) {
      const scroller = resolvedUseWindow ? window : parentRef.current;
      if (scroller && 'scrollBy' in scroller) (scroller as Window | HTMLElement).scrollBy({ top: dy });
    }
    autoscrollRafRef.current = requestAnimationFrame(() => tickAutoscroll(clientY));
  }, [resolvedUseWindow]);

  const cancelDrag = useCallback(() => {
    dragGenerationRef.current += 1;
    stopAutoscroll();
    dragFromRef.current = null;
    setDragOverIndex(null);
  }, [stopAutoscroll]);

  const finishReorder = useCallback((from: number | null, to: number, via: 'drop' | 'blank-drop') => {
    cancelDrag();
    if (from == null || from < 0 || from >= flat.length || to < 0 || to >= flat.length) {
      toast.error('Could not move task', { id: 'task-reorder' });
      logPerfEvent('reorder', { list: 'tasks', via, ok: false, reason: 'invalid-target', from, to, count: flat.length });
      return;
    }
    if (from === to) return;
    if (!onReorder) return;
    const start = performance.now();
    try {
      onReorder(from, to);
      logPerfEvent('reorder', { list: 'tasks', via, ok: true, from, to, count: flat.length, ms: Math.round(performance.now() - start) });
      toast.success('Task moved', { id: 'task-reorder', duration: 900 });
    } catch (error) {
      logPerfEvent('reorder', { list: 'tasks', via, ok: false, from, to, count: flat.length, error: String((error as Error)?.message ?? error) });
      toast.error('Could not move task', { id: 'task-reorder' });
    }
  }, [cancelDrag, flat.length, onReorder]);

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

  const dndEnabled = !!onReorder;

  return (
    <div
      ref={parentRef}
      className={className}
      data-flowist-virtual-list="tasks"
      data-virt-overscan={resolvedOverscan}
      data-virt-row-height={resolvedRowHeight}
      data-virt-windowing={resolvedUseWindow ? 'window' : 'container'}
      onDragOver={dndEnabled ? (e) => {
        if (dragFromRef.current == null) return;
        e.preventDefault();
        try { e.dataTransfer.dropEffect = 'move'; } catch {}
      } : undefined}
      onDrop={dndEnabled ? (e) => {
        if (dragFromRef.current == null) return;
        e.preventDefault();
        e.stopPropagation();
        const targetEl = (e.target as HTMLElement | null)?.closest?.('[data-index]') as HTMLElement | null;
        let to = Number(targetEl?.dataset?.index);
        if (!Number.isFinite(to)) {
          const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-index]'));
          let nearest = Math.max(0, flat.length - 1);
          let nearestDistance = Number.POSITIVE_INFINITY;
          for (const rowEl of rows) {
            const rect = rowEl.getBoundingClientRect();
            const distance = Math.abs(e.clientY - (rect.top + rect.height / 2));
            if (distance < nearestDistance) {
              nearestDistance = distance;
              nearest = Number(rowEl.dataset.index);
            }
          }
          to = Number.isFinite(nearest) ? nearest : Math.max(0, flat.length - 1);
        }
        finishReorder(dragFromRef.current, to, 'blank-drop');
      } : undefined}
      onDragLeave={dndEnabled ? (e) => {
        const next = e.relatedTarget as Node | null;
        if (!next || !e.currentTarget.contains(next)) {
          const gen = dragGenerationRef.current;
          window.setTimeout(() => {
            if (dragGenerationRef.current === gen && dragFromRef.current != null) cancelDrag();
          }, 80);
        }
      } : undefined}
      style={
        resolvedUseWindow
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
          const isDragOver = dragOverIndex === vi.index;
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              data-active={isActive ? 'true' : 'false'}
              ref={virtualizer.measureElement}
              draggable={dndEnabled}
              onDragStart={dndEnabled ? (e) => {
                dragGenerationRef.current += 1;
                dragFromRef.current = vi.index;
                try {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(vi.index));
                  e.dataTransfer.setData('application/x-flowist-task-index', String(vi.index));
                } catch {}
              } : undefined}
              onDragOver={dndEnabled ? (e) => {
                if (dragFromRef.current == null) return;
                e.preventDefault();
                try { e.dataTransfer.dropEffect = 'move'; } catch {}
                setDragOverIndex(vi.index);
                stopAutoscroll();
                autoscrollRafRef.current = requestAnimationFrame(() => tickAutoscroll(e.clientY));
              } : undefined}
              onDragLeave={dndEnabled ? () => {
                setDragOverIndex((cur) => (cur === vi.index ? null : cur));
              } : undefined}
              onDrop={dndEnabled ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                const payload = Number(e.dataTransfer.getData('application/x-flowist-task-index') || e.dataTransfer.getData('text/plain'));
                const from = Number.isFinite(payload) ? payload : dragFromRef.current;
                finishReorder(from, vi.index, 'drop');
              } : undefined}
              onDragEnd={dndEnabled ? cancelDrag : undefined}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                contain: 'layout paint style',
                transform: `translateY(${vi.start - scrollOffset}px)`,
                boxShadow: isDragOver ? 'inset 0 2px 0 0 hsl(var(--primary))' : undefined,
                opacity: dragFromRef.current === vi.index ? 0.5 : 1,
                cursor: dndEnabled ? 'grab' : undefined,
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
