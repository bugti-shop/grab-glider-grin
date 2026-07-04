// CSS styles for the RichTextEditor
// Extracted from inline <style> tag in RichTextEditor.tsx

export const RICH_TEXT_EDITOR_STYLES = `
  .rich-text-editor a {
    color: #3B82F6;
    text-decoration: underline;
  }
  .rich-text-editor ul {
    list-style: disc;
    padding-left: 2rem;
  }
  .rich-text-editor ul.checklist {
    list-style: none;
    padding-left: 0.5rem;
  }
  .rich-text-editor .checklist-item {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.25rem 0;
    min-height: 1.5rem;
  }
  .rich-text-editor .checklist-checkbox {
    width: 18px;
    height: 18px;
    margin-top: 0.15rem;
    accent-color: hsl(var(--primary));
    cursor: pointer;
    flex-shrink: 0;
  }
  .rich-text-editor .checklist-text {
    flex: 1;
    min-width: 0;
  }
  .rich-text-editor .checklist-item.checked .checklist-text {
    text-decoration: line-through;
    opacity: 0.6;
  }
  .rich-text-editor ol {
    list-style: decimal;
    padding-left: 2rem;
  }
  /* Solid black separator/horizontal rule */
  .rich-text-editor hr {
    border: none;
    border-top: 2px solid #000000 !important;
    margin: 16px 0;
  }
  /* MS Word style page break container */
  .rich-text-editor .page-break-container {
    page-break-after: always;
    margin: 32px 0;
    position: relative;
    user-select: none;
  }
  /* Ensure smooth mobile scrolling inside the editor */
  .rich-text-editor__scroll {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    touch-action: pan-y;
  }
  .title-input {
    font-size: 1.5rem;
    font-weight: bold;
    border: none;
    outline: none;
    background: transparent;
    width: 100%;
    padding: 1rem 1rem 0.5rem 1rem;
  }
  .title-input::placeholder {
    color: rgba(0, 0, 0, 0.3);
  }
  /* Sticky note title should be black */
  .sticky-note-editor .title-input {
    color: #000000 !important;
  }
  /* Enhanced audio player styling */
  .audio-player-container {
    background: rgba(0, 0, 0, 0.05);
    border-radius: 12px;
    padding: 12px;
  }
  .audio-player-container audio {
    width: 100%;
    height: 54px;
    border-radius: 8px;
  }
  .audio-player-container audio::-webkit-media-controls-panel {
    background: transparent;
  }
  /* Inline voice recording styles - WhatsApp style */
  .voice-recording-inline {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    margin: 8px 0;
    background: hsl(var(--muted) / 0.5);
    border-radius: 18px;
    border: 1px solid hsl(var(--border) / 0.3);
    user-select: none;
    max-width: 320px;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .voice-recording-inline audio {
    display: none;
  }
  .voice-recording-inline .voice-play-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
    transition: transform 0.15s, background 0.15s;
    pointer-events: auto;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .voice-recording-inline .voice-play-btn:hover {
    background: hsl(var(--primary) / 0.9);
  }
  .voice-recording-inline .voice-play-btn:active {
    transform: scale(0.92);
  }
  .voice-recording-inline .voice-play-btn svg {
    margin-left: 2px;
    pointer-events: none;
  }
  .voice-recording-inline .voice-play-btn .pause-icon {
    margin-left: 0;
  }
  .voice-recording-inline .voice-waveform {
    flex: 1;
    position: relative;
    height: 28px;
    display: flex;
    align-items: center;
    min-width: 100px;
    cursor: pointer;
    padding: 4px 0;
    border-radius: 4px;
    transition: background 0.15s;
    pointer-events: auto;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .voice-recording-inline .voice-waveform:hover {
    background: hsl(var(--muted-foreground) / 0.08);
  }
  .voice-recording-inline .voice-waveform:active {
    background: hsl(var(--muted-foreground) / 0.12);
  }
  .voice-recording-inline .waveform-background {
    position: relative;
    z-index: 1;
    pointer-events: none;
  }
  .voice-recording-inline .waveform-progress {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    z-index: 2;
    pointer-events: none;
  }
  .voice-recording-inline .voice-duration {
    font-size: 13px;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    min-width: 38px;
    text-align: right;
    flex-shrink: 0;
    pointer-events: none;
  }
  .voice-recording-inline .voice-delete-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: transparent;
    color: hsl(var(--destructive));
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
    opacity: 0.6;
    transition: opacity 0.15s, background 0.15s;
    pointer-events: auto;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .voice-recording-inline .voice-delete-btn:hover {
    opacity: 1;
    background: hsl(var(--destructive) / 0.1);
  }
  .voice-recording-inline .voice-delete-btn svg {
    pointer-events: none;
  }
  .voice-recording-inline .voice-speed-btn {
    min-width: 40px;
    height: 28px;
    padding: 0 8px;
    border-radius: 14px;
    background: hsl(var(--muted-foreground) / 0.15);
    color: hsl(var(--foreground));
    font-size: 12px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s, transform 0.1s;
    pointer-events: auto;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .voice-recording-inline .voice-speed-btn:hover {
    background: hsl(var(--muted-foreground) / 0.25);
  }
  .voice-recording-inline .voice-speed-btn:active {
    transform: scale(0.95);
  }
  /* Print styles for page breaks */
  @media print {
    .rich-text-editor .page-break-container {
      page-break-after: always;
      break-after: page;
    }
    .voice-recording-inline {
      display: none;
    }
  }
  /* === Callout block === */
  .rich-text-editor .rt-callout {
    display: flex;
    gap: 12px;
    padding: 12px 14px;
    margin: 10px 0;
    border-radius: 10px;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--muted) / 0.4);
    align-items: flex-start;
  }
  .rich-text-editor .rt-callout[data-variant="info"]    { background: rgba(59,130,246,0.12);  border-color: rgba(59,130,246,0.35); }
  .rich-text-editor .rt-callout[data-variant="warning"] { background: rgba(245,158,11,0.12);  border-color: rgba(245,158,11,0.35); }
  .rich-text-editor .rt-callout[data-variant="success"] { background: rgba(34,197,94,0.12);   border-color: rgba(34,197,94,0.35); }
  .rich-text-editor .rt-callout[data-variant="danger"]  { background: rgba(239,68,68,0.12);   border-color: rgba(239,68,68,0.35); }
  .rich-text-editor .rt-callout .rt-callout-icon {
    font-size: 20px; line-height: 1; user-select: none; flex-shrink: 0;
  }
  .rich-text-editor .rt-callout .rt-callout-body { flex: 1; min-width: 0; }

  /* === Toggle block === */
  .rich-text-editor details.rt-toggle {
    margin: 8px 0;
    padding: 6px 10px;
    border-radius: 8px;
    background: hsl(var(--muted) / 0.3);
  }
  .rich-text-editor details.rt-toggle > summary {
    cursor: pointer;
    font-weight: 600;
    list-style: none;
    padding: 4px 0;
    user-select: none;
  }
  .rich-text-editor details.rt-toggle > summary::-webkit-details-marker { display: none; }
  .rich-text-editor details.rt-toggle > summary::before {
    content: '▸';
    display: inline-block;
    margin-right: 10px;
    font-size: 1.4em;
    line-height: 1;
    vertical-align: -2px;
    transition: transform 0.15s;
  }
  .rich-text-editor details.rt-toggle[open] > summary::before {
    transform: rotate(90deg);
  }
  .rich-text-editor details.rt-toggle > .rt-toggle-body {
    padding: 6px 0 6px 22px;
  }

  /* === Quote block === */
  .rich-text-editor blockquote.rt-quote {
    border-left: 4px solid #3B82F6;
    padding: 8px 14px;
    margin: 10px 0;
    color: hsl(var(--muted-foreground));
    background: hsl(var(--muted) / 0.25);
    border-radius: 0 8px 8px 0;
  }

  /* === Mention chip === */
  .rich-text-editor .rt-mention,
  .rich-text-editor a.rt-mention,
  .rt-mention,
  a.rt-mention {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 8px;
    margin: 0 1px;
    border-radius: 6px;
    background: hsl(var(--primary) / 0.12);
    color: hsl(var(--primary));
    font-weight: 500;
    text-decoration: none !important;
    cursor: pointer;
    font-size: 0.95em;
    pointer-events: auto;
    touch-action: manipulation;
    -webkit-user-select: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  .rich-text-editor .rt-mention:hover,
  .rich-text-editor a.rt-mention:hover,
  .rt-mention:hover,
  a.rt-mention:hover {
    background: hsl(var(--primary) / 0.2);
  }
  .rich-text-editor .rt-mention::before,
  .rich-text-editor a.rt-mention::before,
  .rt-mention::before,
  a.rt-mention::before {
    content: attr(data-prefix);
    opacity: 0.7;
    margin-right: 2px;
  }

  /* === Headings (override inline fontSize on the contentEditable host) === */
  .rich-text-editor h1 {
    font-size: 2em !important;
    font-weight: 700 !important;
    line-height: 1.25 !important;
    margin: 0.6em 0 0.3em !important;
  }
  .rich-text-editor h2 {
    font-size: 1.5em !important;
    font-weight: 700 !important;
    line-height: 1.3 !important;
    margin: 0.55em 0 0.3em !important;
  }
  .rich-text-editor h3 {
    font-size: 1.22em !important;
    font-weight: 600 !important;
    line-height: 1.35 !important;
    margin: 0.5em 0 0.25em !important;
  }

  /* === Columns layout === */
  .rich-text-editor .rt-columns,
  .prose .rt-columns {
    display: grid;
    gap: 14px;
    margin: 12px 0;
  }
  .rich-text-editor .rt-columns[data-cols="2"],
  .prose .rt-columns[data-cols="2"] { grid-template-columns: 1fr 1fr; }
  .rich-text-editor .rt-columns[data-cols="3"],
  .prose .rt-columns[data-cols="3"] { grid-template-columns: 1fr 1fr 1fr; }
  .rich-text-editor .rt-columns .rt-col,
  .prose .rt-columns .rt-col {
    min-width: 0;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px dashed hsl(var(--border));
    background: hsl(var(--muted) / 0.2);
  }
  @media (max-width: 640px) {
    .rich-text-editor .rt-columns,
    .prose .rt-columns { grid-template-columns: 1fr !important; }
  }

  /* === Math (KaTeX) block === */
  .rich-text-editor .rt-math,
  .prose .rt-math {
    display: block;
    margin: 10px 0;
    padding: 10px 12px;
    border-radius: 8px;
    background: hsl(var(--muted) / 0.3);
    text-align: center;
    overflow-x: auto;
  }
  .rich-text-editor span.rt-math,
  .prose span.rt-math {
    display: inline-block;
    padding: 1px 6px;
    margin: 0 2px;
    text-align: left;
  }
  .rich-text-editor .rt-math:hover,
  .prose .rt-math:hover {
    outline: 2px solid hsl(var(--primary) / 0.4);
    cursor: pointer;
  }

  /* === Inline comments === */
  .rich-text-editor .rt-comment,
  .prose .rt-comment {
    background: rgba(250, 204, 21, 0.28);
    border-bottom: 2px dotted #facc15;
    cursor: help;
    padding: 0 1px;
    border-radius: 2px;
  }
  .rich-text-editor .rt-comment:hover,
  .prose .rt-comment:hover {
    background: rgba(250, 204, 21, 0.45);
  }

  /* === Synced block === */
  .rich-text-editor .rt-synced,
  .prose .rt-synced {
    position: relative;
    margin: 12px 0;
    padding: 28px 12px 12px 12px;
    border: 1px solid hsl(var(--primary) / 0.35);
    border-radius: 10px;
    background: hsl(var(--primary) / 0.06);
  }
  .rich-text-editor .rt-synced::before,
  .prose .rt-synced::before {
    content: '🔄 Synced';
    position: absolute;
    top: 6px;
    left: 10px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: hsl(var(--primary));
    opacity: 0.8;
  }
  .rich-text-editor .rt-synced .rt-synced-inner,
  .prose .rt-synced .rt-synced-inner {
    outline: none;
    min-height: 1.5em;
  }
  .rich-text-editor .rt-synced .rt-synced-inner[contenteditable="true"]:focus {
    box-shadow: 0 0 0 2px hsl(var(--primary) / 0.35);
    border-radius: 6px;
  }

  /* ─── Web Clipper "card" block (Evernote-style) ─── */
  .flowist-web-clip {
    display: block;
    margin: 1.25rem 0;
    padding: 0;
    border: 1px solid hsl(var(--border));
    border-radius: 14px;
    background: hsl(var(--card));
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03), 0 6px 20px -12px rgba(0,0,0,0.12);
    position: relative;
  }
  .flowist-web-clip::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    background: linear-gradient(180deg, hsl(var(--primary)), hsl(var(--primary) / 0.4));
  }
  .flowist-web-clip-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid hsl(var(--border) / 0.7);
    background: hsl(var(--muted) / 0.35);
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    flex-wrap: wrap;
  }
  .flowist-web-clip-favicon {
    width: 16px; height: 16px; border-radius: 3px; flex-shrink: 0;
  }
  .flowist-web-clip-badge {
    padding: 2px 8px;
    border-radius: 999px;
    background: hsl(var(--primary) / 0.15);
    color: hsl(var(--primary));
    font-weight: 700;
    font-size: 10px;
    letter-spacing: 0.06em;
  }
  .flowist-web-clip-site { font-weight: 600; color: hsl(var(--foreground)); }
  .flowist-web-clip-dot { opacity: 0.5; }
  .flowist-web-clip-open {
    margin-left: auto;
    padding: 3px 10px;
    border: 1px solid hsl(var(--border));
    border-radius: 999px;
    text-decoration: none;
    color: hsl(var(--foreground));
    font-weight: 600;
    font-size: 11px;
    transition: background 0.15s;
  }
  .flowist-web-clip-open:hover { background: hsl(var(--accent)); }
  .flowist-web-clip-fallback-banner {
    margin: 12px 14px 0;
    padding: 10px 12px;
    border: 1px solid hsl(var(--border));
    border-radius: 8px;
    background: hsl(var(--muted) / 0.6);
    font-size: 13px;
  }
  .flowist-web-clip-title {
    margin: 14px 18px 4px !important;
    font-size: 1.5rem !important;
    font-weight: 700 !important;
    line-height: 1.25 !important;
  }
  .flowist-web-clip-meta {
    margin: 0 18px 10px !important;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    font-style: italic;
  }
  .flowist-web-clip-hero {
    margin: 8px 0 0;
    padding: 0;
  }
  .flowist-web-clip-hero img {
    width: 100%; height: auto; display: block; max-height: 320px; object-fit: cover;
  }
  .flowist-web-clip-excerpt,
  .flowist-web-clip-selection {
    margin: 10px 18px !important;
    padding: 10px 14px !important;
    border-left: 3px solid hsl(var(--primary) / 0.5) !important;
    background: hsl(var(--muted) / 0.4);
    border-radius: 0 8px 8px 0;
    font-style: italic;
    color: hsl(var(--foreground));
  }
  .flowist-web-clip-body { padding: 6px 18px 16px; position: relative; }
  .flowist-web-clip-body[data-collapsed="1"] {
    max-height: 380px;
    overflow: hidden;
    -webkit-mask-image: linear-gradient(180deg, #000 65%, transparent);
            mask-image: linear-gradient(180deg, #000 65%, transparent);
  }
  .flowist-web-clip-body img { max-width: 100%; height: auto; border-radius: 6px; }
  .flowist-web-clip-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 4px 18px 14px;
    padding: 6px 14px;
    border: 1px solid hsl(var(--border));
    border-radius: 999px;
    background: hsl(var(--card));
    color: hsl(var(--foreground));
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .flowist-web-clip-toggle:hover { background: hsl(var(--accent)); }
  .flowist-web-clip-fullpage {
    margin: 12px 18px;
    padding: 14px;
    border: 1px dashed hsl(var(--border));
    border-radius: 10px;
    background: hsl(var(--muted) / 0.35);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .flowist-web-clip-fullpage-btn {
    align-self: flex-start;
    padding: 8px 16px;
    border: 1px solid hsl(var(--border));
    border-radius: 999px;
    background: hsl(var(--card));
    color: hsl(var(--foreground));
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .flowist-web-clip-fullpage-btn:hover { background: hsl(var(--accent)); }
  .flowist-web-clip-fullpage-btn[disabled] { opacity: 0.6; cursor: wait; }
  .flowist-web-clip-fullpage-hint { font-size: 11px; opacity: 0.7; }
  .flowist-web-clip-links {
    list-style: none !important;
    padding: 0 !important;
    margin: 8px 0 0 !important;
    display: grid;
    gap: 6px;
  }
  .flowist-web-clip-link a {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px 10px;
    border: 1px solid hsl(var(--border));
    border-radius: 8px;
    text-decoration: none !important;
    color: inherit !important;
    transition: background 0.15s;
  }
  .flowist-web-clip-link a:hover { background: hsl(var(--accent)); }
  .flowist-web-clip-link img { width: 20px; height: 20px; flex-shrink: 0; border-radius: 3px; }
  .flowist-web-clip-link span { display: flex; flex-direction: column; min-width: 0; }
  .flowist-web-clip-link strong { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .flowist-web-clip-link em { font-size: 12px; opacity: 0.7; font-style: normal; }
  .flowist-web-clip-footer {
    padding: 10px 14px;
    border-top: 1px solid hsl(var(--border) / 0.7);
    background: hsl(var(--muted) / 0.25);
    font-size: 11px;
  }
  .flowist-web-clip-source {
    color: hsl(var(--muted-foreground));
    text-decoration: none;
    word-break: break-all;
  }
  .flowist-web-clip-source:hover { text-decoration: underline; }

  /* ── Rich code block: language selector, copy, line numbers ── */
  pre.rt-codeblock {
    position: relative;
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    border-radius: 10px;
    padding: 38px 12px 12px 52px;
    margin: 12px 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.88em;
    line-height: 1.55;
    overflow-x: auto;
  }
  pre.rt-codeblock > code {
    display: block;
    white-space: pre;
    outline: none;
    color: hsl(var(--foreground));
  }
  .rt-codeblock-chrome {
    position: absolute;
    top: 6px;
    left: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    justify-content: flex-end;
    pointer-events: auto;
  }
  .rt-codeblock-lang {
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: 6px;
    color: hsl(var(--foreground));
    font-size: 11px;
    padding: 2px 6px;
    cursor: pointer;
  }
  .rt-codeblock-copy {
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: 6px;
    color: hsl(var(--foreground));
    font-size: 11px;
    padding: 2px 8px;
    cursor: pointer;
  }
  .rt-codeblock-copy:hover { background: hsl(var(--muted)); }
  .rt-codeblock-gutter {
    position: absolute;
    top: 38px;
    left: 8px;
    width: 34px;
    text-align: right;
    color: hsl(var(--muted-foreground));
    opacity: 0.6;
    font-size: 0.85em;
    line-height: 1.55;
    user-select: none;
    pointer-events: none;
  }
  .rt-codeblock-gutter span { display: block; }

  /* highlight.js token colors (theme-aware, minimal) */
  pre.rt-codeblock .hljs-keyword,
  pre.rt-codeblock .hljs-selector-tag,
  pre.rt-codeblock .hljs-built_in { color: hsl(var(--primary)); }
  pre.rt-codeblock .hljs-string,
  pre.rt-codeblock .hljs-attr { color: hsl(142 65% 45%); }
  pre.rt-codeblock .hljs-number,
  pre.rt-codeblock .hljs-literal { color: hsl(24 90% 55%); }
  pre.rt-codeblock .hljs-comment { color: hsl(var(--muted-foreground)); font-style: italic; }
  pre.rt-codeblock .hljs-title,
  pre.rt-codeblock .hljs-name { color: hsl(210 90% 60%); }
  pre.rt-codeblock .hljs-tag { color: hsl(340 70% 55%); }

  /* ── Image caption + lightbox ── */
  .rt-image-caption {
    margin-top: 6px;
    font-size: 0.85em;
    color: hsl(var(--muted-foreground));
    text-align: center;
    outline: none;
    min-height: 1.2em;
  }
  .rt-image-caption:empty::before {
    content: attr(data-placeholder);
    color: hsl(var(--muted-foreground));
    opacity: 0.55;
  }
  .resizable-image-wrapper[data-image-align="full"] { width: 100% !important; }
  .resizable-image-wrapper[data-image-align="full"] img { width: 100% !important; }

  .rt-lightbox {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.92);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: env(safe-area-inset-top, 0) env(safe-area-inset-right, 0) env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0);
    cursor: zoom-out;
    animation: rt-lightbox-in 0.15s ease-out;
    touch-action: pan-y;
    overscroll-behavior: contain;
  }
  .rt-lightbox-stage {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 24px;
    position: relative;
  }
  .rt-lightbox img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 6px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.5);
    user-select: none;
    -webkit-user-drag: none;
  }
  .rt-lightbox-close {
    position: absolute;
    top: calc(env(safe-area-inset-top, 0px) + 12px);
    right: calc(env(safe-area-inset-right, 0px) + 12px);
    background: rgba(255,255,255,0.15);
    color: #fff;
    border: none;
    border-radius: 999px;
    width: 44px;
    height: 44px;
    font-size: 26px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
  }
  .rt-lightbox-nav {
    background: rgba(255,255,255,0.12);
    color: #fff;
    border: none;
    border-radius: 999px;
    width: 48px;
    height: 48px;
    font-size: 32px;
    line-height: 1;
    cursor: pointer;
    flex-shrink: 0;
    margin: 0 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
  }
  .rt-lightbox-nav:hover { background: rgba(255,255,255,0.22); }
  .rt-lightbox-counter {
    position: absolute;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
    left: 50%;
    transform: translateX(-50%);
    color: rgba(255,255,255,0.85);
    font-size: 13px;
    background: rgba(0,0,0,0.4);
    padding: 4px 10px;
    border-radius: 999px;
    pointer-events: none;
  }
  @media (max-width: 640px) {
    .rt-lightbox-nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 40px;
      height: 40px;
      font-size: 26px;
      background: rgba(0,0,0,0.45);
    }
    .rt-lightbox-prev { left: 8px; }
    .rt-lightbox-next { right: 8px; }
    .rt-lightbox-stage { padding: 12px; }
  }
  @keyframes rt-lightbox-in { from { opacity: 0; } to { opacity: 1; } }

  /* ── Extra shortcut blocks: KaTeX / QR / Mermaid / Chess ── */
  .rt-katex {
    display: inline-block;
    padding: 0 2px;
    vertical-align: middle;
    user-select: all;
  }
  .rt-katex .katex { font-size: 1em; }
  .rt-qr {
    display: block;
    margin: 12px auto;
    padding: 12px;
    border: 1px solid hsl(var(--border));
    border-radius: 12px;
    background: hsl(var(--card));
    max-width: 280px;
    text-align: center;
  }
  .rt-qr img { display: block; margin: 0 auto; border-radius: 4px; }
  .rt-qr figcaption {
    margin-top: 8px;
    font-size: 11px;
    color: hsl(var(--muted-foreground));
    word-break: break-all;
  }
  .rt-mermaid, .rt-chess {
    display: block;
    margin: 12px 0;
    padding: 12px;
    border: 1px solid hsl(var(--border));
    border-radius: 12px;
    background: hsl(var(--card));
    text-align: center;
    overflow-x: auto;
  }
  .rt-mermaid svg, .rt-chess svg { max-width: 100%; height: auto; }

  /* ── Repeated word marker (the the) ── */
  .rt-dup-word {
    text-decoration: underline wavy #f59e0b;
    text-underline-offset: 3px;
    background: rgba(245, 158, 11, 0.08);
    border-radius: 2px;
    cursor: help;
  }

  /* ── Media embeds: YouTube / Spotify / Tweet ── */
  .rt-embed {
    display: block;
    margin: 12px auto;
    max-width: 640px;
    border-radius: 12px;
    overflow: hidden;
    background: hsl(var(--muted));
  }
  .rt-embed iframe { display: block; width: 100%; border: 0; }
  .rt-yt { aspect-ratio: 16 / 9; }
  .rt-yt iframe { width: 100%; height: 100%; }
  .rt-spotify iframe { min-height: 152px; }
  .rt-tweet {
    max-width: 550px;
    background: transparent;
  }
  .rt-tweet iframe { min-height: 420px; }
`;



