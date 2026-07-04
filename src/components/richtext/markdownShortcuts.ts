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
 * When the caret is inside an existing <li>, the same tokens create a *nested*
 * sub-list rather than replacing the block, giving smart Tab-less indentation.
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
 * All shortcuts (block, inline, enter, paste) are silently skipped when the
 * caret sits inside a fenced code block (`<pre>` / `<code>`) or inside a text
 * region that has an unclosed ``` fence.
 */

type BlockEl = HTMLElement;

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE',
]);

/** True if caret is inside <pre>/<code> or an unclosed ``` fence in current block text. */
export function isInsideCode(root: HTMLElement | null): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  let node: Node | null = sel.getRangeAt(0).startContainer;
  while (node && node !== root) {
    if (node.nodeType === 1) {
      const el = node as HTMLElement;
      if (el.tagName === 'PRE' || el.tagName === 'CODE') return true;
      if (el.classList?.contains('rt-codeblock')) return true;
    }
    node = node.parentNode;
  }
  // Partial fence: count ``` occurrences from block start up to caret.
  const block = getCaretBlock(root!);
  if (!block) return false;
  const text = textBeforeCaretInBlock(block);
  const fences = (text.match(/```/g) || []).length;
  return fences % 2 === 1;
}

function getCaretBlock(root: HTMLElement): BlockEl | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  let node: Node | null = range.startContainer;

  // Fresh/empty contenteditable editors often begin with text typed directly
  // inside the editor root instead of inside a <p>/<div>. Treat that root as
  // the active block so first-line shortcuts like `# ` and `- ` work.
  if (node === root || node.parentNode === root) {
    return root as BlockEl;
  }

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
  let target: Node = el;
  while (target.firstChild) target = target.firstChild;
  if (target.nodeType === 3) range.setStart(target, 0);
  else range.setStart(target, 0);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function replaceBlockWith(oldBlock: BlockEl, newBlock: HTMLElement, root?: HTMLElement | null) {
  if (root && oldBlock === root) {
    root.replaceChildren(newBlock);
  } else {
    oldBlock.replaceWith(newBlock);
  }
  moveCaretIntoStart(newBlock);
}

/**
 * Handle a Space keypress. Returns true if a block conversion happened
 * (caller should preventDefault + fire handleInput).
 */
export function tryMarkdownBlockShortcut(root: HTMLElement | null): boolean {
  if (!root) return false;
  if (isInsideCode(root)) return false;
  const block = getCaretBlock(root);
  if (!block) return false;
  // Don't rewrite lines inside these special blocks.
  if (block.closest('pre, code, table, .flowist-web-clip, [data-webclip], [data-math], .rt-codeblock')) {
    return false;
  }

  const text = textBeforeCaretInBlock(block).replace(/\u00A0/g, ' ');
  // Only convert if the token is *all* that's typed so far on this line.
  const match = text.match(/^(#{1,6}|-|\*|\+|\d+\.|\[\]|\[ \]|\[x\]|>|```)$/i);
  if (!match) return false;
  const token = match[1];

  // ── Nested-list smart indent when inside an existing <li> ────────────
  if (block.tagName === 'LI') {
    // Only bullet / numbered / checklist create nested sub-lists.
    if (token === '-' || token === '*' || token === '+' || /^\d+\.$/.test(token) ||
        token === '[]' || token === '[ ]' || token.toLowerCase() === '[x]') {
      const li = block as HTMLLIElement;
      const parentTag = li.parentElement?.tagName === 'OL' ? 'ol' : 'ul';
      const isNumbered = /^\d+\.$/.test(token);
      const isCheck = token === '[]' || token === '[ ]' || token.toLowerCase() === '[x]';
      const wantTag: 'ul' | 'ol' = isNumbered ? 'ol' : 'ul';

      // Clear the typed token from the current LI.
      li.textContent = '';

      // Find or create nested sublist inside current LI.
      let nested = li.querySelector(`:scope > ${wantTag}`) as HTMLElement | null;
      if (!nested) {
        nested = document.createElement(wantTag);
        if (isCheck) nested.className = 'checklist';
        li.appendChild(nested);
      }

      if (isCheck) {
        const checked = token.toLowerCase() === '[x]';
        const nLi = document.createElement('li');
        nLi.className = 'checklist-item';
        if (checked) nLi.setAttribute('checked', 'true');
        nLi.innerHTML =
          `<input type="checkbox" class="checklist-checkbox"${checked ? ' checked' : ''} />` +
          `<span class="checklist-text">\u00A0</span>`;
        nested.appendChild(nLi);
        const span = nLi.querySelector('.checklist-text') as HTMLElement | null;
        if (span) moveCaretIntoStart(span);
      } else {
        const nLi = document.createElement('li');
        nLi.innerHTML = '<br>';
        nested.appendChild(nLi);
        moveCaretIntoStart(nLi);
      }
      // Suppress parent numbering hint by keeping unused variable referenced.
      void parentTag;
      return true;
    }
    return false; // headings / quotes inside an <li> — let native Space through
  }

  const clearBlock = () => { block.textContent = ''; };

  // Headings ------------------------------------------------------------
  if (/^#{1,6}$/.test(token)) {
    const level = token.length;
    const h = document.createElement(`h${level}`);
    h.innerHTML = '<br>';
    replaceBlockWith(block, h, root);
    return true;
  }

  // Bullet list ---------------------------------------------------------
  if (token === '-' || token === '*' || token === '+') {
    const ul = document.createElement('ul');
    const li = document.createElement('li');
    li.innerHTML = '<br>';
    ul.appendChild(li);
    replaceBlockWith(block, ul, root);
    moveCaretIntoStart(li);
    return true;
  }

  // Numbered list -------------------------------------------------------
  if (/^\d+\.$/.test(token)) {
    const ol = document.createElement('ol');
    const li = document.createElement('li');
    li.innerHTML = '<br>';
    ol.appendChild(li);
    replaceBlockWith(block, ol, root);
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
    replaceBlockWith(block, ul, root);
    const span = li.querySelector('.checklist-text') as HTMLElement | null;
    if (span) moveCaretIntoStart(span);
    return true;
  }

  // Blockquote ----------------------------------------------------------
  if (token === '>') {
    const bq = document.createElement('blockquote');
    bq.innerHTML = '<br>';
    replaceBlockWith(block, bq, root);
    return true;
  }

  // Code block ----------------------------------------------------------
  if (token === '```') {
    const pre = document.createElement('pre');
    pre.className = 'rt-codeblock';
    pre.setAttribute('data-lang', 'text');
    const code = document.createElement('code');
    code.appendChild(document.createTextNode('\u200B'));
    pre.appendChild(code);
    replaceBlockWith(block, pre, root);
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.setStart(code.firstChild || code, 1);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    return true;
  }

  clearBlock();
  return false;
}

function moveCaretToEnd(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function replaceCurrentBlockWithContent(
  oldBlock: BlockEl,
  newBlock: HTMLElement,
  caretTarget: HTMLElement,
  root?: HTMLElement | null,
) {
  if (root && oldBlock === root) {
    root.replaceChildren(newBlock);
  } else {
    oldBlock.replaceWith(newBlock);
  }
  moveCaretToEnd(caretTarget);
}

/**
 * Safety-net conversion for mobile/IME paths where the browser inserts
 * `# Heading` / `* item` as normal text without delivering the Space keydown.
 * Runs after input, preserving the text after the marker instead of requiring
 * the marker to be alone on the line.
 */
export function tryMarkdownCompletedBlockShortcut(root: HTMLElement | null): boolean {
  if (!root) return false;
  if (isInsideCode(root)) return false;
  const block = getCaretBlock(root);
  if (!block) return false;
  if (block.closest('pre, code, table, .flowist-web-clip, [data-webclip], [data-math], .rt-codeblock')) {
    return false;
  }

  const text = textBeforeCaretInBlock(block).replace(/\u00A0/g, ' ');
  // Primary: token + space + content (e.g. "# Heading", "- item")
  // Fallback: heading/quote without space (e.g. "#Heading", "##Sub", ">quote")
  let match = text.match(/^(#{1,6}|-|\*|\+|\d+\.|\[\]|\[ \]|\[x\]|>)\s+(.+)$/i);
  if (!match) {
    match = text.match(/^(#{1,6}|>)(\S.*)$/);
  }
  if (!match) return false;

  const token = match[1];
  const content = match[2];
  if (!content.trim()) return false;

  if (/^#{1,6}$/.test(token)) {
    const level = token.length;
    const h = document.createElement(`h${level}`);
    h.textContent = content;
    replaceCurrentBlockWithContent(block, h, h, root);
    return true;
  }

  if (token === '-' || token === '*' || token === '+') {
    const ul = document.createElement('ul');
    const li = document.createElement('li');
    li.textContent = content;
    ul.appendChild(li);
    replaceCurrentBlockWithContent(block, ul, li, root);
    return true;
  }

  if (/^\d+\.$/.test(token)) {
    const ol = document.createElement('ol');
    const li = document.createElement('li');
    li.textContent = content;
    ol.appendChild(li);
    replaceCurrentBlockWithContent(block, ol, li, root);
    return true;
  }

  if (token === '[]' || token === '[ ]' || token.toLowerCase() === '[x]') {
    const checked = token.toLowerCase() === '[x]';
    const ul = document.createElement('ul');
    ul.className = 'checklist';
    const li = document.createElement('li');
    li.className = 'checklist-item';
    if (checked) li.setAttribute('checked', 'true');
    li.innerHTML =
      `<input type="checkbox" class="checklist-checkbox"${checked ? ' checked' : ''} />` +
      `<span class="checklist-text"></span>`;
    const span = li.querySelector('.checklist-text') as HTMLElement;
    span.textContent = content;
    ul.appendChild(li);
    replaceCurrentBlockWithContent(block, ul, span, root);
    return true;
  }

  if (token === '>') {
    const bq = document.createElement('blockquote');
    bq.textContent = content;
    replaceCurrentBlockWithContent(block, bq, bq, root);
    return true;
  }

  return false;
}

/**
 * Handle Enter: convert `---` on an empty line into a divider.
 */
export function tryMarkdownEnterShortcut(root: HTMLElement | null): boolean {
  if (!root) return false;
  if (isInsideCode(root)) return false;
  const block = getCaretBlock(root);
  if (!block) return false;
  if (block.closest('pre, code, table, li, .rt-codeblock')) return false;
  const text = textBeforeCaretInBlock(block).replace(/\u00A0/g, ' ').trim();
  if (text !== '---' && text !== '***' && text !== '___') return false;
  const hr = document.createElement('hr');
  const nextP = document.createElement('p');
  nextP.innerHTML = '<br>';
  if (block === root) {
    root.replaceChildren(hr, nextP);
  } else {
    block.replaceWith(hr);
    hr.insertAdjacentElement('afterend', nextP);
  }
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
  if (isInsideCode(root)) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== 3) return false;
  const textNode = node as Text;
  const caret = range.startOffset;
  const before = textNode.data.slice(0, caret);

  let token = '';
  let tag: 'strong' | 'em' | 'code' | 'del' | 'mark' | null = null;

  if (char === '*') {
    if (before.endsWith('*') && /\*\*[^*]+\*$/.test(before + '*')) { token = '**'; tag = 'strong'; }
    else if (/(^|[^*])\*[^*\s][^*]*$/.test(before)) { token = '*'; tag = 'em'; }
  } else if (char === '_') {
    if (/(^|[^_])_[^_\s][^_]*$/.test(before)) { token = '_'; tag = 'em'; }
  } else if (char === '`') {
    if (/`[^`\s][^`]*$/.test(before)) { token = '`'; tag = 'code'; }
  } else if (char === '~') {
    if (before.endsWith('~') && /~~[^~]+~$/.test(before + '~')) { token = '~~'; tag = 'del'; }
  } else if (char === '=') {
    if (before.endsWith('=') && /==[^=]+=$/.test(before + '=')) { token = '=='; tag = 'mark'; }
  }
  if (!tag || !token) return false;

  const openerIdx = before.lastIndexOf(token, before.length - token.length - 1);
  if (openerIdx < 0) return false;
  const inner = before.slice(openerIdx + token.length, before.length - (token === '**' || token === '~~' || token === '==' ? 1 : 0));
  if (!inner || /\s$/.test(inner) || /^\s/.test(inner)) return false;

  const startDelete = openerIdx;
  const wrap = document.createElement(tag);
  wrap.textContent = inner;

  const parent = textNode.parentNode!;
  const remainingAfter = textNode.data.slice(caret);
  textNode.data = textNode.data.slice(0, startDelete);
  parent.insertBefore(wrap, textNode.nextSibling);
  const trailing = document.createTextNode('\u200B' + remainingAfter);
  parent.insertBefore(trailing, wrap.nextSibling);

  const newRange = document.createRange();
  newRange.setStart(trailing, 1);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);
  return true;
}

/**
 * Mobile IME safety net for inline markdown. Runs on every `input` event
 * (after the character lands). If the text node immediately before the caret
 * ends with a complete `**X**`, `*X*`, `_X_`, `` `X` ``, `~~X~~`, or `==X==`
 * pair, replace it with the wrapped element in place. Idempotent and
 * cancel-free — works even when `beforeinput` isn't cancelable (Android/iOS
 * composition, autocorrect, swipe-typing).
 */
export function tryMarkdownInlinePostInput(root: HTMLElement | null): boolean {
  if (!root) return false;
  if (isInsideCode(root)) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== 3) return false;
  const textNode = node as Text;
  const caret = range.startOffset;
  const before = textNode.data.slice(0, caret);
  if (before.length < 3) return false;

  // Try in order of specificity so `**` beats `*` and `~~` beats `~`.
  // Each regex captures the whole pair ending at the caret; look-behind avoids
  // matching mid-word markers (e.g. `a*b*c` shouldn't convert on the 2nd `*`).
  const patterns: Array<{ re: RegExp; token: string; tag: 'strong' | 'em' | 'code' | 'del' | 'mark' }> = [
    { re: /(^|[^*])(\*\*([^*\s][^*]*[^*\s]|[^*\s])\*\*)$/, token: '**', tag: 'strong' },
    { re: /(^|[^~])(~~([^~\s][^~]*[^~\s]|[^~\s])~~)$/, token: '~~', tag: 'del' },
    { re: /(^|[^=])(==([^=\s][^=]*[^=\s]|[^=\s])==)$/, token: '==', tag: 'mark' },
    { re: /(^|[^*\w])(\*([^*\s][^*]*[^*\s]|[^*\s])\*)$/, token: '*', tag: 'em' },
    { re: /(^|[^_\w])(_([^_\s][^_]*[^_\s]|[^_\s])_)$/, token: '_', tag: 'em' },
    { re: /(^|[^`])(`([^`\s][^`]*[^`\s]|[^`\s])`)$/, token: '`', tag: 'code' },
  ];

  for (const { re, tag } of patterns) {
    const m = before.match(re);
    if (!m) continue;
    const full = m[2];
    const inner = m[3];
    if (!inner) continue;
    const startDelete = before.length - full.length;

    const parent = textNode.parentNode;
    if (!parent) return false;
    const wrap = document.createElement(tag);
    wrap.textContent = inner;

    const remainingAfter = textNode.data.slice(caret);
    textNode.data = textNode.data.slice(0, startDelete);
    parent.insertBefore(wrap, textNode.nextSibling);
    const trailing = document.createTextNode('\u200B' + remainingAfter);
    parent.insertBefore(trailing, wrap.nextSibling);

    const newRange = document.createRange();
    newRange.setStart(trailing, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    return true;
  }
  return false;
}

/**
 * Handle `)` keypress: convert `[text](url)` → link and `![alt](url)` → image
 * when the caret sits right after the matching pattern in a text node.
 * Returns true if a conversion happened.
 */
export function tryMarkdownLinkOrImageShortcut(root: HTMLElement | null): boolean {
  if (!root) return false;
  if (isInsideCode(root)) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== 3) return false;
  const textNode = node as Text;
  const caret = range.startOffset;
  const before = textNode.data.slice(0, caret);

  // Image first (leading `!`), then link.
  const imgMatch = before.match(/(!\[([^\]]*)\]\(([^)\s]+)\))$/);
  const linkMatch = !imgMatch ? before.match(/(?:^|[^!])(\[([^\]]+)\]\(([^)\s]+)\))$/) : null;

  let full = '';
  let el: HTMLElement | null = null;
  if (imgMatch) {
    full = imgMatch[1];
    const img = document.createElement('img');
    img.src = imgMatch[3];
    img.alt = imgMatch[2] || '';
    img.style.maxWidth = '100%';
    el = img;
  } else if (linkMatch) {
    full = linkMatch[1];
    const a = document.createElement('a');
    a.href = linkMatch[3];
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = linkMatch[2];
    el = a;
  }
  if (!el) return false;

  const startDelete = before.length - full.length;
  const parent = textNode.parentNode!;
  const remainingAfter = textNode.data.slice(caret);
  textNode.data = textNode.data.slice(0, startDelete);
  parent.insertBefore(el, textNode.nextSibling);
  const trailing = document.createTextNode('\u200B' + remainingAfter);
  parent.insertBefore(trailing, el.nextSibling);

  const newRange = document.createRange();
  newRange.setStart(trailing, 1);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);
  return true;
}

/**
 * Handle `|` + Enter or `||` + space at start of an empty block: insert a
 * default 2-column markdown-style table with a header row.
 * Also converts a completed `|a|b|` \n `|-|-|` header pattern into a real table.
 */
export function tryMarkdownTableShortcut(root: HTMLElement | null): boolean {
  if (!root) return false;
  if (isInsideCode(root)) return false;
  const block = getCaretBlock(root);
  if (!block) return false;
  if (block.closest('pre, code, table, .rt-codeblock')) return false;

  const text = textBeforeCaretInBlock(block).replace(/\u00A0/g, ' ').trim();

  // Quick default table: `||` on an empty line → 2x2 with header row.
  if (text === '||') {
    const tableHTML =
      '<table style="border-collapse:collapse;width:100%;margin:8px 0;">' +
      '<thead><tr>' +
      '<th style="border:1px solid hsl(var(--border));padding:6px;text-align:left;">Header 1</th>' +
      '<th style="border:1px solid hsl(var(--border));padding:6px;text-align:left;">Header 2</th>' +
      '</tr></thead>' +
      '<tbody>' +
      '<tr><td style="border:1px solid hsl(var(--border));padding:6px;">&nbsp;</td>' +
      '<td style="border:1px solid hsl(var(--border));padding:6px;">&nbsp;</td></tr>' +
      '<tr><td style="border:1px solid hsl(var(--border));padding:6px;">&nbsp;</td>' +
      '<td style="border:1px solid hsl(var(--border));padding:6px;">&nbsp;</td></tr>' +
      '</tbody></table>';
    const wrap = document.createElement('div');
    wrap.innerHTML = tableHTML + '<p><br></p>';
    const table = wrap.firstElementChild as HTMLElement;
    const nextP = wrap.lastElementChild as HTMLElement;
    if (root === block) {
      root.replaceChildren(table, nextP);
    } else {
      block.replaceWith(table);
      table.insertAdjacentElement('afterend', nextP);
    }
    moveCaretIntoStart(nextP);
    return true;
  }

  return false;
}

/**
 * Called on Enter: if the previous block is a pipe header row and the current
 * block matches a separator like `|---|---|`, convert both into a real table.
 */
export function tryMarkdownPipeTableEnter(root: HTMLElement | null): boolean {
  if (!root) return false;
  if (isInsideCode(root)) return false;
  const block = getCaretBlock(root);
  if (!block) return false;
  if (block.closest('pre, code, table, li, .rt-codeblock')) return false;

  const curText = (block.textContent || '').trim();
  const sepMatch = curText.match(/^\|?\s*(:?-{3,}:?\s*\|\s*)+:?-{3,}:?\s*\|?$/);
  if (!sepMatch) return false;

  const prev = block.previousElementSibling as HTMLElement | null;
  if (!prev) return false;
  const headerText = (prev.textContent || '').trim();
  if (!/^\|.*\|$/.test(headerText)) return false;

  const headers = headerText.slice(1, -1).split('|').map((s) => s.trim());
  const sepCells = curText.replace(/^\||\|$/g, '').split('|');
  if (headers.length !== sepCells.length || headers.length < 2) return false;

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const th = headers
    .map((h) => `<th style="border:1px solid hsl(var(--border));padding:6px;text-align:left;">${esc(h) || '&nbsp;'}</th>`)
    .join('');
  const emptyRow =
    '<tr>' +
    headers.map(() => '<td style="border:1px solid hsl(var(--border));padding:6px;">&nbsp;</td>').join('') +
    '</tr>';
  const tableHTML =
    '<table style="border-collapse:collapse;width:100%;margin:8px 0;">' +
    `<thead><tr>${th}</tr></thead><tbody>${emptyRow}${emptyRow}</tbody></table>`;
  const wrap = document.createElement('div');
  wrap.innerHTML = tableHTML + '<p><br></p>';
  const table = wrap.firstElementChild as HTMLElement;
  const nextP = wrap.lastElementChild as HTMLElement;
  prev.replaceWith(table);
  block.replaceWith(nextP);
  moveCaretIntoStart(nextP);
  return true;
}



// ───────────────────────────────────────────────────────────────
// Paste-time Markdown → HTML conversion
// ───────────────────────────────────────────────────────────────

const escapeHtml = (s: string) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/** Apply inline markdown (bold/italic/code/strike/link) to an already-escaped line. */
function applyInline(escapedLine: string): string {
  let out = escapedLine;
  // inline code first — protect from other rules
  const codes: string[] = [];
  out = out.replace(/`([^`\n]+)`/g, (_, c) => {
    codes.push(`<code>${c}</code>`);
    return `\u0001${codes.length - 1}\u0001`;
  });
  // links [text](url)
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  // bold + italic
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
  out = out.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  // restore inline codes
  out = out.replace(/\u0001(\d+)\u0001/g, (_, i) => codes[Number(i)]);
  return out;
}

/**
 * Convert a plain-text Markdown fragment into safe HTML for paste. Handles:
 *   - ATX headings (# .. ####)
 *   - Bullet + numbered lists (single-level, indented by 2/4 spaces → nested)
 *   - Checklists ([ ], [x])
 *   - Blockquotes (>)
 *   - Horizontal rules (--- / *** / ___)
 *   - Fenced code blocks (```lang ... ```)
 *   - Inline bold / italic / code / strike / links
 *
 * If the input contains no recognisable markdown, returns null so the caller
 * can fall back to plain-text paste and preserve editor structure.
 */
export function markdownPasteToHtml(text: string): string | null {
  if (!text) return null;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const hasMd = /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|\[\s?[xX]?\]\s|```|---$|\*\*\*$|___$)/m.test(src)
    || /\*\*[^*\n]+\*\*|`[^`\n]+`|~~[^~\n]+~~|\[[^\]]+\]\(https?:\/\/[^\s)]+\)/.test(src);
  if (!hasMd) return null;

  const lines = src.split('\n');
  const out: string[] = [];
  let i = 0;

  const flushBlank = () => { /* no-op */ };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = /^```([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] || '';
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      if (i < lines.length) i++; // consume closing fence
      const code = escapeHtml(buf.join('\n'));
      out.push(
        `<pre class="rt-codeblock" data-lang="${escapeHtml(lang)}"><code>${code}</code></pre>`
      );
      continue;
    }

    // Horizontal rule
    if (/^(---|\*\*\*|___)\s*$/.test(line)) { out.push('<hr/>'); i++; continue; }

    // Headings
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = Math.min(h[1].length, 6);
      out.push(`<h${lvl}>${applyInline(escapeHtml(h[2]))}</h${lvl}>`);
      i++; continue;
    }

    // Blockquote (collapse consecutive)
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(applyInline(escapeHtml(lines[i].replace(/^>\s?/, ''))));
        i++;
      }
      out.push(`<blockquote>${buf.join('<br>')}</blockquote>`);
      continue;
    }

    // Checklists
    if (/^\s*(?:[-*+]\s+)?\[(?: |x|X)?\]\s+/.test(line)) {
      out.push('<ul class="checklist">');
      while (i < lines.length && /^\s*(?:[-*+]\s+)?\[(?: |x|X)?\]\s+/.test(lines[i])) {
        const m = /^\s*(?:[-*+]\s+)?\[([ xX]?)\]\s+(.*)$/.exec(lines[i])!;
        const checked = (m[1] || '').toLowerCase() === 'x';
        out.push(
          `<li class="checklist-item"${checked ? ' checked="true"' : ''}>` +
          `<input type="checkbox" class="checklist-checkbox"${checked ? ' checked' : ''}/>` +
          `<span class="checklist-text">${applyInline(escapeHtml(m[2]))}</span></li>`
        );
        i++;
      }
      out.push('</ul>');
      continue;
    }

    // Bullet / numbered lists (supports 1 level of nesting via 2-4 space indent)
    if (/^(\s*)([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>`);
      let curIndent = -1;
      while (i < lines.length && /^(\s*)([-*+]|\d+\.)\s+/.test(lines[i]) && !/^\s*[-*+]\s+\[[ xX]\]\s+/.test(lines[i])) {
        const m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[i])!;
        const indent = Math.floor(m[1].length / 2);
        const content = applyInline(escapeHtml(m[3]));
        if (curIndent === -1) curIndent = indent;
        if (indent > curIndent) {
          const sub = /^\s*\d+\.\s+/.test(lines[i]) ? 'ol' : 'ul';
          out.push(`<${sub}><li>${content}</li>`);
          curIndent = indent;
        } else if (indent < curIndent) {
          out.push('</ul></li>');
          out.push(`<li>${content}</li>`);
          curIndent = indent;
        } else {
          out.push(`<li>${content}</li>`);
        }
        i++;
      }
      out.push(`</${tag}>`);
      continue;
    }

    // Blank line → paragraph break
    if (line.trim() === '') { flushBlank(); i++; continue; }

    // Paragraph: consume until blank line
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' &&
           !/^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|\[\s?[xX]?\]\s|```|---$|\*\*\*$|___$)/.test(lines[i])) {
      buf.push(applyInline(escapeHtml(lines[i])));
      i++;
    }
    if (buf.length) out.push(`<p>${buf.join('<br>')}</p>`);
  }

  return out.join('');
}
