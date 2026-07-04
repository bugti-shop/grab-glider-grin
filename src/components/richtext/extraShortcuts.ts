/**
 * Extra type-triggered shortcuts for the rich-text editor.
 *
 * Trigger surface (all fire from RichTextEditor keydown):
 *
 *   ├─ Space keydown  ─────────────────────────
 *   │  \alpha, \beta, \sum, \int, \infty …  →  α β Σ ∫ ∞ …
 *   │  (100+ Greek letters, math ops, arrows)
 *   │
 *   ├─ `$` keydown ────────────────────────────
 *   │  $E=mc^2$   →  rendered KaTeX inline
 *   │
 *   ├─ Enter / Space / mobile auto-run (line-based) ─────────────
 *   │  /lorem 3           →  3 dummy paragraphs
 *   │  /color red hi      →  <span style="color:red">hi</span>
 *   │  /qr hello          →  QR code image block
 *   │  /mermaid graph …   →  rendered mermaid SVG block
 *   │  /chess FEN         →  rendered chess board block
 */

/* ────────────────────────────────────────────────────────────────
 * 1. Greek letters + math symbols  (\name → symbol)
 * ──────────────────────────────────────────────────────────────── */

const SYMBOL_MAP: Record<string, string> = {
  // Lowercase Greek
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ',
  nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', rho: 'ρ', sigma: 'σ',
  tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  varepsilon: 'ϵ', vartheta: 'ϑ', varphi: 'ϕ', varrho: 'ϱ', varsigma: 'ς',
  // Uppercase Greek
  Alpha: 'Α', Beta: 'Β', Gamma: 'Γ', Delta: 'Δ', Epsilon: 'Ε', Zeta: 'Ζ',
  Eta: 'Η', Theta: 'Θ', Iota: 'Ι', Kappa: 'Κ', Lambda: 'Λ', Mu: 'Μ',
  Nu: 'Ν', Xi: 'Ξ', Omicron: 'Ο', Pi: 'Π', Rho: 'Ρ', Sigma: 'Σ',
  Tau: 'Τ', Upsilon: 'Υ', Phi: 'Φ', Chi: 'Χ', Psi: 'Ψ', Omega: 'Ω',
  // Math ops
  infty: '∞', infinity: '∞', partial: '∂', nabla: '∇', forall: '∀',
  exists: '∃', nexists: '∄', emptyset: '∅', in: '∈', notin: '∉',
  subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇', cup: '∪',
  cap: '∩', sum: '∑', prod: '∏', int: '∫', iint: '∬', iiint: '∭',
  oint: '∮', sqrt: '√', pm: '±', mp: '∓', times: '×', div: '÷',
  cdot: '·', ast: '∗', star: '⋆', circ: '∘', bullet: '∙',
  // Relations
  neq: '≠', leq: '≤', geq: '≥', ll: '≪', gg: '≫', approx: '≈',
  equiv: '≡', cong: '≅', sim: '∼', propto: '∝',
  // Arrows
  rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', uparrow: '↑',
  downarrow: '↓', updownarrow: '↕', Rightarrow: '⇒', Leftarrow: '⇐',
  Leftrightarrow: '⇔', to: '→', mapsto: '↦', rightsquigarrow: '⇝',
  // Logic
  land: '∧', lor: '∨', lnot: '¬', neg: '¬', implies: '⟹', iff: '⟺',
  // Misc
  degree: '°', deg: '°', prime: '′', hbar: 'ℏ', ell: 'ℓ',
  Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', wp: '℘', copyright: '©', trademark: '™',
  registered: '®', dagger: '†', ddagger: '‡', section: '§', para: '¶',
  ldots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱',
};

/** Replace `\name` before caret (on space) with its symbol. */
export function tryGreekShortcut(root: HTMLElement | null): boolean {
  if (!root) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== 3) return false;
  const textNode = node as Text;
  const caret = range.startOffset;
  const before = textNode.data.slice(0, caret);
  const m = /\\([A-Za-z]+)$/.exec(before);
  if (!m) return false;
  const sym = SYMBOL_MAP[m[1]];
  if (!sym) return false;

  // Skip inside code blocks.
  if (isInsideCodeBlock(textNode, root)) return false;

  const start = caret - m[0].length;
  textNode.data = textNode.data.slice(0, start) + sym + textNode.data.slice(caret);
  const newRange = document.createRange();
  newRange.setStart(textNode, start + sym.length);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);
  return true;
}

/* ────────────────────────────────────────────────────────────────
 * 2. Inline LaTeX  ($E=mc^2$)
 * ──────────────────────────────────────────────────────────────── */

/**
 * Fired when user just typed a `$`. If there is a matching opening `$`
 * earlier on the line, render the content between them via KaTeX.
 */
export async function tryLatexShortcut(root: HTMLElement | null): Promise<boolean> {
  if (!root) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== 3) return false;
  const textNode = node as Text;
  const caret = range.startOffset;
  const before = textNode.data.slice(0, caret);

  // Find opening `$` on the same run (not `\$`, not empty content).
  const m = /\$([^$\n]{1,300})$/.exec(before);
  if (!m) return false;
  if (isInsideCodeBlock(textNode, root)) return false;

  const latex = m[1];
  const start = caret - m[0].length;

  let rendered: string;
  try {
    const katex = (await import('katex')).default;
    rendered = katex.renderToString(latex, {
      throwOnError: false,
      output: 'html',
      displayMode: false,
    });
  } catch {
    return false;
  }

  // Build the katex span node.
  const span = document.createElement('span');
  span.className = 'rt-katex';
  span.setAttribute('data-latex', latex);
  span.setAttribute('contenteditable', 'false');
  span.innerHTML = rendered;

  // Split text node and insert span.
  const after = textNode.data.slice(caret);
  textNode.data = textNode.data.slice(0, start);
  const parent = textNode.parentNode!;
  const tail = document.createTextNode(after);
  parent.insertBefore(tail, textNode.nextSibling);
  parent.insertBefore(span, tail);
  parent.insertBefore(document.createTextNode('\u200B'), span);
  parent.insertBefore(document.createTextNode('\u200B'), span.nextSibling);

  const newRange = document.createRange();
  newRange.setStart(tail, 0);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);
  return true;
}

/* ────────────────────────────────────────────────────────────────
 * 3. Line-based slash commands (fired on Enter)
 *     /lorem N   /color NAME text   /qr text
 *     /mermaid CODE   /chess FEN
 * ──────────────────────────────────────────────────────────────── */

const LOREM = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
  'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.',
  'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.',
  'At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident.',
];

const COLOR_MAP: Record<string, string> = {
  red: '#dc2626', orange: '#ea580c', yellow: '#ca8a04', green: '#16a34a',
  blue: '#2563eb', indigo: '#4f46e5', purple: '#9333ea', pink: '#db2777',
  gray: '#6b7280', grey: '#6b7280', black: '#000000', white: '#ffffff',
  brown: '#92400e', cyan: '#0891b2', teal: '#0d9488', lime: '#65a30d',
  amber: '#d97706', rose: '#e11d48', violet: '#7c3aed', fuchsia: '#c026d3',
  sky: '#0284c7', emerald: '#059669',
};

const SIMPLE_BLOCK_COMMANDS: Record<string, () => string> = {
  text: () => '<p><br></p>',
  p: () => '<p><br></p>',
  paragraph: () => '<p><br></p>',
  h1: () => '<h1><br></h1>',
  heading1: () => '<h1><br></h1>',
  title: () => '<h1><br></h1>',
  h2: () => '<h2><br></h2>',
  heading2: () => '<h2><br></h2>',
  h3: () => '<h3><br></h3>',
  heading3: () => '<h3><br></h3>',
  bullet: () => '<ul><li><br></li></ul>',
  bullets: () => '<ul><li><br></li></ul>',
  list: () => '<ul><li><br></li></ul>',
  ul: () => '<ul><li><br></li></ul>',
  numbered: () => '<ol><li><br></li></ol>',
  number: () => '<ol><li><br></li></ol>',
  ordered: () => '<ol><li><br></li></ol>',
  ol: () => '<ol><li><br></li></ol>',
  todo: () => '<ul class="checklist"><li class="checklist-item"><input type="checkbox" class="checklist-checkbox" /><span class="checklist-text">&nbsp;</span></li></ul>',
  check: () => '<ul class="checklist"><li class="checklist-item"><input type="checkbox" class="checklist-checkbox" /><span class="checklist-text">&nbsp;</span></li></ul>',
  checklist: () => '<ul class="checklist"><li class="checklist-item"><input type="checkbox" class="checklist-checkbox" /><span class="checklist-text">&nbsp;</span></li></ul>',
  quote: () => '<blockquote><br></blockquote>',
  blockquote: () => '<blockquote><br></blockquote>',
  divider: () => '<hr><p><br></p>',
  hr: () => '<hr><p><br></p>',
  rule: () => '<hr><p><br></p>',
  table: () => '<table style="border-collapse:collapse;width:100%;margin:8px 0;"><tbody><tr><td style="border:1px solid hsl(var(--border));padding:6px;">&nbsp;</td><td style="border:1px solid hsl(var(--border));padding:6px;">&nbsp;</td></tr><tr><td style="border:1px solid hsl(var(--border));padding:6px;">&nbsp;</td><td style="border:1px solid hsl(var(--border));padding:6px;">&nbsp;</td></tr></tbody></table><p><br></p>',
};

const INLINE_FORMAT_COMMANDS: Record<string, (body: string) => string> = {
  bold: (body) => `<p><strong>${escapeHtml(body)}</strong></p>`,
  strong: (body) => `<p><strong>${escapeHtml(body)}</strong></p>`,
  italic: (body) => `<p><em>${escapeHtml(body)}</em></p>`,
  italics: (body) => `<p><em>${escapeHtml(body)}</em></p>`,
  em: (body) => `<p><em>${escapeHtml(body)}</em></p>`,
  underline: (body) => `<p><u>${escapeHtml(body)}</u></p>`,
  u: (body) => `<p><u>${escapeHtml(body)}</u></p>`,
  strike: (body) => `<p><s>${escapeHtml(body)}</s></p>`,
  strikethrough: (body) => `<p><s>${escapeHtml(body)}</s></p>`,
  s: (body) => `<p><s>${escapeHtml(body)}</s></p>`,
  code: (body) => `<p><code>${escapeHtml(body)}</code></p>`,
  highlight: (body) => `<p><mark>${escapeHtml(body)}</mark></p>`,
  mark: (body) => `<p><mark>${escapeHtml(body)}</mark></p>`,
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}

/** Handle Enter on a `/command …` line. Returns true if consumed. */
export async function trySlashLineShortcut(root: HTMLElement | null): Promise<boolean> {
  if (!root) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const block = findBlock(range.startContainer, root);
  if (!block) return false;
  if (isInsideCodeBlock(block, root)) return false;

  const text = (block.textContent || '').trim();
  if (!text.startsWith('/')) return false;

  const m = /^\/(\w+)\s*(.*)$/.exec(text);
  if (!m) return false;
  const cmd = m[1].toLowerCase();
  const arg = m[2].trim();

  const simpleBlock = SIMPLE_BLOCK_COMMANDS[cmd];
  if (simpleBlock && !arg) {
    replaceBlockHtml(block, simpleBlock(), root);
    return true;
  }

  if ((cmd === 'h1' || cmd === 'heading1' || cmd === 'title') && arg) {
    replaceBlockHtml(block, `<h1>${escapeHtml(arg)}</h1>`, root);
    return true;
  }

  if ((cmd === 'h2' || cmd === 'heading2') && arg) {
    replaceBlockHtml(block, `<h2>${escapeHtml(arg)}</h2>`, root);
    return true;
  }

  if ((cmd === 'h3' || cmd === 'heading3') && arg) {
    replaceBlockHtml(block, `<h3>${escapeHtml(arg)}</h3>`, root);
    return true;
  }

  const inlineFormatter = INLINE_FORMAT_COMMANDS[cmd];
  if (inlineFormatter) {
    if (!arg) return false;
    replaceBlockHtml(block, inlineFormatter(arg), root);
    return true;
  }

  // ── /lorem N
  if (cmd === 'lorem') {
    const n = Math.max(1, Math.min(20, parseInt(arg, 10) || 3));
    const paras = Array.from({ length: n }, (_, i) => LOREM[i % LOREM.length]);
    replaceBlockHtml(block, paras.map((p) => `<p>${escapeHtml(p)}</p>`).join(''), root);
    return true;
  }

  // ── /color NAME rest of text
  if (cmd === 'color') {
    const [name, ...rest] = arg.split(/\s+/);
    if (!name) return false;
    const key = name.toLowerCase();
    const hex = /^#[0-9a-f]{3,8}$/i.test(name) ? name : COLOR_MAP[key];
    if (!hex) return false;
    const body = rest.join(' ') || 'colored text';
    replaceBlockHtml(block, `<p><span style="color:${hex}">${escapeHtml(body)}</span></p>`, root);
    return true;
  }

  // ── /qr text
  if (cmd === 'qr') {
    if (!arg) return false;
    try {
      const QRCode = (await import('qrcode')).default;
      const dataUrl = await QRCode.toDataURL(arg, { margin: 1, width: 240 });
      const html =
        `<figure class="rt-qr" data-qr="${escapeHtml(arg)}" contenteditable="false">` +
        `<img src="${dataUrl}" alt="QR: ${escapeHtml(arg.slice(0, 60))}" width="240" height="240" />` +
        `<figcaption>${escapeHtml(arg)}</figcaption>` +
        `</figure><p><br></p>`;
      replaceBlockHtml(block, html, root);
      return true;
    } catch {
      return false;
    }
  }

  // ── /mermaid CODE (semicolons or \n as line separators)
  if (cmd === 'mermaid') {
    if (!arg) return false;
    const code = arg.replace(/\s*;\s*/g, '\n');
    const html =
      `<div class="rt-mermaid" data-mermaid="${escapeHtml(code)}" contenteditable="false">` +
      `<div class="rt-mermaid-render">Rendering diagram…</div>` +
      `</div><p><br></p>`;
    replaceBlockHtml(block, html, root);
    // Hydration will render it async.
    void import('./extraHydration').then((m) => m.hydrateExtrasIn(root));
    return true;
  }

  // ── /chess FEN
  if (cmd === 'chess') {
    const fen = arg || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const html =
      `<div class="rt-chess" data-fen="${escapeHtml(fen)}" contenteditable="false">` +
      `<div class="rt-chess-render">Rendering board…</div>` +
      `</div><p><br></p>`;
    replaceBlockHtml(block, html, root);
    void import('./extraHydration').then((m) => m.hydrateExtrasIn(root));
    return true;
  }

  // ── /today  /now  /tomorrow  /yesterday   → inline date/time text
  if (cmd === 'today' || cmd === 'now' || cmd === 'tomorrow' || cmd === 'yesterday') {
    const d = new Date();
    if (cmd === 'tomorrow') d.setDate(d.getDate() + 1);
    if (cmd === 'yesterday') d.setDate(d.getDate() - 1);
    const text = cmd === 'now' ? formatDateTime(d) : formatDate(d);
    replaceBlockHtml(block, `<p>${escapeHtml(text)}</p>`, root);
    return true;
  }

  // ── /youtube <url>
  if (cmd === 'youtube' || cmd === 'yt') {
    const id = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([\w-]{11})/.exec(arg)?.[1];
    if (!id) return false;
    const html =
      `<div class="rt-embed rt-yt" contenteditable="false" data-url="${escapeHtml(arg)}">` +
      `<iframe src="https://www.youtube.com/embed/${id}" loading="lazy" allowfullscreen ` +
      `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ` +
      `frameborder="0"></iframe></div><p><br></p>`;
    replaceBlockHtml(block, html, root);
    return true;
  }

  // ── /spotify <url>
  if (cmd === 'spotify') {
    const m2 = /open\.spotify\.com\/(?:intl-\w+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/.exec(arg);
    if (!m2) return false;
    const [, type, id] = m2;
    const height = type === 'track' || type === 'episode' ? 152 : 380;
    const html =
      `<div class="rt-embed rt-spotify" contenteditable="false" data-url="${escapeHtml(arg)}">` +
      `<iframe src="https://open.spotify.com/embed/${type}/${id}" height="${height}" ` +
      `loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" ` +
      `frameborder="0"></iframe></div><p><br></p>`;
    replaceBlockHtml(block, html, root);
    return true;
  }

  // ── /tweet <url>  (also /x /twitter)
  if (cmd === 'tweet' || cmd === 'twitter' || cmd === 'x') {
    const id = /(?:twitter\.com|x\.com)\/[^\/]+\/status(?:es)?\/(\d+)/.exec(arg)?.[1];
    if (!id) return false;
    const html =
      `<div class="rt-embed rt-tweet" contenteditable="false" data-url="${escapeHtml(arg)}" data-tweet-id="${id}">` +
      `<iframe src="https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=light" ` +
      `loading="lazy" frameborder="0" scrolling="no" allowtransparency="true"></iframe>` +
      `</div><p><br></p>`;
    replaceBlockHtml(block, html, root);
    return true;
  }

  // ── /tz <city>  → "Sat 4 Jul 2026, 21:30 (Asia/Tokyo)"
  if (cmd === 'tz' || cmd === 'time' || cmd === 'timezone') {
    if (!arg) return false;
    const zone = resolveTimeZone(arg);
    if (!zone) return false;
    try {
      const now = new Date();
      const fmt = new Intl.DateTimeFormat(undefined, {
        timeZone: zone,
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      });
      const text = `${fmt.format(now)} (${zone})`;
      replaceBlockHtml(block, `<p>${escapeHtml(text)}</p>`, root);
      return true;
    } catch {
      return false;
    }
  }

  // ── /toc  → auto table of contents from headings
  if (cmd === 'toc') {
    const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6')) as HTMLElement[];
    if (headings.length === 0) {
      replaceBlockHtml(block, `<p><em>(No headings found for table of contents)</em></p>`, root);
      return true;
    }
    const usedIds = new Set<string>();
    const items = headings.map((h) => {
      const text = (h.textContent || '').trim();
      if (!text) return null;
      let id = h.id || slugify(text);
      let base = id, n = 1;
      while (usedIds.has(id)) id = `${base}-${++n}`;
      usedIds.add(id);
      if (!h.id) h.id = id;
      const level = parseInt(h.tagName[1], 10);
      return { text, id, level };
    }).filter(Boolean) as { text: string; id: string; level: number }[];

    const minLevel = Math.min(...items.map((i) => i.level));
    const html =
      `<nav class="rt-toc" contenteditable="false">` +
      `<div class="rt-toc-title">Table of Contents</div>` +
      `<ul>` +
      items.map((i) =>
        `<li style="margin-left:${(i.level - minLevel) * 16}px">` +
        `<a href="#${i.id}">${escapeHtml(i.text)}</a></li>`
      ).join('') +
      `</ul></nav><p><br></p>`;
    replaceBlockHtml(block, html, root);
    return true;
  }

  // ── /unit <expr>  → e.g. "/unit 10 km in miles" → "10 km = 6.21371 mi"
  //    /unit  or  /unit help  → inserts an inline help card with examples.
  if (cmd === 'unit' || cmd === 'convert') {
    if (!arg || /^help$/i.test(arg)) {
      replaceBlockHtml(block, UNIT_HELP_HTML, root);
      return true;
    }
    const { convertExpression } = await import('./unitConvert');
    const conv = convertExpression(arg);
    if (!conv) {
      replaceBlockHtml(
        block,
        `<div class="rt-unit-error" contenteditable="false">` +
        `Could not convert <code>${escapeHtml(arg)}</code>. ` +
        `Try <code>10 km in miles</code> or <code>100 f to c</code>.` +
        `</div><p><br></p>`,
        root,
      );
      return true;
    }
    replaceBlockHtml(block, `<p>${escapeHtml(conv.text)}</p>`, root);
    return true;
  }

  return false;
}

export function isSlashLineShortcutText(text: string): boolean {
  return /^\/(text|p|paragraph|h1|heading1|title|h2|heading2|h3|heading3|bullet|bullets|list|ul|numbered|number|ordered|ol|todo|check|checklist|quote|blockquote|divider|hr|rule|table|bold|strong|italic|italics|em|underline|u|strike|strikethrough|s|code|highlight|mark|lorem|color|qr|mermaid|chess|today|now|tomorrow|yesterday|youtube|yt|spotify|tweet|twitter|x|tz|time|timezone|toc|unit|convert)\b/i.test(text.trim());
}

/**
 * Returns true when the slash-line text is fully typed and ready to fire on
 * Space (no need to wait for Enter). Arg-less commands fire as soon as the
 * command word is complete; arg-taking commands fire once at least one arg
 * character is present.
 */
export function isSlashLineShortcutReady(text: string): boolean {
  const t = text.trim();
  // Arg-less commands (fire on bare command).
  if (/^\/(text|p|paragraph|h1|heading1|title|h2|heading2|h3|heading3|bullet|bullets|list|ul|numbered|number|ordered|ol|todo|check|checklist|quote|blockquote|divider|hr|rule|table|today|now|tomorrow|yesterday|toc)\s*$/i.test(t)) return true;
  // Arg-taking commands (require at least one non-space char after the command).
  if (/^\/(bold|strong|italic|italics|em|underline|u|strike|strikethrough|s|code|highlight|mark|h1|heading1|title|h2|heading2|h3|heading3|lorem|color|qr|mermaid|chess|youtube|yt|spotify|tweet|twitter|x|tz|time|timezone|unit|convert)\s+\S/i.test(t)) return true;
  return false;
}

/**
 * Commands safe to execute immediately after the final typed character. We only
 * auto-run argument-free commands because free-text commands (/bold hello,
 * /tz new york, /lorem 12) need Space/Enter to signal that typing is done.
 */
export function isSlashLineShortcutAutoReady(text: string): boolean {
  const t = text.trim();
  return /^\/(text|p|paragraph|h1|heading1|title|h2|heading2|h3|heading3|bullet|bullets|list|ul|numbered|number|ordered|ol|todo|check|checklist|quote|blockquote|divider|hr|rule|table|today|now|tomorrow|yesterday|toc)\s*$/i.test(t);
}

const UNIT_HELP_HTML =
  `<div class="rt-unit-help" contenteditable="false">` +
  `<div class="rt-unit-help-title">Unit converter — examples</div>` +
  `<ul>` +
  `<li><code>/unit 10 km in miles</code> → length</li>` +
  `<li><code>/unit 100 f to c</code> → temperature</li>` +
  `<li><code>/unit 5 gb as mb</code> → data</li>` +
  `<li><code>/unit 2 h in min</code> → time</li>` +
  `<li><code>/unit 1 bar in psi</code> → pressure</li>` +
  `<li><code>/unit 50 mph in kmh</code> → speed</li>` +
  `<li><code>/unit 200 lbs in kg</code> → mass</li>` +
  `<li><code>/unit 1 acre in m2</code> → area</li>` +
  `<li><code>/unit 100 kcal in kj</code> → energy</li>` +
  `<li><code>/unit 25 mpg in l100km</code> → fuel economy</li>` +
  `</ul>` +
  `<div class="rt-unit-help-foot">Tip: same syntax works inline — just type it and press <kbd>Space</kbd>.</div>` +
  `</div><p><br></p>`;


function slugify(s: string): string {
  return s.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'section';
}

/* ── Timezone city map (fallback: raw IANA name) ─────────── */

const CITY_TZ: Record<string, string> = {
  karachi: 'Asia/Karachi', lahore: 'Asia/Karachi', islamabad: 'Asia/Karachi',
  tokyo: 'Asia/Tokyo', osaka: 'Asia/Tokyo', kyoto: 'Asia/Tokyo',
  london: 'Europe/London', manchester: 'Europe/London', dublin: 'Europe/Dublin',
  paris: 'Europe/Paris', berlin: 'Europe/Berlin', madrid: 'Europe/Madrid',
  rome: 'Europe/Rome', amsterdam: 'Europe/Amsterdam', zurich: 'Europe/Zurich',
  moscow: 'Europe/Moscow', istanbul: 'Europe/Istanbul', athens: 'Europe/Athens',
  dubai: 'Asia/Dubai', abudhabi: 'Asia/Dubai', doha: 'Asia/Qatar',
  riyadh: 'Asia/Riyadh', jeddah: 'Asia/Riyadh', mecca: 'Asia/Riyadh',
  kuwait: 'Asia/Kuwait', bahrain: 'Asia/Bahrain', muscat: 'Asia/Muscat',
  tehran: 'Asia/Tehran', baghdad: 'Asia/Baghdad', beirut: 'Asia/Beirut',
  jerusalem: 'Asia/Jerusalem', telaviv: 'Asia/Jerusalem',
  delhi: 'Asia/Kolkata', newdelhi: 'Asia/Kolkata', mumbai: 'Asia/Kolkata',
  bangalore: 'Asia/Kolkata', chennai: 'Asia/Kolkata', kolkata: 'Asia/Kolkata',
  hyderabad: 'Asia/Kolkata', pune: 'Asia/Kolkata',
  dhaka: 'Asia/Dhaka', kathmandu: 'Asia/Kathmandu', colombo: 'Asia/Colombo',
  singapore: 'Asia/Singapore', kualalumpur: 'Asia/Kuala_Lumpur',
  jakarta: 'Asia/Jakarta', bangkok: 'Asia/Bangkok', hanoi: 'Asia/Ho_Chi_Minh',
  hochiminh: 'Asia/Ho_Chi_Minh', saigon: 'Asia/Ho_Chi_Minh',
  manila: 'Asia/Manila', taipei: 'Asia/Taipei',
  hongkong: 'Asia/Hong_Kong', hk: 'Asia/Hong_Kong',
  beijing: 'Asia/Shanghai', shanghai: 'Asia/Shanghai', shenzhen: 'Asia/Shanghai',
  seoul: 'Asia/Seoul', busan: 'Asia/Seoul',
  sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne',
  brisbane: 'Australia/Brisbane', perth: 'Australia/Perth',
  auckland: 'Pacific/Auckland', wellington: 'Pacific/Auckland',
  newyork: 'America/New_York', nyc: 'America/New_York', ny: 'America/New_York',
  washington: 'America/New_York', boston: 'America/New_York',
  miami: 'America/New_York', atlanta: 'America/New_York',
  chicago: 'America/Chicago', dallas: 'America/Chicago', houston: 'America/Chicago',
  denver: 'America/Denver', phoenix: 'America/Phoenix',
  losangeles: 'America/Los_Angeles', la: 'America/Los_Angeles',
  sanfrancisco: 'America/Los_Angeles', sf: 'America/Los_Angeles',
  seattle: 'America/Los_Angeles', vancouver: 'America/Vancouver',
  toronto: 'America/Toronto', montreal: 'America/Toronto', ottawa: 'America/Toronto',
  mexicocity: 'America/Mexico_City',
  saopaulo: 'America/Sao_Paulo', rio: 'America/Sao_Paulo',
  buenosaires: 'America/Argentina/Buenos_Aires',
  santiago: 'America/Santiago', lima: 'America/Lima', bogota: 'America/Bogota',
  cairo: 'Africa/Cairo', lagos: 'Africa/Lagos', nairobi: 'Africa/Nairobi',
  johannesburg: 'Africa/Johannesburg', capetown: 'Africa/Johannesburg',
  casablanca: 'Africa/Casablanca', addisababa: 'Africa/Addis_Ababa',
  reykjavik: 'Atlantic/Reykjavik', honolulu: 'Pacific/Honolulu',
  utc: 'UTC', gmt: 'UTC',
};

function resolveTimeZone(input: string): string | null {
  const key = input.toLowerCase().replace(/[\s_-]+/g, '');
  if (CITY_TZ[key]) return CITY_TZ[key];
  // Try raw input as IANA name.
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: input });
    return input;
  } catch {
    return null;
  }
}


/* ────────────────────────────────────────────────────────────────
 * 4. Date shortcuts on Space:  +3d  +2w  +1m  +1y  and  @friday
 * ──────────────────────────────────────────────────────────────── */

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function formatDateTime(d: Date): string {
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, sat: 6, saturday: 6,
};

/**
 * Replace a relative offset before caret with a formatted date/time.
 *   Date units: d (day), w (week), mo (month), y (year)
 *   Time units: h (hour), m (minute), s (second)
 * Result uses date-only format for date units, date+time for time units.
 * Examples: +3d, +2w, +1mo, +1y, +3h, +45m, -2h, -30s
 */
export function tryRelativeDateShortcut(root: HTMLElement | null): boolean {
  if (!root) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== 3) return false;
  const textNode = node as Text;
  const caret = range.startOffset;
  const before = textNode.data.slice(0, caret);
  // Time units first (mo before m so "mo" isn't eaten by "m").
  const m = /(^|\s)([+-])(\d{1,4})(mo|d|w|y|h|m|s)$/i.exec(before);
  if (!m) return false;
  if (isInsideCodeBlock(textNode, root)) return false;

  const sign = m[2] === '-' ? -1 : 1;
  const n = parseInt(m[3], 10) * sign;
  const unit = m[4].toLowerCase();
  const d = new Date();
  let isTime = false;
  if (unit === 'd') d.setDate(d.getDate() + n);
  else if (unit === 'w') d.setDate(d.getDate() + n * 7);
  else if (unit === 'mo') d.setMonth(d.getMonth() + n);
  else if (unit === 'y') d.setFullYear(d.getFullYear() + n);
  else if (unit === 'h') { d.setHours(d.getHours() + n); isTime = true; }
  else if (unit === 'm') { d.setMinutes(d.getMinutes() + n); isTime = true; }
  else if (unit === 's') { d.setSeconds(d.getSeconds() + n); isTime = true; }

  const replacement = isTime ? formatDateTime(d) : formatDate(d);
  const matchStart = caret - m[0].length + m[1].length;
  textNode.data = textNode.data.slice(0, matchStart) + replacement + textNode.data.slice(caret);
  const nr = document.createRange();
  nr.setStart(textNode, matchStart + replacement.length);
  nr.collapse(true);
  sel.removeAllRanges();
  sel.addRange(nr);
  return true;
}


/** Replace `@friday` (or `@fri`) before caret with the next Friday's date. */
export function tryWeekdayShortcut(root: HTMLElement | null): boolean {
  if (!root) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== 3) return false;
  const textNode = node as Text;
  const caret = range.startOffset;
  const before = textNode.data.slice(0, caret);
  const m = /(^|\s)@([A-Za-z]{3,9})$/.exec(before);
  if (!m) return false;
  const target = WEEKDAYS[m[2].toLowerCase()];
  if (target === undefined) return false;
  if (isInsideCodeBlock(textNode, root)) return false;

  const d = new Date();
  let diff = (target - d.getDay() + 7) % 7;
  if (diff === 0) diff = 7; // "next" occurrence, not today
  d.setDate(d.getDate() + diff);

  const replacement = formatDate(d);
  const matchStart = caret - m[0].length + m[1].length;
  textNode.data = textNode.data.slice(0, matchStart) + replacement + textNode.data.slice(caret);
  const nr = document.createRange();
  nr.setStart(textNode, matchStart + replacement.length);
  nr.collapse(true);
  sel.removeAllRanges();
  sel.addRange(nr);
  return true;
}

/* ────────────────────────────────────────────────────────────────
 * 5. Repeated word detection (the the)
 *    Runs on Space keydown. If the word just typed matches the
 *    previous word (case-insensitive), wrap it in .rt-dup-word.
 *    Returns true if it consumed the event (space is re-inserted).
 * ──────────────────────────────────────────────────────────────── */

export function tryRepeatedWordShortcut(root: HTMLElement | null): boolean {
  if (!root) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== 3) return false;
  const textNode = node as Text;
  const caret = range.startOffset;
  const before = textNode.data.slice(0, caret);
  // Match "word1<sep>word2" at end where words match case-insensitively.
  // <sep> = any run of whitespace + punctuation (comma, semicolon, dash, etc.),
  // so "The, the" or "the — the" also trigger.
  const m = /(^|[\s.,;:!?(){}\[\]"'\-–—])([A-Za-z]{2,})([\s.,;:!?(){}\[\]"'\-–—]+)([A-Za-z]{2,})$/.exec(before);
  if (!m) return false;
  if (!/\s/.test(m[3])) return false; // require at least one whitespace char in separator
  if (m[2].toLowerCase() !== m[4].toLowerCase()) return false;
  if (isInsideCodeBlock(textNode, root)) return false;



  // Split textNode so we can wrap word2 in a span.
  const word2Start = caret - m[4].length;
  const after = textNode.data.slice(caret);
  const wordText = m[4];
  textNode.data = textNode.data.slice(0, word2Start);

  const span = document.createElement('span');
  span.className = 'rt-dup-word';
  span.title = 'Repeated word';
  span.textContent = wordText;

  const parent = textNode.parentNode!;
  const tail = document.createTextNode(' ' + after);
  parent.insertBefore(span, textNode.nextSibling);
  parent.insertBefore(tail, span.nextSibling);

  const nr = document.createRange();
  nr.setStart(tail, 1); // caret after the space we just inserted
  nr.collapse(true);
  sel.removeAllRanges();
  sel.addRange(nr);
  return true;
}


/* ────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────── */

function isInsideCodeBlock(node: Node, root: HTMLElement): boolean {
  let el: Node | null = node.nodeType === 1 ? node : node.parentNode;
  while (el && el !== root) {
    if (el.nodeType === 1) {
      const tag = (el as HTMLElement).tagName;
      if (tag === 'CODE' || tag === 'PRE') return true;
      if ((el as HTMLElement).classList?.contains('rt-codeblock')) return true;
    }
    el = el.parentNode;
  }
  return false;
}

function findBlock(node: Node, root: HTMLElement): HTMLElement | null {
  if (node === root || node.parentNode === root) return root;
  let el: Node | null = node.nodeType === 1 ? node : node.parentNode;
  while (el && el !== root) {
    if (el.nodeType === 1) {
      const tag = (el as HTMLElement).tagName;
      if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE'].includes(tag)) {
        return el as HTMLElement;
      }
    }
    el = el.parentNode;
  }
  return null;
}

function replaceBlockHtml(block: HTMLElement, html: string, root: HTMLElement) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const nodes = Array.from(tmp.childNodes);
  if (block === root) {
    root.replaceChildren(...nodes);
  } else {
  const parent = block.parentNode!;
  const anchor = block.nextSibling;
  parent.removeChild(block);
  nodes.forEach((n) => parent.insertBefore(n, anchor));
  }
  // Place caret after inserted content.
  const last = nodes[nodes.length - 1];
  if (last) {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(last);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
  // Ensure root stays focused.
  root.focus();
}
