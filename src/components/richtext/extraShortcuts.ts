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
 *   ├─ Enter keydown (line-based) ─────────────
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

  return false;
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

/** Replace `+3d`, `+2w`, `+1m`, `+1y` before caret with a formatted future date. */
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
  const m = /(^|\s)([+-])(\d{1,3})([dwmy])$/i.exec(before);
  if (!m) return false;
  if (isInsideCodeBlock(textNode, root)) return false;

  const sign = m[2] === '-' ? -1 : 1;
  const n = parseInt(m[3], 10) * sign;
  const unit = m[4].toLowerCase();
  const d = new Date();
  if (unit === 'd') d.setDate(d.getDate() + n);
  else if (unit === 'w') d.setDate(d.getDate() + n * 7);
  else if (unit === 'm') d.setMonth(d.getMonth() + n);
  else if (unit === 'y') d.setFullYear(d.getFullYear() + n);

  const replacement = formatDate(d);
  const matchStart = caret - m[0].length + m[1].length; // preserve leading space
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
  // Match "word1 word2" at end where words are same (2+ letters).
  const m = /(^|[\s.,;:!?(){}\[\]"'])([A-Za-z]{2,})(\s+)([A-Za-z]{2,})$/.exec(before);
  if (!m) return false;
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
  const parent = block.parentNode!;
  const anchor = block.nextSibling;
  parent.removeChild(block);
  nodes.forEach((n) => parent.insertBefore(n, anchor));
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
