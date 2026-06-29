/**
 * Fractional indexing for drag-and-drop reorder.
 *
 * The key idea: instead of storing `order: 1, 2, 3, ...` and renumbering every
 * row on each reorder (O(n) writes, full-list PUT), store a `rank: number`
 * and on every drop pick a value strictly between the two neighbors. A single
 * row's rank changes, so each reorder is ONE row write — that's how the
 * client can sync 5,000-task reorders with a single PATCH.
 *
 * Collisions / precision exhaustion are handled by `needsRebalance` + the
 * background `rebalanceRanks` call which re-spaces an entire section at
 * `1024` intervals. In practice this is needed extremely rarely (after
 * ~50 consecutive midpoints between the same pair of ranks).
 */

export const RANK_STEP = 1024;
export const RANK_REBALANCE_THRESHOLD = 1e-4;

/**
 * Compute a new rank that sorts strictly between `before` and `after`.
 * Either side may be `undefined` when dropping at the head or tail.
 */
export function rankBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 0;
  if (before === undefined) return (after as number) - RANK_STEP;
  if (after === undefined) return before + RANK_STEP;
  return (before + after) / 2;
}

export function needsRebalance(before: number | undefined, after: number | undefined): boolean {
  if (before === undefined || after === undefined) return false;
  return Math.abs(after - before) < RANK_REBALANCE_THRESHOLD;
}

/**
 * Re-space a sorted id list at `RANK_STEP` intervals. O(n) writes, ONLY run
 * when `needsRebalance` fires for the section — i.e. ranks have been bisected
 * to the point that double-precision floats can no longer fit a midpoint.
 */
export function rebalanceRanks(orderedIds: readonly string[]): Record<string, number> {
  const next: Record<string, number> = {};
  for (let i = 0; i < orderedIds.length; i += 1) next[orderedIds[i]] = i * RANK_STEP;
  return next;
}

/**
 * arrayMove without mutation — used by the optimistic UI path so we can hand
 * the new id order to React in one shot.
 */
export function arrayMove<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to) return items.slice();
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
