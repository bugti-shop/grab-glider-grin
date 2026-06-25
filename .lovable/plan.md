# 100k-Task Performance Refactor — Phased Plan

Scope is large (Today, Upcoming, TaskHistory, Calendar day-view, Folder views, Smart lists) and touches the most sensitive screen in the app. Shipping it all in one turn would risk regressions to swipe gestures, drag-to-reorder, selection mode, and grouping. I'll ship in 4 small phases, each independently safe to ship.

## Foundation (this turn)

1. New shared component `src/components/tasks/FlatTaskList.tsx`:
   - Powered by `@tanstack/react-virtual` (already installed).
   - Renders a *flat* row list: parent tasks and (when needed) inline subtasks as separate rows, with a small "↳ Parent name" chip on subtask rows instead of indentation.
   - Stable row heights for fastest virtualization; one-line compact mode supported.
   - Accepts a single `items: TodoItem[]` flat array + a `renderRow` slot for swipe wrappers, so each surface keeps its own actions.
2. New shared selector `src/utils/tasks/flattenTasks.ts`:
   - Memo-friendly: given `TodoItem[]`, returns `{ flat, indexById, parentChipById }` in O(n).
   - Used everywhere so all surfaces share one flattening pass.
3. New `src/hooks/useFlatTaskIndex.ts`:
   - Caches the flat index across renders; invalidates on `tasksUpdated`.

## Phase 2 — Today

- Replace the existing nested `renderTodoItem` walk with `FlatTaskList`.
- Folder chips, section headers, and the "add task" bar stay above the virtualized list.
- Swipe actions move into a `TaskRow` wrapper passed to `FlatTaskList`.

## Phase 3 — Upcoming, TaskHistory, Calendar day-view

- Each page swaps its list for `FlatTaskList`. The shared flattener already gives them the parent-chip rows.

## Phase 4 — Folder views & Smart lists

- Same swap inside the folder detail and smart-list renderers.
- Add a one-time IndexedDB index on `(folder_id, completed, due_date)` in `taskStorage` so 100k-row queries return in <50ms.

## Technical notes

- Realtime sync stays unchanged; the new list reads from the same `loadTasksFromDB` cache.
- Drag-to-reorder is preserved on folder chips but disabled inside the virtualized task list (it doesn't scale to 100k rows). Reorder still works via the existing "Move" sheet and per-folder sort.
- Nesting is dropped from the *visual list* per your choice; opening a parent still shows its subtasks in the existing detail sheet.

## What I'll do right now

Phase 1 only — foundation files, with no behavior change to existing screens. Then I'll ship Phase 2 (Today) next turn so you can verify the new list end-to-end before I touch the other surfaces.
