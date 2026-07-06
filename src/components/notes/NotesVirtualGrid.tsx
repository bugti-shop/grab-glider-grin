/**
 * Window-virtualized notes grid. Renders the exact same card markup the
 * user already designed, but only paints rows currently in the viewport so
 * the UI stays identical and fast from 1 → 100,000 notes.
 *
 * Layout: 1 column on mobile, 2 on lg, 3 on xl — chunked into rows so we
 * can virtualize with stable row heights via @tanstack/react-virtual's
 * useWindowVirtualizer (no nested scroll container = bottom nav stays put,
 * page scroll behaves natively).
 */
import { ReactNode, useEffect, useRef, useState } from 'react';
import { useVirtualizer, useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Note } from '@/types/note';
import { logPerfEvent, startScopedScrollFpsMonitor } from '@/utils/perfLogger';
import { getAdaptiveOverscan, useVirtualizationSettings } from '@/utils/virtualizationSettings';

interface NotesVirtualGridProps {
  notes: Note[];
  renderCard: (note: Note) => ReactNode;
  getRowKey?: (row: Note[], index: number) => string;
  /** Approximate row height in px. Cards are roughly equal because the
   *  text is line-clamped to 4 lines + fixed header/footer chrome. */
  estimatedRowHeight?: number;
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
}: NotesVirtualGridProps) {
  const [virtualizationSettings] = useVirtualizationSettings();
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState<number>(() =>
    typeof window === 'undefined' ? 2 : getColumnsForWidth(window.innerWidth),
  );
  const resolvedRowHeight = estimatedRowHeight ?? virtualizationSettings.notes.rowHeight;
  const resolvedOverscan = getAdaptiveOverscan(virtualizationSettings.notes.overscan, notes.length, 'notes');
  const resolvedWindowing = virtualizationSettings.notes.windowing;

  useEffect(() => {
    const onResize = () => setColumns(getColumnsForWidth(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const rowCount = Math.ceil(notes.length / columns);

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
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => resolvedRowHeight,
    overscan: resolvedOverscan,
    getItemKey: (idx) => {
      const row = notes.slice(idx * columns, idx * columns + columns);
      return getRowKey?.(row, idx) ?? row[0]?.id ?? idx;
    },
  });

  const windowVirtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => resolvedRowHeight,
    // 6 rows of overscan (≈18 cards at 3-col) keeps fast flick-scrolling
    // smooth without paying paint cost for ~50 offscreen heavy cards when
    // the user has 5k+ notes with large bodies.
    overscan: resolvedOverscan,
    scrollMargin,
    getItemKey: (idx) => {
      const row = notes.slice(idx * columns, idx * columns + columns);
      return getRowKey?.(row, idx) ?? row[0]?.id ?? idx;
    },
  });

  const virtualizer = resolvedWindowing ? windowVirtualizer : containerVirtualizer;

  useEffect(() => {
    logPerfEvent('render', {
      label: 'NotesVirtualGrid',
      itemCount: notes.length,
      rows: rowCount,
      columns,
      overscan: resolvedOverscan,
      rowHeight: resolvedRowHeight,
      windowing: resolvedWindowing ? 'window' : 'container',
    });
  }, [columns, notes.length, resolvedOverscan, resolvedRowHeight, resolvedWindowing, rowCount]);

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

  return (
    <div
      ref={parentRef}
      data-flowist-virtual-list="notes"
      data-virt-overscan={resolvedOverscan}
      data-virt-row-height={resolvedRowHeight}
      data-virt-windowing={resolvedWindowing ? 'window' : 'container'}
      style={resolvedWindowing
        ? { position: 'relative' }
        : { position: 'relative', height: 'min(72vh, 900px)', overflow: 'auto', WebkitOverflowScrolling: 'touch', contain: 'strict' }
      }
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((vrow) => {
          const row = notes.slice(vrow.index * columns, vrow.index * columns + columns);
          if (!row) return null;
          return (
            <div
              key={vrow.key}
              data-index={vrow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${resolvedRowHeight}px`,
                transform: `translateY(${vrow.start - (resolvedWindowing ? scrollMargin : 0)}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gridAutoRows: '1fr',
                alignItems: 'stretch',
                gap: '0.75rem',
                paddingBottom: '0.75rem',
                contain: 'layout paint style',
                containIntrinsicSize: `${resolvedRowHeight}px auto`,
              } as React.CSSProperties}
            >
              {row.map((note) => (
                <div key={note.id} style={{ minWidth: 0, height: '100%', display: 'flex' }}>
                  {renderCard(note)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
