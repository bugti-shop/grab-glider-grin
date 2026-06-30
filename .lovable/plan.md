# Habit Tracker Expansion

Nine missing pieces, grouped by where they touch. All work stays inside the existing habit feature; no other modules change. Realtime sync continues through `storeBridge.pushHabits` automatically since we only add fields to the existing `Habit` record.

## 1. Type & storage changes (`src/types/habit.ts`)

Add the following optional fields so old habits keep working:

- `kind?: 'build' | 'avoid'` — default `'build'` (existing behavior). `'avoid'` is the bad-habit mode.
- `reminders?: HabitReminder[]` — new array. Keep legacy `reminder` for back-compat; migration on load merges single → array.
- `chainAfterHabitId?: string` — "after habit X" stack link.
- `parentSectionId?: string` on `HabitSection` — enables nested sections (one level of nesting; matches notes folders).
- `HabitReminder` gains `days?: number[]` (0–6) for per-weekday times. Empty/undefined = every day.

No DB migration is required: the `habits` table already stores the full habit JSON via `storeBridge` mappers, so new fields ride along inside the existing blob column. Confirm by reading `src/utils/cloudSync/mappers.ts` before shipping; if any field is whitelisted explicitly we extend that mapper.

## 2. Amount-based logging (`src/pages/todo/HabitDetail.tsx`)

When `habit.goalType === 'amount'`:

- Replace the binary "Tap to check in" pill with a counter card: `−` button, big number `current / goalAmount goalUnit`, `+` button, plus a "Set custom" inline input.
- Each tap writes `HabitCompletionRecord { date, amount, completed: amount >= goalAmount, status: completed ? 'done' : undefined }`.
- Calendar dots show partial fill (ring with % when `amount < goalAmount`, solid when complete).
- `Habits.tsx` row: tapping the circle increments by 1 instead of cycling status; long-press still cycles.

## 3. Daily note / reflection

- Add a "Reflection" sheet (reuse `Dialog`) opened from a small pencil button next to the check-in card in `HabitDetail.tsx`.
- Stores `note` on today's `HabitCompletionRecord` (creating the record if missing, even when not completed).
- Calendar day cells with a note get a tiny dot indicator; tapping a past day opens a read-only sheet with that day's note and completion status.

## 4. Auto-popup log dialog

- In `HabitDetail.tsx` `toggleToday` and `Habits.tsx` `cycleStatus`, after a successful `done` transition, if `habit.autoPopupLog` is true, open the Reflection sheet automatically (debounced so undo doesn't reopen it).
- For amount habits, popup fires only when the goal is reached.

## 5. Weekly "N days per week" mode

- `Habits.tsx` `isHabitDueOn`: when `frequency === 'weekly'`, `weeklyDays` is empty, and `weeklyCount > 0`, treat the habit as due **every day until the weekly quota is met** for the current ISO week (Mon–Sun). Show a small "2 / 5 this week" pill on the row.
- `HabitNew.tsx`: the existing weekly-count input remains; clarify copy: "Any N days per week".

## 6. Target-day progress bar

In `HabitDetail.tsx` hero area (below the name/quote), when `goalDays > 0`:

- Render `Progress` bar with `value = completedDays / goalDays * 100`.
- Caption "Day {completedDays} of {goalDays}". On completion, show a one-time "Goal reached" toast + confetti (reuse existing celebration component if present, else simple toast).

## 7. Bad habits ("avoid" mode)

- In `HabitNew.tsx`, add a segmented toggle at the top of the form: **Build** vs **Avoid**.
- Saves `kind: 'avoid'`.
- In avoid mode:
  - Check-in label becomes "I avoided it today".
  - Status cycle becomes: `null → avoided (green check) → slipped (red X) → null`. Internally `avoided` maps to `status:'done'+completed:true`; `slipped` maps to `status:'failed'`. This keeps streak math working.
  - Detail page hero copy shows "Days clean: {streak}" and "Best clean streak: {bestStreak}".

## 8. Habit chains / stacking

- `HabitNew.tsx`: add "Stack after" selector → pick another habit by id; stored in `chainAfterHabitId`.
- `Habits.tsx`: when the parent habit gets a `done` check-in for the day, fire a one-shot local toast + (on native) `LocalNotifications.schedule` 5 seconds later: "Next up: {child.name}". Also bring the child habit to the top of its section visually for the rest of the day.
- Detail page shows "After: {parent.name}" caption.

## 9. Multiple reminders + per-weekday times

- `HabitNew.tsx`: replace the single time picker with a `RemindersList`:
  - Rows: time + day chips (S M T W T F S, all-selected = "Every day") + delete.
  - `+ Add reminder` button (no hard cap; soft cap 5).
- `habitReminders.ts`:
  - `scheduleHabitReminder(habit)` iterates `habit.reminders ?? (habit.reminder ? [habit.reminder] : [])`.
  - Each reminder becomes one notification per selected weekday on native (Capacitor `LocalNotifications` supports `schedule.on.weekday`). Web fallback uses one timer per reminder, re-armed on fire, gated by today's weekday.
  - `cancelHabitReminder(id)` cancels all `notificationIds` recorded on the habit (extend `HabitReminder.notificationIds` to be set per-occurrence).

## 10. Nested folder/tag organization for sections

- `habitSectionsStorage.ts`: add `parentSectionId?: string` to `HabitSection`; helpers `getChildren(parentId)`, `getRootSections()`.
- `HabitSections.tsx` (manager): allow choosing a parent when editing/creating, with a single nesting level (validated to prevent cycles).
- `Habits.tsx`: render parent section → indented children below it; collapse state shared via the existing `collapsed` map. Empty parents still render if any descendant has visible habits.
- `HabitNew.tsx` section picker shows indented children with `›` separator (e.g. "Health › Morning").

## Technical Notes

- Files touched: `src/types/habit.ts`, `src/utils/habitSectionsStorage.ts`, `src/utils/habitReminders.ts`, `src/utils/habitStorage.ts` (small migration helper that converts `reminder` → `reminders[]` on read, idempotent), `src/pages/todo/Habits.tsx`, `src/pages/todo/HabitDetail.tsx`, `src/pages/todo/HabitNew.tsx`, `src/pages/todo/HabitSections.tsx`.
- New small components: `src/components/habits/HabitAmountCounter.tsx`, `src/components/habits/HabitReflectionSheet.tsx`, `src/components/habits/RemindersList.tsx`.
- Sync: confirm `src/utils/cloudSync/mappers.ts` passes the full habit JSON. If it whitelists fields, extend the whitelist with `kind`, `reminders`, `chainAfterHabitId`, and `parentSectionId` on `HabitSection`. No SQL migration needed because columns already store JSON payloads.
- Back-compat: legacy single `reminder` is read on load and copied into `reminders[]` once; legacy field kept until next save.
- Streak math (`calculateStreak`, `getCompletionRate`) keeps using `completed === true`, so amount habits and avoid habits both work without changes.
- Capacity gate (`requireCapacity('habits', …)`) is untouched.
- After implementation: `tsgo` for type check, then a Playwright smoke that creates a build habit + an avoid habit + an amount habit and verifies the three different check-in UIs render.

## Out of Scope

- Stats page / heatmap / archive view / color picker / import / widget / AI suggestions — flagged earlier but not in this batch.
