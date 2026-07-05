---
name: Web Clipper full page capture
description: Web Clipper captures the full page start-to-finish as a read-only embed; never an excerpt-only card or editable half article
type: preference
---
Web Clipper must capture the FULL page from start to finish and render it inline in the note as a **read-only** embed (iframe srcdoc with the entire inlined HTML document). Also trigger the offline .html download so users can open it anywhere.

Never:
- Reduce the note body to a metadata/excerpt-only card (title + hero + short summary).
- Make the captured page editable in the clipper preview or in the saved note.
- Truncate to "half article" or stop at the first paragraph after the hero image.

The clipper preview UI must be read-only (no contentEditable) except for the note title.
