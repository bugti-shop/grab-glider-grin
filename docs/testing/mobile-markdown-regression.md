# Mobile Markdown Paste & Input Regression Checklist

Purpose: guarantee that Android and iOS soft-keyboards never leave raw markdown syntax in the RichTextEditor. Run this checklist before every release that touches `src/components/RichTextEditor.tsx` or `src/components/richtext/markdownShortcuts.ts`.

## Devices & Browsers (matrix)

Run every section on **at least one device per row**.

| Platform | Browser / Keyboard | Notes |
|---|---|---|
| Android 13+ | Chrome + Gboard | Primary — most `keyCode 229` issues |
| Android 13+ | Chrome + SwiftKey | Different `beforeinput` behavior |
| Android 13+ | Samsung Internet + Samsung Keyboard | OEM quirks |
| iOS 17+ | Safari + iOS Keyboard | Autocorrect + smart punctuation |
| iOS 17+ | Chrome iOS + iOS Keyboard | WKWebView shell |
| Desktop | Chrome / Safari / Firefox | Baseline sanity |
| Capacitor Android | In-app WebView | Native shell parity |
| Capacitor iOS | In-app WKWebView | Native shell parity |

## Pre-flight

- [ ] Notes Settings → "Markdown shortcuts" is **ON**.
- [ ] Autocorrect / predictive text is **ON** (this is where most bugs hide).
- [ ] Test in **both** a brand-new empty note **and** an existing note with content.

---

## A. Block shortcuts (type at start of line, then Space)

For each row: type the trigger, press **Space**, confirm the block converts and the trigger characters are removed.

- [ ] `# ` → Heading 1
- [ ] `## ` → Heading 2
- [ ] `### ` → Heading 3
- [ ] `- ` → bullet list
- [ ] `* ` → bullet list
- [ ] `1. ` → numbered list
- [ ] `[] ` → unchecked task
- [ ] `[x] ` → checked task
- [ ] `> ` → blockquote
- [ ] ` ``` ` + Space/Enter → code block
- [ ] `--- ` + Space → divider
- [ ] `***` + Enter → divider

Regression traps:
- [ ] Works on the **very first character** of a brand-new empty note (root-level caret).
- [ ] Works after pressing Enter on an existing paragraph.
- [ ] Works when autocorrect has just replaced the previous word.

## B. Inline shortcuts (wrap text, then Space)

- [ ] `**bold** ` → **bold**
- [ ] `*italic* ` → *italic*
- [ ] `_italic_ ` → *italic*
- [ ] `` `code` `` → inline code
- [ ] `~~strike~~ ` → strikethrough
- [ ] `==highlight== ` → highlight

Regression traps:
- [ ] Trigger fires when the closing marker is inserted by autocorrect (iOS smart quotes off).
- [ ] Trigger fires mid-sentence, not only at end of line.
- [ ] Undo (Ctrl/Cmd+Z, or shake-to-undo on iOS) restores raw markdown.

## C. Paste conversion

Copy the payload from another app (Notes, Slack, WhatsApp, browser address bar) — **not** just from within the editor.

- [ ] Paste plain markdown → converts to formatted blocks (headings, lists, checkboxes, quotes, code).
- [ ] Paste from an app that also puts `text/html` on the clipboard (Slack, Notion, Gmail) → **still converts markdown from `text/plain`** and does not fall through to raw HTML.
- [ ] Paste multi-line markdown inside an existing paragraph → splits correctly.
- [ ] Paste a URL by itself → becomes a link, not raw text.
- [ ] Paste an image from the clipboard → inserts as image block.
- [ ] Paste code fenced with ``` ``` ``` → becomes a code block with language if specified.
- [ ] Long paste (>10k chars) does not freeze the UI.
- [ ] Paste while cursor is at root of empty note → still converts (root-level caret regression).

## D. Android-specific (Gboard / SwiftKey)

- [ ] `keydown` events report `keyCode 229` — verify shortcuts still fire via `beforeinput` (log `inputType` in devtools if needed).
- [ ] Gesture typing ("swipe to type") a word that ends with `**bold**` still triggers inline conversion after Space.
- [ ] Predictive suggestion tap that inserts trigger characters still fires shortcut.
- [ ] Voice input that dictates "hash space heading" → does **not** double-convert.
- [ ] Composition events (multi-tap CJK / accents) do not corrupt formatting.

## E. iOS-specific (Safari / WKWebView)

- [ ] Smart punctuation ON: `--` → `—` does **not** break the `---` divider shortcut (test with smart punctuation OFF as well).
- [ ] Smart quotes ON: `**bold**` still triggers even when `*` gets curled.
- [ ] Shake-to-undo restores raw markdown, not a broken hybrid state.
- [ ] Long-press caret drag inside a converted block does not reintroduce raw markers.
- [ ] Dictation of "new line hash space Title" produces a heading.

## F. Capacitor shells

- [ ] Quick Add overlay (`/quick-add`) accepts markdown paste and converts.
- [ ] Share-intent → Web Clipper preview stage accepts inline edits without re-raw-ing markdown.
- [ ] After returning from background (Android) the editor still accepts input and shortcuts fire.

## G. Cross-cutting

- [ ] No console errors on any shortcut fire.
- [ ] No layout shift / caret jump after conversion.
- [ ] Sync: converted content round-trips through Supabase and re-opens on a second device with formatting intact (no raw markdown).
- [ ] Toggling "Markdown shortcuts" OFF disables A and B but leaves C (paste conversion) working.

---

## Reporting a failure

When a case fails, capture:
1. Device, OS version, browser, keyboard app + version.
2. Exact keystrokes / paste source.
3. Screenshot **and** a copy of `document.activeElement.innerHTML` from devtools.
4. Console log filtered for `[RichText]` / `[Markdown]`.
5. Whether it reproduces with autocorrect and smart punctuation OFF.

File under: `mobile-markdown-regression` label in issues.
