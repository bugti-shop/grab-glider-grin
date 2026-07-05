---
name: Web Clipper full page capture
description: Web Clipper captures the full page start-to-finish as a read-only embed; never an excerpt-only card or editable half article
type: preference
---
Web Clipper must capture the FULL page from start to finish and render it inline in the note as a **strictly read-only** embed (iframe srcdoc with the entire inlined HTML document). Also trigger the offline .html download so users can open it anywhere. The downloaded `.html` must be the full captured page in a readable, read-only, script-free format.

Never:
- Reduce the note body to a metadata/excerpt-only card (title + hero + short summary).
- Make the captured page editable in the clipper preview or in the saved note.
- Truncate to "half article" or stop at the first paragraph after the hero image.
- Fall back to article/reader extraction when full-page capture fails; show an error instead of saving half content.

The clipper preview UI and saved note view must be read-only (no contentEditable, no formatting toolbar, no editable title/body for saved web clips).
