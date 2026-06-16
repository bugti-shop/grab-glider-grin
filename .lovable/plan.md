
# Pro Gating & Soft Limits — Plan

Goal: make many features Pro-gated or soft-limited for Free users, show a 🔒 crown icon on each gated control, and trigger the existing `PremiumPaywall` (with dynamic capacity message) when a limit is hit. No backend changes.

## 1. SubscriptionContext — new capacity/feature keys

Extend `FREE_CAPACITY_LIMITS` in `src/contexts/SubscriptionContext.tsx`:

```
darkThemes: 1            // only 1 dark theme free
eisenhowerTasksPerQuadrant: 10
smartListsCustom: 2      // free users can save max 2 custom smart views
blocksAdvancedPerNote: 3 // total advanced blocks per note (image+file+toggle+callout+template)
calendarViews: 1         // only "month" free
batchAdvancedFields: 0   // section/priority/folder/due in batch are pro
```

Add new pro `feature` keys (string) used with `requirePro(feature)`:
- `pomodoro`
- `reading_mode`
- `extract_tasks_image`, `extract_tasks_text`, `extract_note_image`, `extract_pdf`
- `image_attachment`
- `block_image`, `block_file`, `block_template`, `block_toggle`, `block_callout`
- `batch_section`, `batch_priority`, `batch_folder`, `batch_due_date`, `batch_status`
- `dark_theme_extra`
- `calendar_view_week`, `calendar_view_day`, `calendar_view_agenda`, `calendar_view_year`
- `smart_list_pro` (for advanced smart list options)
- `notes_settings_advanced`, `tasks_default_advanced`, `note_type_visibility_advanced`

`PremiumPaywall.tsx` already maps capacity keys → message. Add labels for new `capacity_*` keys and Pro features.

## 2. Theme / Dark mode (1 free, rest Pro)

File: theme selector (find in `Settings.tsx` / `TodoSettings.tsx` / `CustomThemeSheet.tsx`).
- First dark theme in the list is free; clicking any other dark theme → `requirePro('dark_theme_extra')`.
- Render `<PremiumCrown />` next to each locked theme tile.

## 3. Pomodoro → fully Pro

File: `PomodoroTimer.tsx` + any launcher (`Today.tsx` / `TodoSettings.tsx`).
- On open / start, call `requirePro('pomodoro')`. Show crown on entry button.

## 4. Eisenhower Matrix — soft limit

File: `src/pages/todo/EisenhowerMatrix.tsx`.
- Limit: free users can place max `10` tasks per quadrant. When dropping/creating beyond → `requireCapacity('eisenhowerTasksPerQuadrant', countInQuadrant)`.
- Show crown badge on quadrant header once full.

## 5. Smart Lists (task dashboard menu)

Files: `SmartListsDropdown.tsx`, `SaveSmartViewSheet.tsx`, `src/utils/customSmartViews.ts`.
- Built-in smart lists stay free.
- Saving a *custom* smart view: `requireCapacity('smartListsCustom', currentCustomCount)` (limit 2).
- Advanced filter options (multi-tag, multi-folder, date range) → `requirePro('smart_list_pro')` + crown.

## 6. Notes / Tasks history → fully free

Confirm and remove any Pro gating from `TaskHistory.tsx`, `NoteVersionHistorySheet.tsx`.

## 7. Image attachments → Pro

`TaskInputSheet.tsx`, `TaskDetailPage.tsx`, `NoteAttachmentsSection.tsx`, `NoteEditor.tsx`.
- Replace existing daily-attachment soft cap for *images* with `requirePro('image_attachment')`. (Keep `attachmentsPerDay` for other file types if user still wants it — confirm assumption: only image attach goes Pro.)
- Crown on the "add image" button.

## 8. Slash-command blocks in RichTextEditor

File: `RichTextEditor.tsx` (slash menu).
- Free: `/heading`, `/table`, `/bullet`, `/bold`.
- Pro (per-insert `requirePro`): `/image` → `block_image`, `/file` → `block_file`, `/template` → `block_template`, `/toggle` → `block_toggle`, `/callout` → `block_callout`.
- Soft limit for advanced blocks total: `requireCapacity('blocksAdvancedPerNote', advancedBlockCountInNote)` (3) — applied before the `requirePro` check so heavy free users still see the paywall earlier.
- Render lock icon next to each Pro slash entry.

## 9. Extract features → fully Pro

Files: `ImageTaskExtractorSheet.tsx`, `ScanNoteSheet.tsx`, any "extract from PDF / text" entry.
- Wrap trigger handlers with `requirePro('extract_*')`. Crown on each button.

## 10. Reading mode → Pro

Find reading-mode toggle in `NoteEditor.tsx` / note toolbar.
- `requirePro('reading_mode')` on click. Crown on toggle.

## 11. Notes settings / Tasks default & display / Note type visibility — soft limit

Files: `NotesSettingsSheet.tsx`, `NoteTypeVisibilitySheet.tsx`, tasks default display sheet (likely inside `TodoSettings.tsx`).
- Mark a subset of "advanced" toggles as Pro (e.g. masonry layout, custom card density, hiding specific note types beyond first 2, custom default priority, custom default folder).
- Use `requirePro('notes_settings_advanced' | 'tasks_default_advanced' | 'note_type_visibility_advanced')` per row. Crown on each Pro row; clicking opens paywall.

## 12. Batch task add (BatchTaskSheet)

File: `BatchTaskSheet.tsx`.
- Free: typing multiple tasks + save.
- Pro fields: Section selector, Priority selector, Folder selector, Due date picker → each wrapped with `requirePro('batch_*')` on open. Crown on each field button.
- Status (BulkStatusSheet): `requirePro('batch_status')` on open.

## 13. Calendar views — 1 free

File: `TodoCalendar.tsx` (and `NotesCalendarView.tsx` if it has multiple views).
- Free view: "Month".
- Switching to Week / Day / Agenda / Year → `requirePro('calendar_view_<id>')`. Crown on each non-month tab.

## 14. Crown icon component

Reuse `PremiumCrown.tsx` everywhere. Standard pattern:

```tsx
{!isPro && <PremiumCrown className="ml-1 h-3.5 w-3.5" />}
```

## 15. Paywall messages

Update `PremiumPaywall.tsx` `capacityMessage` map (and feature-label map) so every new key shows a friendly headline, e.g.:
- `capacity_darkThemes` → "Unlock more dark themes"
- `capacity_eisenhowerTasksPerQuadrant` → "Free plan allows 10 tasks per quadrant"
- `capacity_smartListsCustom` → "Free plan allows 2 custom smart lists"
- `capacity_blocksAdvancedPerNote` → "Free plan allows 3 advanced blocks per note"
- `capacity_calendarViews` → "Unlock more calendar views"
- `pomodoro` → "Pomodoro is a Pro feature"
- `reading_mode` → "Reading mode is a Pro feature"
- `image_attachment` → "Image attachments are Pro"
- `extract_*` → "AI extract is a Pro feature"
- `block_*` → "This block is Pro"
- `batch_*` → "This batch option is Pro"
- `dark_theme_extra` → "Extra dark themes are Pro"
- `calendar_view_*` → "This calendar view is Pro"
- `smart_list_pro` → "Advanced smart lists are Pro"
- `notes_settings_advanced` / `tasks_default_advanced` / `note_type_visibility_advanced` → "This setting is Pro"

## 16. Testing checklist

- Toggle Pro off → each gated control shows crown.
- Click each gated control → correct paywall headline.
- Hitting capacity limit (delete to free a slot) → counter recovers (current-count semantics already implemented).
- History (tasks & notes) opens without paywall.

## Out of scope

- No new RevenueCat entitlements; reuses existing `isPro`.
- No backend / DB changes.
- No design overhaul; uses existing `PremiumPaywall` + `PremiumCrown`.

## Open assumption to confirm

- "Image attachment Pro" — applies to image attachments only; non-image files keep the existing 1/day soft cap. If you want *all* attachments Pro, say so and I'll drop the daily counter entirely.
