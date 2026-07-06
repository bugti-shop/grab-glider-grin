# Multi-page hybrid — Phase 1: pages inside one sketch

Notebook-level list already exists (Notebooks page). This ship adds **pages inside a single sketch** — jaisa Procreate/Notability karta hai. Notebook↔sketch level hierarchy Phase 2 mein polish karenge.

## Scope (this turn)

1. **Data model**
   - `SketchData` mein optional `pages?: Layer[][]` + `pageIndex?: number` add.
   - Backwards compatible: agar `pages` nahi hai, current `layers` = single page.
   - PDF sketches (jinke paas already `pdfAnnotations` hai) untouched — un mein multi-page pehle se hai.

2. **In-editor state**
   - `sketchPages: Layer[][]` (default 1 page = current layers)
   - `sketchPageIndex: number`
   - Non-PDF sketches ke liye active. PDF loaded ho to skip (PDF ka apna system chalta rahega).

3. **Page navigation UI**
   - Bottom-center chip: `‹  Page 2/5  ›` + `＋` add page button.
   - Long-press/tap on chip → thumbnail rail (horizontal scroll on mobile, side sheet on desktop).
   - Thumbnails render via `generateSvg(layers, w, h, background)` → data URL.
   - Har thumbnail par delete (trash icon) + drag reorder (Phase 2).

4. **Persistence**
   - `emitChange` mein current page ke layers ko `sketchPages[sketchPageIndex]` mein snapshot karke pura `pages` array `onChange` payload mein bhejein.
   - `useEffect` on `initialData`: agar `initialData.pages` present hai to load karo, warna `[initialData.layers]` se seed karo.

5. **Keyboard shortcuts** (desktop)
   - `PageDown` / `Ctrl+→` → next page
   - `PageUp` / `Ctrl+←` → prev page
   - `Ctrl+Shift+N` → add page

6. **Swipe navigation** (mobile)
   - Existing presentation-mode swipe logic re-use — non-presentation mode mein bhi enable jab thumbnail rail visible ho.

## Out of scope (Phase 2 — next turn)

- Notebook-level "list of sketches" polish, drag-move pages between sketches
- Page templates (bg per page override)
- Page reorder drag & drop
- Collab sync for page switches (already scaffolded via `onCollabPageSwitch`, verify only)
- Undo/redo across page switches

## Technical notes

- File: `src/components/SketchEditor.tsx` (~8.4k lines) — additive changes near existing PDF page nav for consistency.
- File: `src/components/sketch/SketchTypes.ts` — extend `SketchData`.
- File: `src/pages/NotebookDetail.tsx` / `SketchPage.tsx` — no changes; SketchData shape widening is backward compatible.
- Layer semantic defaults (Background/Grid/Drawing/Text/Stickers) apply per page, freshly generated.
- Thumbnail generation is off-screen SVG → cheap; regenerate only on page switch or on `emitChange` debounce.

## Approval

OK karo to Phase 1 implement kar deta hun. "Just build" bolo to skip approval.
