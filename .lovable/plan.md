# Plan: Inbox folders, hard completed-section separation, hello-pangea DnD, 38-task cap

## 1. Strict completed vs incomplete separation

**Problem:** completed tasks sometimes flash/stay in the incomplete list because the lightweight in-place mutation in `useTodayActions` skips reconciliation on lists > `COMPLETION_RECONCILE_MAX_ITEMS`.

**Fix in `src/hooks/useTodayActions.ts` + `src/pages/todo/Today.tsx`:**
- Drop the "skip reconcile on large lists" branch. Always partition `tasks` into `incomplete` and `completed` arrays via a single O(n) pass memoized on `tasks` + a `completedVersion` counter that bumps per batch.
- Pass `incomplete` to the active `FlatTaskList` and `completed` to the Completed section. Completed tasks never reach the incomplete renderer regardless of timing.
- Keep the local `FlatCompletionToggle` ring animation, but on flush move the row id into a `recentlyCompletedIds` Set so the partitioner removes it from incomplete instantly while persistence runs in the background.

## 2. Completion speed pass

- Replace the 250 ms `COMPLETION_BATCH_MS` with a microtask-flushed queue: collect IDs in a ref, flush in `queueMicrotask` for UI state + `requestIdleCallback` (fallback `setTimeout 0`) for IndexedDB write.
- `bulkUpdateTasksInDB` already batches; call it once per flush with `{ completed: true, completedAt }`.
- Cloud push stays on its existing 6 s debounce.

## 3. @hello-pangea/dnd integration (task lists only)

- `bun add @hello-pangea/dnd`.
- New `src/components/tasks/DndTaskList.tsx` wraps `DragDropContext` + `Droppable` + `Draggable`. Reuses existing `MemoRowBody` for row content so the visual style is unchanged.
- Keep `useWindowVirtualizer`: hello-pangea supports virtual lists via `renderClone` — implement the documented virtualized pattern so 5k+ tasks still render windowed.
- Replace usages in `FlatTaskList.tsx` (Today/Upcoming/folder views). Eisenhower, notes, folders, habits keep their current behavior.
- Delete the custom touch lifecycle (long-press, midpoint detection, transparency override) from `FlatTaskList.tsx` — hello-pangea handles touch + mouse + a11y itself.
- On `onDragEnd`, call existing sparse-rank reorder util (`taskOrderStorage.reorder`) so persistence path is unchanged.
- E2E tests under `e2e/` updated to use hello-pangea's `data-rbd-*` selectors.

## 4. Inbox-as-default-folder model

**Data:**
- Add `is_default boolean default false` + `kind text check (kind in ('tasks','notes'))` to existing `folders` table (migration). Each user gets exactly two default rows: one Inbox (kind=tasks), one Inbox (kind=notes).
- Bootstrap on app init (`src/utils/folderStorage.ts`): if user has zero folders of a kind, create the default Inbox locally + cloud. Name editable, color/icon editable.

**Behavior:**
- Remove "All Tasks" and "All Notes" aggregate views from sidebars/dropdowns. The folder picker shows only real folders, with Inbox first.
- New tasks/notes created without an explicit folder go to the matching Inbox.
- Inbox is deletable **only** when at least one other folder of the same kind exists. On delete, move all contents into the first remaining folder (sorted by `createdAt`).
- Rename: just a name edit; `is_default` flag persists so the folder keeps "default destination" semantics.

**Fallback (per user clarification):**
- If a user truly has zero folders of a kind (e.g. just deleted the last one before Inbox bootstrap ran, or legacy data with no folders), the list view falls back to showing all tasks/notes of that kind so nothing is invisible. As soon as any folder exists, the fallback turns off.

**Migration of existing data:**
- One-time client migration on first load post-update: if user has unfoldered tasks/notes, create their Inbox and assign those orphans to it. Items already inside user folders (Work, Personal, etc.) are left alone — Inbox shows only its own items per user direction.

## 5. 38-tasks-per-folder cap

- New helper `assertFolderCapacity(folderId, kind)` in `src/utils/folderStorage.ts` counts items via the existing O(1) `tasksCacheIndex` (and equivalent for notes).
- Enforced on: create task/note, move task/note into folder, drag-reorder into folder.
- On breach: toast "Folder is full (38 max). Move or delete items, or create a new folder." and abort the write. No silent truncation.
- Applies to Inbox too.

## 6. Files touched

```text
src/hooks/useTodayActions.ts                    completion queue + partition
src/pages/todo/Today.tsx                        wire completed/incomplete split
src/components/tasks/FlatTaskList.tsx           swap drag impl for DndTaskList
src/components/tasks/DndTaskList.tsx            NEW
src/components/tasks/MemoRowBody.tsx            unchanged visual
src/utils/folderStorage.ts                      Inbox bootstrap, cap helper, delete-merge
src/utils/taskStorage.ts                        capacity check on create/move
src/utils/noteStorage.ts                        capacity check on create/move
src/components/SmartListsDropdown.tsx           remove "All Tasks"
src/pages/Notes.tsx + notes sidebar             remove "All Notes", Inbox-first
supabase/migrations/*                           folders.is_default, folders.kind
e2e/today-tasks-perf.perf.spec.ts               hello-pangea selectors
e2e/touch-drag-regression.spec.ts               hello-pangea selectors
```

## 7. Out of scope (per your answers)

- Smart lists (Today / Upcoming / Eisenhower) keep aggregating across all folders.
- Notes/folders/habits drag remains on current implementation.
- No "All Tasks/Notes" view is preserved anywhere.

Approve and I'll implement in this order: (1) completed-section separation + speed, (2) hello-pangea swap, (3) Inbox model + migration, (4) 38-cap enforcement.