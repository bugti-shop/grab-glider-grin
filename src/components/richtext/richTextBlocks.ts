// Block HTML generators + caret helpers for advanced rich-text blocks.
import katex from 'katex';
import { getSyncedBlock, setSyncedBlock, subscribeSyncedBlocks } from '@/utils/syncedBlocks';




export type CalloutVariant = 'info' | 'warning' | 'success' | 'danger';

export const calloutHTML = (variant: CalloutVariant = 'info', text = 'Highlight important info here…') => {
  const icons: Record<CalloutVariant, string> = {
    info: '💡',
    warning: '⚠️',
    success: '✅',
    danger: '🚫',
  };
  return `<div class="rt-callout" data-variant="${variant}" contenteditable="false"><span class="rt-callout-icon">${icons[variant]}</span><div class="rt-callout-body" contenteditable="true">${text}</div></div><p><br></p>`;
};

export const toggleHTML = (title = 'Toggle title', body = 'Hidden content — click the arrow to expand.') =>
  `<details class="rt-toggle"><summary>${title}</summary><div class="rt-toggle-body">${body}</div></details><p><br></p>`;

export const quoteHTML = (text = 'Quote text here…') =>
  `<blockquote class="rt-quote">${text}</blockquote><p><br></p>`;

export const dividerHTML = () => `<hr/><p><br></p>`;

export const codeBlockHTML = (code = '// your code') =>
  `<pre style="background:hsl(var(--muted));padding:12px;border-radius:8px;font-family:monospace;font-size:0.9em;overflow-x:auto;"><code>${code}</code></pre><p><br></p>`;

export const checklistHTML = (text = '') =>
  `<ul class="checklist"><li class="checklist-item"><input type="checkbox" class="checklist-checkbox"/><span class="checklist-text">${text || '&nbsp;'}</span></li></ul>`;

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const escapeAttr = (value: string) => escapeHtml(value)
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const mentionHTML = (type: 'note' | 'task', id: string, label: string) => {
  const safeLabel = escapeHtml(label);
  const safeId = escapeAttr(id);
  const path = type === 'note' ? `/notesdashboard?openNote=${encodeURIComponent(id)}` : `/todo/today?openTask=${encodeURIComponent(id)}`;
  const prefix = type === 'note' ? '📝' : '✓';
  // Use <span> (not <a>) so native WebViews / Capacitor don't trigger an external navigation.
  // SPA navigation is handled by MentionClickListener in App.tsx via data attrs.
  return `<span class="rt-mention" role="link" tabindex="0" data-mention-type="${type}" data-mention-id="${safeId}" data-mention-path="${escapeAttr(path)}" data-prefix="${prefix}" contenteditable="false" draggable="false">${safeLabel}</span>&nbsp;`;
};

/**
 * Multi-column layout block. Each column is independently editable.
 */
export const columnsHTML = (cols: 2 | 3 = 2) => {
  const colHtml = `<div class="rt-col" contenteditable="true"><p><br></p></div>`;
  const inner = Array.from({ length: cols }, () => colHtml).join('');
  return `<div class="rt-columns" data-cols="${cols}" contenteditable="false">${inner}</div><p><br></p>`;
};

/**
 * Math equation block (LaTeX → KaTeX). Stores raw LaTeX in data-latex; the
 * rendered HTML is regenerated on every load via renderMathIn().
 */
export const mathHTML = (latex: string, displayMode = true) => {
  const safe = (latex || '').replace(/"/g, '&quot;');
  let rendered = '';
  try {
    rendered = katex.renderToString(latex || '\\;', { throwOnError: false, displayMode });
  } catch {
    rendered = `<span style="color:hsl(var(--destructive));">Invalid LaTeX</span>`;
  }
  const tag = displayMode ? 'div' : 'span';
  return `<${tag} class="rt-math" data-latex="${safe}" data-display="${displayMode ? '1' : '0'}" contenteditable="false">${rendered}</${tag}>${displayMode ? '<p><br></p>' : '&nbsp;'}`;
};

/**
 * Re-render every .rt-math node inside `root` from its stored data-latex.
 * Call after innerHTML is replaced so KaTeX output is fresh.
 */
export const renderMathIn = (root: HTMLElement | null) => {
  if (!root) return;
  const nodes = root.querySelectorAll<HTMLElement>('.rt-math');
  nodes.forEach((n) => {
    const latex = n.getAttribute('data-latex') || '';
    const display = n.getAttribute('data-display') !== '0';
    try {
      n.innerHTML = katex.renderToString(latex || '\\;', { throwOnError: false, displayMode: display });
    } catch {
      n.innerHTML = `<span style="color:hsl(var(--destructive));">Invalid LaTeX</span>`;
    }
  });
};

/**
 * Wrap the current selection in an inline comment span. Returns true if applied.
 */
export const wrapSelectionAsComment = (text: string): boolean => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  const span = document.createElement('span');
  span.className = 'rt-comment';
  span.setAttribute('data-comment', text);
  span.setAttribute('data-comment-id', `c_${Date.now().toString(36)}`);
  span.setAttribute('title', text);
  try {
    span.appendChild(range.extractContents());
    range.insertNode(span);
    sel.removeAllRanges();
    const r = document.createRange();
    r.selectNodeContents(span);
    r.collapse(false);
    sel.addRange(r);
    return true;
  } catch {
    return false;
  }
};

/**
 * Get caret coordinates relative to viewport. Returns null if no caret.
 */
export const getCaretRect = (): DOMRect | null => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0).cloneRange();
  const rects = range.getClientRects();
  if (rects.length > 0) return rects[0];
  // Collapsed caret with no rects: use a temp span
  const span = document.createElement('span');
  span.appendChild(document.createTextNode('\u200b'));
  range.insertNode(span);
  const rect = span.getBoundingClientRect();
  span.parentNode?.removeChild(span);
  return rect;
};

/**
 * Find closest LI ancestor of the caret. Returns null if not in a list.
 */
export const getCaretLI = (): HTMLLIElement | null => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node: Node | null = sel.getRangeAt(0).startContainer;
  while (node && node.nodeType !== 1) node = node.parentNode;
  return (node as HTMLElement | null)?.closest('li') ?? null;
};

/**
 * Indent the current LI by wrapping it in a nested list (UL/OL) inside the
 * previous sibling LI. No-op when there is no previous sibling.
 */
export const indentListItem = (li: HTMLLIElement): boolean => {
  const prev = li.previousElementSibling as HTMLElement | null;
  if (!prev) return false;
  const parentTag = (li.parentElement?.tagName === 'OL' ? 'ol' : 'ul');
  let nested = prev.querySelector(`:scope > ${parentTag}`) as HTMLElement | null;
  if (!nested) {
    nested = document.createElement(parentTag);
    prev.appendChild(nested);
  }
  nested.appendChild(li);
  return true;
};

/**
 * Outdent the current LI to its parent list's parent.
 */
export const outdentListItem = (li: HTMLLIElement): boolean => {
  const parentList = li.parentElement;
  if (!parentList) return false;
  const grandLi = parentList.parentElement;
  if (!grandLi || grandLi.tagName !== 'LI') return false;
  const grandList = grandLi.parentElement;
  if (!grandList) return false;
  grandList.insertBefore(li, grandLi.nextSibling);
  // If parent list is now empty, remove it
  if (!parentList.children.length) parentList.remove();
  return true;
};

/**
 * Replace the leading "/<query>" trigger text at the caret with given HTML.
 * Used after picking from the slash menu.
 */
export const replaceTriggerAndInsert = (triggerLen: number, html: string, savedRange?: Range | null) => {
  const sel = window.getSelection();
  if (!sel) return;
  if (savedRange) {
    try {
      sel.removeAllRanges();
      sel.addRange(savedRange.cloneRange());
    } catch {
      // Fall back to current selection when a stale native range cannot be restored.
    }
  }
  if (sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType === 3) {
    const text = node.textContent || '';
    const offset = range.startOffset;
    const before = text.slice(0, Math.max(0, offset - triggerLen));
    const after = text.slice(offset);
    (node as Text).textContent = before + after;
    const newRange = document.createRange();
    newRange.setStart(node, before.length);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }
  document.execCommand('insertHTML', false, html);
};

export const removeAdjacentMention = (direction: 'backward' | 'forward', root?: HTMLElement | null): boolean => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  if (root && !root.contains(range.startContainer)) return false;

  const isMention = (node: Node | null): node is HTMLElement =>
    node instanceof HTMLElement && (node.classList.contains('rt-mention') || node.classList.contains('note-link'));

  const removeNode = (mention: HTMLElement, spacer?: Text | null) => {
    const parent = mention.parentNode;
    if (!parent) return false;
    const nextRange = document.createRange();
    nextRange.setStartBefore(mention);
    nextRange.collapse(true);
    if (spacer) {
      const value = spacer.textContent || '';
      if (!value.replace(/\u00a0/g, '').trim()) spacer.remove();
      else if (value.startsWith('\u00a0')) spacer.textContent = value.slice(1);
      else if (value.endsWith('\u00a0')) spacer.textContent = value.slice(0, -1);
    }
    mention.remove();
    sel.removeAllRanges();
    sel.addRange(nextRange);
    return true;
  };

  const container = range.startContainer;
  const offset = range.startOffset;

  if (container.nodeType === Node.TEXT_NODE) {
    const text = container as Text;
    const value = text.textContent || '';
    if (direction === 'backward') {
      if (offset > 0 && value.slice(0, offset).replace(/\u00a0/g, '').trim()) return false;
      const prev = text.previousSibling;
      if (isMention(prev)) return removeNode(prev, text);
    } else {
      if (value.slice(offset).replace(/\u00a0/g, '').trim()) return false;
      const next = text.nextSibling;
      if (isMention(next)) return removeNode(next, text);
    }
  }

  const parent = container.nodeType === Node.ELEMENT_NODE ? container : container.parentNode;
  if (!parent) return false;
  const child = direction === 'backward'
    ? parent.childNodes[Math.max(0, offset - 1)]
    : parent.childNodes[offset];
  if (isMention(child)) return removeNode(child);
  const sibling = direction === 'backward' ? container.previousSibling : container.nextSibling;
  if (isMention(sibling)) return removeNode(sibling);
  return false;
};

/**
 * Synced block placeholder. The actual content is hydrated from
 * localStorage at render time via hydrateSyncedIn(); the editor body
 * stays as a stable wrapper so existing/new instances stay in sync.
 */
export const syncedHTML = (id: string) =>
  `<div class="rt-synced" data-synced-id="${id}" contenteditable="false"><div class="rt-synced-inner" data-role="body"></div></div><p><br></p>`;

const DEFAULT_SYNCED_INITIAL =
  '<p>🔄 Synced block — edit anywhere, it updates everywhere.</p>';

/**
 * Hydrate every .rt-synced wrapper inside `root` from storage.
 * In editor mode the inner becomes contenteditable; edits are persisted to
 * storage via persistSyncedFrom(root). All instances on the page subscribe
 * to live updates from other tabs / other editors.
 */
export const hydrateSyncedIn = (
  root: HTMLElement | null,
  opts: { editable: boolean } = { editable: false },
): (() => void) => {
  if (!root) return () => {};
  const blocks = root.querySelectorAll<HTMLElement>('.rt-synced');
  const idsOnPage = new Set<string>();
  blocks.forEach((wrap) => {
    const id = wrap.getAttribute('data-synced-id');
    if (!id) return;
    idsOnPage.add(id);
    let inner = wrap.querySelector<HTMLElement>('.rt-synced-inner');
    if (!inner) {
      inner = document.createElement('div');
      inner.className = 'rt-synced-inner';
      inner.setAttribute('data-role', 'body');
      wrap.appendChild(inner);
    }
    const stored = getSyncedBlock(id);
    if (stored !== null) {
      inner.innerHTML = stored;
    } else if (!inner.innerHTML.trim()) {
      inner.innerHTML = DEFAULT_SYNCED_INITIAL;
      // Seed storage so other instances can pick it up
      setSyncedBlock(id, inner.innerHTML);
    }
    inner.setAttribute('contenteditable', opts.editable ? 'true' : 'false');
  });

  const unsubscribe = subscribeSyncedBlocks((id, html) => {
    if (!idsOnPage.has(id)) return;
    root.querySelectorAll<HTMLElement>(`.rt-synced[data-synced-id="${CSS.escape(id)}"] > .rt-synced-inner`).forEach((inner) => {
      // Avoid stomping while user is actively typing in *this* instance
      if (document.activeElement === inner) return;
      if (inner.innerHTML !== html) inner.innerHTML = html;
    });
  });

  return unsubscribe;
};

/**
 * Walk every synced block inside `root` and persist its current inner HTML
 * to storage (which broadcasts to every other instance). Cheap; call from
 * the editor's input handler.
 */
export const persistSyncedFrom = (root: HTMLElement | null) => {
  if (!root) return;
  root.querySelectorAll<HTMLElement>('.rt-synced').forEach((wrap) => {
    const id = wrap.getAttribute('data-synced-id');
    const inner = wrap.querySelector<HTMLElement>('.rt-synced-inner');
    if (id && inner) setSyncedBlock(id, inner.innerHTML);
  });
};

/**
 * Web-clip card hydration.
 * - Adds a collapse/expand toggle when the body word-count exceeds threshold.
 * - Idempotent: safe to call on every render.
 */
export const hydrateWebClipsIn = (root: HTMLElement | null, threshold = 600) => {
  if (!root) return;
  const clips = root.querySelectorAll<HTMLElement>('.flowist-web-clip');
  clips.forEach((clip) => {
    if (clip.dataset.hydrated === '1') return;
    const body = clip.querySelector<HTMLElement>('.flowist-web-clip-body[data-role="body"]');
    if (!body) { clip.dataset.hydrated = '1'; return; }
    const words = (body.textContent || '').trim().split(/\s+/).filter(Boolean).length;
    if (words > threshold) {
      body.setAttribute('data-collapsed', '1');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'flowist-web-clip-toggle';
      btn.setAttribute('contenteditable', 'false');
      btn.setAttribute('data-role', 'toggle');
      const setLabel = () => {
        const collapsed = body.getAttribute('data-collapsed') === '1';
        btn.textContent = collapsed
          ? `▾ Read full clip (${words.toLocaleString()} words)`
          : '▴ Collapse clip';
      };
      setLabel();
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const collapsed = body.getAttribute('data-collapsed') === '1';
        if (collapsed) body.removeAttribute('data-collapsed');
        else body.setAttribute('data-collapsed', '1');
        setLabel();
      });
      body.insertAdjacentElement('afterend', btn);
    }
    clip.dataset.hydrated = '1';
  });
};

