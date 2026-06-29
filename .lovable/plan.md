# Virtualized DnD at 5,000 Tasks — Architecture Plan

Replaces the current dual-path (`@hello-pangea/dnd` ≤500 + custom virtualized drag) in `FlatTaskList.tsx` with a single `@dnd-kit` + `@tanstack/react-virtual` pipeline that scales to 5k items and beyond, with fractional-rank persistence.

## 1. Rendering layer — virtualization stays in charge

- Keep `@tanstack/react-virtual` as the windowing engine (already used in `FlatTaskList`, `VirtualizedTaskList`). Only ~20–30 rows render.
- Single code path for all sizes — drop `HELLO_PANGEA_CAP` and the custom drag lifecycle. One mental model, one set of bugs.
- Row height stays dynamic via `measureElement`; overscan from `virtualizationSettings.ts`.

## 2. DnD layer — @dnd-kit, data-driven

- `DndContext` with `PointerSensor` (activation distance 6px desktop) + `TouchSensor` (delay 200ms, tolerance 8px) + `KeyboardSensor` for a11y.
- `SortableContext` fed the **full ordered ID array** (all 5,000 ids — cheap, strings only). Items not in the window are still valid sort targets.
- Custom collision detection: `pointerWithin` first, fall back to `closestCenter` filtered to currently-mounted rows (avoids O(n) rect work on 5k phantom nodes).
- `useSortable` runs only on rendered rows. Unmounted rows have no transform cost.
- Drag overlay via `DragOverlay` portal — source row hides with `visibility: hidden` (keeps virtualizer geometry stable).
- Auto-scroll handled by dnd-kit's built-in `autoScroll` with `threshold: { x: 0, y: 0.15 }`.

## 3. Data model — fractional ranks (already half-built)

- Reuse `SparseTaskOrder { ranks: Record<id, number> }` in `taskOrderStorage.ts`.
- On drop: compute new rank = midpoint of neighbor ranks (`(prev + next) / 2`). Single id write per reorder — no list re-indexing.
- Rebalance trigger: when `|nextRank − prevRank| < 1e-6`, run a background pass that re-spaces ranks for that section by 1024. Rare in practice.
- Tasks sorted by rank in `applyTaskOrder` (already implemented).

## 4. Optimistic UI + sync

- `onDragEnd`:
  1. `arrayMove` the in-memory id list (instant repaint).
  2. `moveTaskInSectionOrder(...)` writes the single rank to IndexedDB cache.
  3. Enqueue one `{ taskId, sectionId, rank }` PATCH via existing `writeQueue.ts` → Supabase.
- Conflict policy: last-write-wins on `(task_id, updated_at)` — matches existing `storeBridge` strategy.
- No full-list PUT, ever.

## 5. Backend shape

```text
tasks
  id uuid pk
  user_id uuid
  section_id uuid
  rank double precision        -- fractional index
  updated_at timestamptz
  index (user_id, section_id, rank)
```

Realtime subscription (already wired) streams rank changes; client merges by id.

## 6. Accessibility

- Keyboard: Space to pick up, ↑/↓ to move, Space to drop, Esc to cancel (dnd-kit defaults).
- `announcements` prop wired to a `aria-live="assertive"` region: "Picked up task X. Moved to position 12 of 5000. Dropped."
- Focus returns to dragged row's checkbox on drop.

## 7. Files touched

- `src/components/tasks/FlatTaskList.tsx` — rewrite around `DndContext` + `useVirtualizer`; remove pangea + custom touch lifecycle.
- `src/components/tasks/SortableTaskRow.tsx` — new, wraps `useSortable` for one row.
- `src/components/tasks/TaskDragOverlay.tsx` — new, rendered in `DragOverlay`.
- `src/utils/dnd/insertionPlacement.ts` — keep for unit-tested midpoint math; reused by dnd-kit collision detector.
- `src/utils/taskOrderStorage.ts` — add `rebalanceSectionRanks(sectionId)`.
- `src/hooks/useTodayActions.ts` — single-rank PATCH path on reorder.
- `e2e/dnd-scroll-400-regression.spec.ts` — extend to 5k with keyboard + touch assertions.

## 8. Out of scope (explicitly)

- No swap to `react-window` — `@tanstack/react-virtual` already covers it and is wired in.
- No removal of `@hello-pangea/dnd` from notes paths in this pass; tasks only.
- No multi-select drag (separate feature).

Approve and I'll implement.
