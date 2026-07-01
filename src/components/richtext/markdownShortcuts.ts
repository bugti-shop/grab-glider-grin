/**
 * Notion / Bear-style markdown auto-format shortcuts for our contenteditable
 * rich-text editor. Called from RichTextEditor's keydown handler.
 *
 * Block shortcuts fire when Space is typed after one of these tokens at the
 * *start* of the current block:
 *
 *   #       → H1        (##, ###, #### → H2/H3/H4)
 *   -, *, + → bullet list
 *   1.      → numbered list  (any digits + '.')
 *   [], [ ] → todo item (unchecked)
 *   [x]     → todo item (checked)
 *   >       → blockquote
 *
 * Divider: typing `---` on an empty line and pressing Enter turns the block
 * into an <hr>.
 *
 * Inline shortcuts fire when the *closing* marker is typed and the text
 * before the caret in the same text node contains a matching pair:
 *
 *   **X**   → bold
 *   *X*     → italic
 *   _X_     → italic
 *   `X`     → inline code
 *   ~~X~~   → strikethrough
 *
 * Each helper returns `true` when it handled the event so the caller can
 * `preventDefault()` and skip its own logic.
 */

type BlockEl = HTMLElement;

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE',
]);

function getCaretBlock(root: HTMLElement): BlockEl | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  let node: Node | null = sel.getRangeAt(0).startContainer;
  while (node && node !== root) {
    if (node.nodeType === 1 && BLOCK_TAGS.has((node as HTMLElement).tagName)) {
      return node as BlockEl;
    }
    node = node.parentNode;
  }
  return null;
}

/** Text of the current block up to the caret. */
function textBeforeCaretInBlock(block: BlockEl): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return '';
  const range = sel.getRangeAt(0).cloneRange();
  const pre = document.createRange();
  pre.selectNodeContents(block);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString();
}

function moveCaretIntoStart(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  // Deepest first descendant so the caret sits inside any inner span/text.
  let target: Node = el;
  while (target.firstChild) target = target.firstChild;
  if (target.nodeType === 3) range.setStart(target, 0);
  else range.setStart(target, 0);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function replaceBlockWith(oldBlock: BlockEl, newBlock: HTMLElement) {
  oldBlock.replaceWith(newBlock);
  moveCaretIntoStart(newBlock);
}

/**
 * Handle a Space keypress. Returns true if a block conversion happened
 * (caller should preventDefault + fire handleInput).
 */
export function tryMarkdownBlockShortcut(root: HTMLElement | null): boolean {
  if (!root) return false;
  const block = getCaretBlock(root);
  if (!block) return false;
  // Don't rewrite lines that already live inside a list, table, code block etc.
  if (block.closest('pre, code, table, .flowist-web-clip, [data-webclip], [data-math]')) {
    return false;
  }
  if (block.tagName === 'LI') return false; // already a list — let native Space through

  const text = textBeforeCaretInBlock(block).replace(/\u00A0/g, ' ');
  // Only convert if the token is *all* that's typed so far on this line.
  const match = text.match(/^(#{1,4}|-|\*|\+|\d+\.|\[\]|\[ \]|\[x\]|>)$/i);
  if (!match) return false;
  const token = match[1];

  const clearBlock = () => { block.textContent = ''; };

  // Headings ------------------------------------------------------------
  if (/^#{1,4}$/.test(token)) {
    const level = token.length;
    const h = document.createElement(`h${level}`);
    h.innerHTML = '<br>';
    replaceBlockWith(block, h);
    return true;
  }

  // Bullet list ---------------------------------------------------------
  if (token === '-' || token === '*' || token === '+') {
    const ul = document.createElement('ul');
    const li = document.createElement('li');
    li.innerHTML = '<br>';
    ul.appendChild(li);
    replaceBlockWith(block, ul);
    moveCaretIntoStart(li);
    return true;
  }

  // Numbered list -------------------------------------------------------
  if (/^\d+\.$/.test(token)) {
    const ol = document.createElement('ol');
    const li = document.createElement('li');
    li.innerHTML = '<br>';
    ol.appendChild(li);
    replaceBlockWith(block, ol);
    moveCaretIntoStart(li);
    return true;
  }

  // Todo checklist ------------------------------------------------------
  if (token === '[]' || token === '[ ]' || token.toLowerCase() === '[x]') {
    const checked = token.toLowerCase() === '[x]';
    const ul = document.createElement('ul');
    ul.className = 'checklist';
    const li = document.createElement('li');
    li.className = 'checklist-item';
    if (checked) li.setAttribute('checked', 'true');
    li.innerHTML =
      `<input type="checkbox" class="checklist-checkbox"${checked ? ' checked' : ''} />` +
      `<span class="checklist-text">\u00A0</span>`;
    ul.appendChild(li);
    replaceBlockWith(block, ul);
    const span = li.querySelector('.checklist-text') as HTMLElement | null;
    if (span) moveCaretIntoStart(span);
    return true;
  }

  // Blockquote ----------------------------------------------------------
  if (token === '>') {
    const bq = document.createElement('blockquote');
    bq.innerHTML = '<br>';
    replaceBlockWith(block, bq);
    return true;
  }

  clearBlock();
  return false;
}

/**
 * Handle Enter: convert `---` on an empty line into a divider.
 */
export function tryMarkdownEnterShortcut(root: HTMLElement | null): boolean {
  if (!root) return false;
  const block = getCaretBlock(root);
  if (!block) return false;
  if (block.closest('pre, code, table, li')) return false;
  const text = textBeforeCaretInBlock(block).replace(/\u00A0/g, ' ').trim();
  if (text !== '---' && text !== '***' && text !== '___') return false;
  const hr = document.createElement('hr');
  const nextP = document.createElement('p');
  nextP.innerHTML = '<br>';
  block.replaceWith(hr);
  hr.insertAdjacentElement('afterend', nextP);
  moveCaretIntoStart(nextP);
  return true;
}

/**
 * Inline shortcut. Called on keydown of the *closing* marker character.
 *   char is the raw character typed: '*', '_', '`', '~'.
 * Returns true if a wrap happened.
 */
export function tryMarkdownInlineShortcut(char: string, root: HTMLElement | null): boolean {
  if (!root) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== 3) return false;
  const textNode = node as Text;
  const caret = range.startOffset;
  const before = textNode.data.slice(0, caret);

  // Choose the token & wrapper based on the closing char + what's already typed.
  let token = '';
  let tag: 'strong' | 'em' | 'code' | 'del' | null = null;

  if (char === '*') {
    if (before.endsWith('*') && /\*\*[^*]+\*$/.test(before + '*')) { token = '**'; tag = 'strong'; }
    else if (/(^|[^*])\*[^*\s][^*]*$/.test(before)) { token = '*'; tag = 'em'; }
  } else if (char === '_') {
    if (/(^|[^_])_[^_\s][^_]*$/.test(before)) { token = '_'; tag = 'em'; }
  } else if (char === '`') {
    if (/`[^`\s][^`]*$/.test(before)) { token = '`'; tag = 'code'; }
  } else if (char === '~') {
    if (before.endsWith('~') && /~~[^~]+~$/.test(before + '~')) { token = '~~'; tag = 'del'; }
  }
  if (!tag || !token) return false;

  // Find the matching opener.
  const openerIdx = before.lastIndexOf(token, before.length - token.length - 1);
  if (openerIdx < 0) return false;
  const inner = before.slice(openerIdx + token.length, before.length - (token === '**' || token === '~~' ? 1 : 0));
  if (!inner || /\s$/.test(inner) || /^\s/.test(inner)) return false;

  // Replace `token + inner + partialClose` with wrapped element.
  const startDelete = openerIdx;
  const wrap = document.createElement(tag);
  wrap.textContent = inner;

  // Delete the raw markdown range from the text node.
  const parent = textNode.parentNode!;
  const remainingAfter = textNode.data.slice(caret);
  textNode.data = textNode.data.slice(0, startDelete);
  // Insert wrapper + trailing text after the trimmed node.
  parent.insertBefore(wrap, textNode.nextSibling);
  const trailing = document.createTextNode('\u200B' + remainingAfter); // ZWSP escape from wrapper
  parent.insertBefore(trailing, wrap.nextSibling);

  // Place caret after the ZWSP so subsequent typing is unformatted.
  const newRange = document.createRange();
  newRange.setStart(trailing, 1);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);
  return true;
}
