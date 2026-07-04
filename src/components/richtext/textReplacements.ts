/**
 * Auto text replacements for the rich-text editor.
 *
 * - Smart quotes:  "x"  → "x"     'x' → 'x'
 * - Em-dash:       --   → —       (on next space)
 * - Ellipsis:      ...  → …       (on next space)
 * - Symbols:       (c)  → ©       (tm) → ™       (r) → ®
 */

function isInsideCodeLikeBlock(node: Node, root: HTMLElement): boolean {
  let el: Node | null = node.nodeType === 1 ? node : node.parentNode;
  while (el && el !== root) {
    if (el.nodeType === 1) {
      const tag = (el as HTMLElement).tagName;
      if (tag === 'CODE' || tag === 'PRE') return true;
      const cls = (el as HTMLElement).classList;
      if (cls?.contains('rt-codeblock') || cls?.contains('rt-katex')) return true;
    }
    el = el.parentNode;
  }
  return false;
}

function setCaret(textNode: Text, offset: number) {
  const sel = window.getSelection();
  const r = document.createRange();
  r.setStart(textNode, offset);
  r.collapse(true);
  sel?.removeAllRanges();
  sel?.addRange(r);
}

/** Called when user typed `"` or `'`. Inserts a curly quote and consumes the event. */
export function trySmartQuote(root: HTMLElement | null, key: '"' | "'"): boolean {
  if (!root) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  const containerText = node.nodeType === 3 ? node as Text : null;
  if (containerText && isInsideCodeLikeBlock(containerText, root)) return false;
  const prevChar = containerText
    ? containerText.data.slice(0, range.startOffset).slice(-1)
    : '';
  const isOpening = !prevChar || /[\s([{\-–—]/.test(prevChar);
  const replacement =
    key === '"' ? (isOpening ? '\u201C' : '\u201D')
                : (isOpening ? '\u2018' : '\u2019');
  document.execCommand('insertText', false, replacement);
  return true;
}

/**
 * Runs on space keydown. Replaces `--` with `—`, `...` with `…` before caret.
 * Does NOT consume the space — returns true only if it mutated the DOM
 * (so caller can call handleInput). Space still inserts normally afterwards.
 */
export function tryDashEllipsis(root: HTMLElement | null): boolean {
  if (!root) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== 3) return false;
  const textNode = node as Text;
  if (isInsideCodeLikeBlock(textNode, root)) return false;

  const caret = range.startOffset;
  const before = textNode.data.slice(0, caret);

  if (before.endsWith('...')) {
    textNode.data = textNode.data.slice(0, caret - 3) + '\u2026' + textNode.data.slice(caret);
    setCaret(textNode, caret - 3 + 1);
    return true;
  }
  if (before.endsWith('---')) {
    // en/em: three dashes → em-dash (Word behavior).
    textNode.data = textNode.data.slice(0, caret - 3) + '\u2014' + textNode.data.slice(caret);
    setCaret(textNode, caret - 3 + 1);
    return true;
  }
  if (before.endsWith('--')) {
    textNode.data = textNode.data.slice(0, caret - 2) + '\u2014' + textNode.data.slice(caret);
    setCaret(textNode, caret - 2 + 1);
    return true;
  }
  return false;
}

/** Fires on `)` keydown. Replaces `(c`, `(tm`, `(r` with the symbol; consumes the event. */
export function trySymbolShortcut(root: HTMLElement | null): boolean {
  if (!root) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== 3) return false;
  const textNode = node as Text;
  if (isInsideCodeLikeBlock(textNode, root)) return false;

  const caret = range.startOffset;
  const before = textNode.data.slice(0, caret);
  const patterns: [string, string][] = [
    ['(tm', '\u2122'], ['(TM', '\u2122'], ['(Tm', '\u2122'],
    ['(c', '\u00A9'],  ['(C', '\u00A9'],
    ['(r', '\u00AE'],  ['(R', '\u00AE'],
  ];
  for (const [pat, sym] of patterns) {
    if (before.endsWith(pat)) {
      const start = caret - pat.length;
      textNode.data = textNode.data.slice(0, start) + sym + textNode.data.slice(caret);
      setCaret(textNode, start + sym.length);
      return true;
    }
  }
  return false;
}
