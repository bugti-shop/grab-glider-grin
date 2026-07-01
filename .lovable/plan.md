# Notes Power-Up: 4 Feature Bundle

Each bundle ships independently — you can approve one at a time or all four. Order below is by ROI (biggest win first, least risk).

---

## Bundle 1 — Web Clipper inline "card" block  *(1 pass, front-end only)*

**What changes for you**
- Web-clip content inside a note is no longer a plain wall of text. It renders as an **Evernote-style card**: favicon + site name header strip, hero image, title, byline·date, excerpt, and a collapsible "Read full clip" body.
- Collapsed by default when the clip is > 600 words — one click expands.
- Card gets a subtle bordered container, a colored source strip, and a small "↗ Open original" pill.
- Works retroactively on every clip you already saved (uses the existing `data-block-type="webClip"` markup).

**Technical**
- New CSS module `src/components/richtext/webClipCard.css` styling `.flowist-web-clip` + subclasses.
- Strip inline `style="…"` attrs in `WebClipper.tsx` in favor of classnames.
- New `hydrateWebClipsIn(root)` helper in `richTextBlocks.ts` that wires the expand/collapse button and word-count badge on every render.
- Notes list preview (`NoteCard.tsx`) shows a mini clip chip with favicon + site name when the note starts with a web clip.

---

## Bundle 2 — Tasks inside notes → global task list  *(2 passes, backend + frontend)*

**What changes for you**
- Any checkbox line inside a note (`ul.checklist > li.checklist-item`) is now a **real task** in Today / Upcoming.
- Two-way: check it in the note → it completes in Today. Check it in Today → the note reflects it.
- Delete the line in the note → task is soft-archived (not deleted, to prevent accidents).
- Optional "@today", "!high", "^2pm" inline shortcuts parse into due date/priority.
- Tasks show a "📝 from *Note Title*" chip so you can jump back to the source.

**Technical**
- New column `tasks.source_note_id uuid` + `tasks.source_block_id text` + index. Migration + GRANTs.
- New util `src/utils/noteTaskBridge.ts`:
  - `syncChecklistToTasks(noteId, editorRoot)` — diffs current checklist items vs. `tasks` where `source_note_id = ?`; upserts new, updates text/completed on existing, soft-archives removed.
  - Runs on note save (debounced 500 ms) via `NoteEditor.tsx` `onInput`.
  - Runs in reverse via a Realtime subscription on `tasks`: when a linked task changes, patch the corresponding `<li>` in any open note editor.
- Each `<li>` gets `data-task-id="..."`; assignment happens on first sync.
- Natural language parser reuses existing `src/utils/naturalLanguageParser.ts`.

---

## Bundle 3 — Home dashboard widgets from note content  *(2 passes)*

**What changes for you**
- On any note block (checklist, table, callout, heading section), open the block menu → **"Pin to Home"**.
- Home dashboard grows a "Pinned from Notes" row (drag to reorder, resize S/M/L).
- Widget is live: edit the source note → widget updates instantly on all devices.
- Types supported v1: **Checklist widget** (interactive checkboxes), **Table widget** (read-only), **Callout widget**, **Heading + text widget**.

**Technical**
- New table `note_widgets`:
  ```
  id uuid pk, user_id, note_id, block_id text, kind text,
  size text default 'M', position int, created_at, updated_at
  ```
  RLS: user can only see own. GRANTs to authenticated + service_role.
- Realtime enabled → same live-sync path as tasks.
- New `src/components/home/NoteWidgetsRow.tsx` renders widgets, hydrates blocks by scanning stored note HTML for `data-block-id="…"`.
- New "Pin block" affordance in `BubbleMenu.tsx` — assigns a stable `data-block-id` (nanoid) to the target block if missing, inserts a `note_widgets` row.

---

## Bundle 4 — Publish note as public webpage + inline formulas  *(2–3 passes)*

### 4a. Publish as public webpage  *(freemium)*

**What changes for you**
- Note menu → **"Publish"** → modal shows preview + URL.
- **Free tier:** unlisted URL `flowist.me/n/<random-8-char>` — noindex, no custom slug, no password.
- **Pro tier:** custom slug `flowist.me/n/<your-slug>`, indexable, optional password, view counter, "Updated N minutes ago" stamp.
- One click to unpublish. Republish regenerates or preserves URL.
- Beautiful reader page with your note title, meta description, OG image (first image in note), semantic HTML, print-friendly CSS.

**Technical**
- New table `published_notes`:
  ```
  slug text pk, note_id uuid, user_id uuid, is_indexable bool,
  password_hash text null, view_count int default 0,
  published_html text, published_at, updated_at
  ```
- RLS: owner can read/write own row; **`anon` can SELECT** for the reader page (public content). GRANTs accordingly.
- New route `/n/:slug` renders a static-feeling `PublishedNote.tsx` with SSR-like SEO (title, description, canonical, og:*, JSON-LD Article).
- New edge function `publish-note` — sanitizes note HTML, uploads referenced images to Storage (`user-attachments/published/…`) so they survive private-storage constraints, stamps `published_html`.
- Pro gate uses existing `SubscriptionProvider` — free users get unlisted-only, Pro unlocks slug/index/password.
- `robots.txt` and dynamic `<meta name="robots" content="noindex">` for unlisted rows.

### 4b. Inline formulas & variables

**What changes for you**
- Type `{{today}}`, `{{now}}`, `{{page.title}}`, `{{page.created}}` → renders live values inline.
- Type `=SUM(1,2,3)`, `=AVG(...)`, `=IF(a>b, "yes", "no")`, `=42*1.2` → evaluates and renders result with a small ƒ chip; click chip to edit formula.
- Variables scoped per note: `{{price}} = 10` on one line → `{{price * qty}}` recalculates elsewhere.

**Technical**
- New `src/components/richtext/formulaEngine.ts` — safe evaluator (no `eval`, custom Pratt parser or `expr-eval` package).
- New block wrapper `<span class="rt-formula" data-expr="…" data-result="…" contenteditable="false">` similar to existing `rt-math`.
- Hydrator `hydrateFormulasIn(root, noteContext)` re-evaluates on every render (cheap; expressions are small).
- Slash menu entry `/formula`; markdown-style trigger auto-converts `{{…}}` and `=…` when caret leaves the token.
- Variable table built by first pass over the note collecting `{{name}} = value` definitions.

---

## Order of delivery

1. **Bundle 1** — 1 pass (safe, self-contained; unblock immediately after approval)
2. **Bundle 2** — 2 passes (migration first, then bridge + UI)
3. **Bundle 3** — 2 passes (migration + widgets, then Home integration)
4. **Bundle 4a** — 2 passes (backend + reader page)
5. **Bundle 4b** — 1 pass (frontend-only)

Total: ~8 focused passes. I can also ship them in any order you prefer, or stop after any bundle. Which do you want me to start with — Bundle 1 right now?
