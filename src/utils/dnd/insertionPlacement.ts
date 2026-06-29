/**
 * Shared drag-and-drop insertion-index helper.
 *
 * Single source of truth for "given pointer Y over a list of rendered rows,
 * which slot does the blue line belong in, and at what `top` should it
 * paint?" — so FlatTaskList and (future) NotesVirtualGrid drag UIs always
 * compute the SAME insertion index and drop on the same visible line.
 *
 * Pure: only takes geometry, no React/DOM ownership. Callers feed in the
 * already-resolved row elements (so we don't query the DOM twice and so
 * unit tests can pass synthetic rects).
 */

export interface MeasuredRow {
  /** The row's flat-list index (e.g. data-index). */
  index: number;
  /** Live getBoundingClientRect snapshot. */
  rect: { top: number; bottom: number; height: number };
  /** Top offset relative to the scroll container, used for the blue line. */
  topRelativeToList: number;
}

export interface InsertionPlacement {
  /** Index where the dragged row should be inserted (BEFORE removal). */
  insertionIndex: number;
  /** Y position to paint the blue indicator line at. */
  top: number;
  /** Diagnostic source string — keeps perf logging consistent across lists. */
  source: string;
}

/**
 * Compute the insertion slot for pointer Y over a sorted, source-excluded
 * list of measured rows. Total item count is required so the final slot
 * (insert at end) clamps correctly.
 */
export function computeInsertionPlacement(
  clientY: number,
  rows: MeasuredRow[],
  totalCount: number,
): InsertionPlacement {
  if (rows.length === 0) {
    return { insertionIndex: 0, top: 0, source: 'empty' };
  }

  const placeBefore = (row: MeasuredRow, source: string): InsertionPlacement => ({
    insertionIndex: Math.max(0, Math.min(totalCount, row.index)),
    top: row.topRelativeToList,
    source,
  });

  const placeAfter = (row: MeasuredRow, source: string): InsertionPlacement => ({
    insertionIndex: Math.max(0, Math.min(totalCount, row.index + 1)),
    top: row.topRelativeToList + row.rect.height,
    source,
  });

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const next = rows[i + 1];
    if (clientY < row.rect.top) return placeBefore(row, 'before-row');
    if (clientY <= row.rect.bottom) {
      const mid = row.rect.top + row.rect.height / 2;
      return clientY < mid ? placeBefore(row, 'target-row-top') : placeAfter(row, 'target-row-bottom');
    }
    if (next && clientY > row.rect.bottom && clientY < next.rect.top) {
      const prevMid = row.rect.top + row.rect.height / 2;
      const nextMid = next.rect.top + next.rect.height / 2;
      const split = (prevMid + nextMid) / 2;
      return clientY < split
        ? placeAfter(row, 'gap-midpoint-prev')
        : placeBefore(next, 'gap-midpoint-next');
    }
  }

  // Past the last visible row — find nearest by midpoint distance.
  let nearest = rows[0];
  let nearestDistance = Math.abs(clientY - (nearest.rect.top + nearest.rect.height / 2));
  for (const row of rows.slice(1)) {
    const distance = Math.abs(clientY - (row.rect.top + row.rect.height / 2));
    if (distance < nearestDistance) {
      nearest = row;
      nearestDistance = distance;
    }
  }
  const mid = nearest.rect.top + nearest.rect.height / 2;
  return clientY < mid
    ? placeBefore(nearest, 'nearest-before')
    : placeAfter(nearest, 'nearest-after');
}

/**
 * Strip a row from a measured list — typically used to exclude the
 * currently-dragged source row so its visibility:hidden footprint doesn't
 * shift midpoints under the pointer.
 */
export function excludeIndex(rows: MeasuredRow[], excludedIndex: number | null | undefined): MeasuredRow[] {
  if (excludedIndex == null) return rows;
  return rows.filter((row) => row.index !== excludedIndex);
}
