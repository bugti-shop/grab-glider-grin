# Flowist Feature Discovery & Onboarding Tour System

Progressive, low-friction discoverability: one contextual tip at a time, plus a persistent "Feature Guide" hub and a 7-day new-user checklist. Backed by a per-user seen-state table so tips don't repeat across reinstalls.

## What gets built

### 1. Backend — per-user tour state
New table `user_feature_tours`:
- `user_id` (uuid, ref auth.users)
- `tour_id` (text)
- `seen_at` (timestamptz)
- `dismissed_forever` (boolean) — powers "Don't show tips like this again"
- Primary key `(user_id, tour_id)`
- RLS: users read/write only their own rows; standard GRANTs to `authenticated` + `service_role`
- Realtime not required (writes are rare, local cache handles reads)

### 2. Core engine — `src/features/tours/`
- **`tourRegistry.ts`** — declarative list of all tours (see structure in your prompt). No JSX; pure data. Categories: tasks / notes / notebooks / progress / journeys / settings.
- **`TourManager.ts`** — singleton service:
  - `startTour(id)`, `queueTour(id)`, `markSeen(id)`, `hasSeen(id)`, `dismissForever(id)`
  - Guarantees single active tour; new triggers queue instead of interrupting
  - Wraps driver.js with Flowist-styled popovers, Skip / Next / "Don't show again" buttons
  - Auto-navigates to `route` before starting, waits for target selector to mount (with timeout + graceful bail)
- **`useFeatureTour.ts`** — React hook: exposes manager + reactive `seenSet`
- **`TourStateStore.ts`** — local cache (IndexedDB via existing settingsStorage) + Cloud sync. Reads instant from cache; background flush to Cloud on write; on auth login, hydrates cache from Cloud.

### 3. UI components — `src/components/tours/`
- **`FeatureGuideModal.tsx`** — opened from the existing header bell/help icon. Categorized list with icon, title, one-line description, "✓ Seen" / "New" badge, "Show me" button that closes modal → navigates → fires tour.
- **`OnboardingChecklistCard.tsx`** — appears on Home for first 7 days (or until dismissed). Items: Create first task / Try a note type / Switch a task view / Explore Progress / Pick a theme. Auto-checks items via existing app events (task created, notes count > 0, layout changed, Progress route visited, theme changed). Collapsible + permanent "X" dismiss.
- **`EmptyStateHint.tsx`** — small reusable secondary hint chip appended to existing empty states (Notes, Journeys) that opens the relevant tour.

### 4. Wiring
- Add `data-tour="…"` attributes to targeted elements (add-task sheet buttons, ⋮ menu, note-type picker, notebook add button, Progress tabs, theme selector). Only attribute additions — no layout changes.
- Header bell/help icon → opens `FeatureGuideModal` on every screen.
- Home screen → mount `OnboardingChecklistCard` above the task list (conditional).
- Notes empty state → append `EmptyStateHint` for `note-types` tour.
- Route-level `useEffect` on Home, Notebooks, Progress → fires `first-visit` tours through the manager.
- `days-since-install` trigger uses existing install-date setting (fallback: profile `created_at`).

### 5. Priority tours (2–4 steps each, per your list)
`task-add-basics`, `task-views`, `task-toolbar-power`, `note-types`, `notebooks-color-coding`, `progress-tab-overview`, `journeys-intro`, `themes-personalize` — all registered as data in `tourRegistry.ts`.

## Design principles enforced in code
- Single active tour: enforced by `TourManager` mutex.
- Never repeats: `hasSeen` check before every auto-trigger.
- Skippable: driver.js `allowClose: true` + explicit Skip button; "Don't show again" writes `dismissed_forever`.
- Max 3 consecutive tips: queue caps auto-chained tours at 1; further tours require manual trigger.
- Free + paid: no entitlement gate. Paid features get a small `<PremiumCrown/>` badge inside the tooltip text.
- Mobile: driver.js configured with `stagePadding: 4`, `smoothScroll: true`, and popover width capped at `min(320px, 92vw)`.

## Technical notes

```text
src/
├── features/tours/
│   ├── tourRegistry.ts       # data-only list of tours
│   ├── TourManager.ts        # driver.js wrapper + queue
│   ├── TourStateStore.ts     # local cache + Cloud sync
│   └── useFeatureTour.ts     # React hook
├── components/tours/
│   ├── FeatureGuideModal.tsx
│   ├── OnboardingChecklistCard.tsx
│   └── EmptyStateHint.tsx
└── (data-tour="…" attributes added across existing screens)
```

Dependencies to add: `driver.js` (~15 KB gzipped).

DB migration adds `user_feature_tours` with RLS + GRANTs in the same statement.

## Out of scope (kept intentionally small)
- No analytics dashboard for tour funnels (can add later)
- No A/B testing infrastructure
- No animated illustrations inside tooltips — text + existing icons only
- No changes to existing screens beyond adding `data-tour` attributes and mounting the 3 new components in their host screens