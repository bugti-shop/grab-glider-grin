/**
 * Window-virtualized notes grid. Renders the exact same card markup the
 * user already designed, but only paints rows currently in the viewport so
 * the UI stays identical and fast from 1 → 100,000 notes.
 *
 * Drag-and-drop reorder uses the SHARED insertion-index helper
 * (`computeInsertionPlacement`) — same blue-line math as FlatTaskList —
 * so the drop slot is always exactly where the indicator paints.
 */
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer, useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Note } from '@/types/note';
import { logPerfEvent, startScopedScrollFpsMonitor } from '@/utils/perfLogger';
import { getAdaptiveOverscan, useVirtualizationSettings } from '@/utils/virtualizationSettings';
import { computeInsertionPlacement, excludeIndex, type MeasuredRow } from '@/utils/dnd/insertionPlacement';

interface NotesVirtualGridProps {
  notes: Note[];
  renderCard: (note: Note) => ReactNode;
  getRowKey?: (row: Note[], index: number) => string;
  /** Approximate row height in px. Cards are roughly equal because the
   *  text is line-clamped to 4 lines + fixed header/footer chrome. */
  estimatedRowHeight?: number;
  /** Optional reorder callback. When supplied, NotesVirtualGrid attaches
   *  drag-over/drop listeners on each card and computes the insertion
   *  index via the SHARED helper so the blue line matches the drop slot
   *  1:1 with FlatTaskList. */
  onReorderByInsertion?: (draggedNoteId: string, insertionIndex: number) => void;
}

function getColumnsForWidth(w: number): number {
  if (w >= 1280) return 3; // xl
  if (w >= 1024) return 2; // lg
  return 1; // mobile/tablet — original full-width note card UI
}

export function NotesVirtualGrid({
  notes,
  renderCard,
  getRowKey,
  estimatedRowHeight,
  onReorderByInsertion,
}: NotesVirtualGridProps) {
  const [virtualizationSettings] = useVirtualizationSettings();
  const parentRef = useRef<HTMLDivElement>(null);
  const insertLineRef = useRef<HTMLDivElement>(null);
  const dragSourceIndexRef = useRef<number | null>(null);
  const lastInsertionIndexRef = useRef<number | null>(null);
  const [columns, setColumns] = useState<number>(() =>
    typeof window === 'undefined' ? 2 : getColumnsForWidth(window.innerWidth),
  );
  const resolvedRowHeight = estimatedRowHeight ?? virtualizationSettings.notes.rowHeight;
  const resolvedOverscan = getAdaptiveOverscan(virtualizationSettings.notes.overscan, notes.length);
  const resolvedWindowing = virtualizationSettings.notes.windowing;

  useEffect(() => {
    const onResize = () => setColumns(getColumnsForWidth(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const rows = useMemo(() => {
    const out: Note[][] = [];
    for (let i = 0; i < notes.length; i += columns) {
      out.push(notes.slice(i, i + columns));
    }
    return out;
  }, [notes, columns]);

  // Offset accounts for the page header + filters that sit above this grid.
  const [scrollMargin, setScrollMargin] = useState(0);
  useEffect(() => {
    const measure = () => {
      const el = parentRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setScrollMargin(top);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [columns, notes.length]);

  const containerVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => resolvedRowHeight,
    overscan: resolvedOverscan,
    getItemKey: (idx) => getRowKey?.(rows[idx] ?? [], idx) ?? rows[idx]?.[0]?.id ?? idx,
  });

  const windowVirtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => resolvedRowHeight,
    overscan: resolvedOverscan,
    scrollMargin,
    getItemKey: (idx) => getRowKey?.(rows[idx] ?? [], idx) ?? rows[idx]?.[0]?.id ?? idx,
  });

  const virtualizer = resolvedWindowing ? windowVirtualizer : containerVirtualizer;

  useEffect(() => {
    logPerfEvent('render', {
      label: 'NotesVirtualGrid',
      itemCount: notes.length,
      rows: rows.length,
      columns,
      overscan: resolvedOverscan,
      rowHeight: resolvedRowHeight,
      windowing: resolvedWindowing ? 'window' : 'container',
    });
  }, [columns, notes.length, resolvedOverscan, resolvedRowHeight, resolvedWindowing, rows.length]);

  useEffect(() => {
    const target = resolvedWindowing ? window : parentRef.current;
    if (!target) return;
    return startScopedScrollFpsMonitor(target, 'NotesVirtualGrid', {
      itemCount: notes.length,
      overscan: resolvedOverscan,
      rowHeight: resolvedRowHeight,
      windowing: resolvedWindowing ? 'window' : 'container',
    });
  }, [notes.length, resolvedOverscan, resolvedRowHeight, resolvedWindowing]);

  /** Snapshot every rendered card's rect so the shared helper can resolve
   *  the insertion slot with the SAME math FlatTaskList uses. */
  const measureCards = useCallback((): MeasuredRow[] => {
    const parent = parentRef.current;
    if (!parent) return [];
    const parentRect = parent.getBoundingClientRect();
    const scrollTop = resolvedWindowing ? 0 : parent.scrollTop;
    const baseTop = resolvedWindowing ? scrollMargin : parentRect.top;
    return Array.from(parent.querySelectorAll<HTMLElement>('[data-note-index]'))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const index = Number(el.dataset.noteIndex);
        return {
          index,
          rect: { top: rect.top, bottom: rect.bottom, height: rect.height },
          topRelativeToList: rect.top - baseTop + scrollTop,
        } as MeasuredRow;
      })
      .filter((row) => Number.isFinite(row.index))
      .sort((a, b) => a.index - b.index);
  }, [resolvedWindowing, scrollMargin]);

  const paintInsertLine = useCallback((top: number) => {
    const el = insertLineRef.current;
    if (!el) return;
    el.style.transform = `translateY(${top}px)`;
    el.style.opacity = '1';
  }, []);

  const hideInsertLine = useCallback(() => {
    const el = insertLineRef.current;
    if (!el) return;
    el.style.opacity = '0';
  }, []);

  const handleCardDragStart = useCallback((noteId: string, flatIndex: number) => {
    dragSourceIndexRef.current = flatIndex;
    lastInsertionIndexRef.current = null;
    try {
      (window as any).__flowistLastNoteDrag = { noteId, fromIndex: flatIndex, ts: Date.now() };
    } catch {}
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!onReorderByInsertion) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const measured = excludeIndex(measureCards(), dragSourceIndexRef.current);
    if (measured.length === 0) {
      hideInsertLine();
      return;
    }
    const placement = computeInsertionPlacement(e.clientY, measured, notes.length);
    lastInsertionIndexRef.current = placement.insertionIndex;
    paintInsertLine(placement.top);
    try {
      (window as any).__flowistLastNoteInsert = {
        insertionIndex: placement.insertionIndex,
        top: Math.round(placement.top),
        source: placement.source,
        pointerY: Math.round(e.clientY),
      };
    } catch {}
  }, [hideInsertLine, measureCards, notes.length, onReorderByInsertion, paintInsertLine]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!onReorderByInsertion) return;
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/html') || e.dataTransfer.getData('text/plain');
    hideInsertLine();
    const insertionIndex = lastInsertionIndexRef.current;
    dragSourceIndexRef.current = null;
    lastInsertionIndexRef.current = null;
    if (!draggedId || insertionIndex == null) return;
    onReorderByInsertion(draggedId, insertionIndex);
  }, [hideInsertLine, onReorderByInsertion]);

  const handleDragEnd = useCallback(() => {
    dragSourceIndexRef.current = null;
    lastInsertionIndexRef.current = null;
    hideInsertLine();
  }, [hideInsertLine]);

  return (
    <div
      ref={parentRef}
      data-flowist-virtual-list="notes"
      data-virt-overscan={resolvedOverscan}
      data-virt-row-height={resolvedRowHeight}
      data-virt-windowing={resolvedWindowing ? 'window' : 'container'}
      onDragOver={onReorderByInsertion ? handleDragOver : undefined}
      onDrop={onReorderByInsertion ? handleDrop : undefined}
      onDragEnd={onReorderByInsertion ? handleDragEnd : undefined}
      style={resolvedWindowing
        ? { position: 'relative' }
        : { position: 'relative', height: 'min(72vh, 900px)', overflow: 'auto', WebkitOverflowScrolling: 'touch', contain: 'layout paint', overscrollBehavior: 'contain' }
      }
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {onReorderByInsertion && (
          <div
            ref={insertLineRef}
            data-flowist-insert-line="notes"
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              borderRadius: 2,
              background: 'hsl(var(--primary))',
              transform: 'translateY(-9999px)',
              opacity: 0,
              transition: 'opacity 120ms ease-out',
              pointerEvents: 'none',
              zIndex: 30,
            }}
          />
        )}
        {virtualizer.getVirtualItems().map((vrow) => {
          const row = rows[vrow.index];
          if (!row) return null;
          return (
            <div
              key={vrow.key}
              data-index={vrow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vrow.start - (resolvedWindowing ? scrollMargin : 0)}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: '0.75rem',
                paddingBottom: '0.75rem',
                contain: 'layout paint style',
                containIntrinsicSize: `${resolvedRowHeight}px auto`,
              } as React.CSSProperties}
            >
              {row.map((note, colIdx) => {
                const flatIndex = vrow.index * columns + colIdx;
                return (
                  <div
                    key={note.id}
                    data-note-index={flatIndex}
                    data-note-id={note.id}
                    onDragStart={onReorderByInsertion ? () => handleCardDragStart(note.id, flatIndex) : undefined}
                    style={{ minWidth: 0 }}
                  >
                    {renderCard(note)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
