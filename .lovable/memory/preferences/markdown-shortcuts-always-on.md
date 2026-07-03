---
name: Markdown shortcuts always enabled
description: Notes editor markdown shortcuts (#, ##, *, -, [], etc.) must always work in the body regardless of any settings toggle
type: preference
---
Markdown auto-format shortcuts in the RichTextEditor must always be active in the note body. Do not gate them behind `notesSettings.markdownShortcuts` or any other toggle. **Why:** user expects markdown to "just work" in any case. **How to apply:** in `src/components/RichTextEditor.tsx`, keep `handleBeforeInput`, `handleKeyDown`, and the paste path unconditionally running the markdown shortcut helpers (setting-based guards were removed).
