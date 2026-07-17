## Goal

Har screen ke header par consistent iOS/Android safe-area padding (top, left, right for notch/landscape) aur icons ki size viewport ke hisaab se auto-scale — sirf NoteEditor tak limited nahi.

## Approach

Ek chhota **global header system** `src/index.css` mein add karenge (CSS variables + utility classes). Phir jitne bhi app-level header hain unko unhi variables/classes par migrate karenge — inline hardcoded `paddingTop: 'calc(var(--safe-top) + 12px)'` hata ke.

### 1. CSS tokens (`src/index.css` `:root`)

```
--safe-top:    max(env(safe-area-inset-top, 0px), 0px);
--safe-bottom: env(safe-area-inset-bottom, 0px);
--safe-left:   env(safe-area-inset-left, 0px);
--safe-right:  env(safe-area-inset-right, 0px);

/* Header sizing — responsive via clamp */
--header-pad-x:      clamp(8px, 2.5vw, 14px);
--header-pad-y:      6px;
--header-icon-btn:   clamp(36px, 10vw, 40px);   /* touch target */
--header-icon-size:  clamp(18px, 5.2vw, 22px);  /* actual glyph */
--header-title-size: clamp(15px, 4.4vw, 17px);
```

`body.ios-app` / `body.android-app` overrides same rakhein (existing +4px floor bana rahe).

### 2. Utility classes

```
.app-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 4px; min-width: 0;
  padding:
    calc(var(--safe-top) + var(--header-pad-y))
    calc(var(--safe-right) + var(--header-pad-x))
    var(--header-pad-y)
    calc(var(--safe-left) + var(--header-pad-x));
  background: inherit;
}
.app-header-btn { width: var(--header-icon-btn); height: var(--header-icon-btn); flex-shrink: 0; }
.app-header-btn > svg { width: var(--header-icon-size); height: var(--header-icon-size); }
```

### 3. Files to migrate

Replace hand-rolled `paddingTop: 'calc(var(--safe-top)...)'` + fixed `h-9 w-9` icon buttons with `.app-header` + `.app-header-btn`:

- `src/components/NoteEditor.tsx` (top header we just edited)
- `src/components/TaskDetailPage.tsx`
- `src/components/SubtaskDetailSheet.tsx`
- `src/components/InputSheetPage.tsx`
- `src/components/EventEditor.tsx`
- `src/components/FindReplacePage.tsx`
- `src/components/CameraScannerScreen.tsx`
- `src/components/FocusMode.tsx`
- `src/components/PremiumPaywall.tsx`
- `src/pages/todo/TodoLayout.tsx` (dashboard header)
- `src/pages/todo/TodoSettings.tsx`
- `src/pages/todo/TodoCalendar.tsx`
- `src/pages/todo/EisenhowerMatrix.tsx`
- `src/pages/Notes.tsx`, `src/pages/NotesCalendar.tsx`, `src/pages/Notebooks.tsx`, `src/pages/NotebookDetail.tsx`

Har file mein sirf header `<div>` ki styling + icon `<Button>` classes badalengi — koi behavior/logic touch nahi.

### 4. Landscape / notch behavior

- Left/right insets ab automatic — landscape iPhone mein icons notch ke neeche nahi jayenge.
- `--header-icon-btn`/`--header-icon-size` `clamp()` se: chhoti screens par 36/18px, badi par 40/22px — bina media queries ke smooth scaling.

### 5. Out of scope

- Kisi header ka layout ya buttons ki order nahi badlenge.
- Colors, typography, background — same rahenge.
- Bottom safe-area / nav bar (already handled) untouched.

### 6. Verification

- Preview 320px, 375px, 414px, 768px, 1024px width par headers overflow/clip check.
- iOS safe-top respected via existing `--safe-top` override.
- Type check pass.

Approve karein to implement karta hun.