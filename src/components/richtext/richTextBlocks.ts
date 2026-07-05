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

// Supported languages for the code-block language selector.
export const CODE_BLOCK_LANGS = [
  'plaintext', 'javascript', 'typescript', 'tsx', 'jsx', 'python', 'java',
  'kotlin', 'swift', 'go', 'rust', 'ruby', 'php', 'c', 'cpp', 'csharp',
  'html', 'css', 'scss', 'json', 'yaml', 'markdown', 'bash', 'sql', 'xml',
] as const;

const escapeCode = (s: string) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

export const codeBlockHTML = (code = '// your code', lang = 'plaintext') =>
  `<pre class="rt-codeblock" data-lang="${lang}" data-line-numbers="1"><code>${escapeCode(code)}</code></pre><p><br></p>`;

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

const hydratedWebClipFrames = new WeakMap<HTMLIFrameElement, string>();
const webClipFrameRetryTimers = new WeakMap<HTMLIFrameElement, number>();

const writeWebClipHtmlIntoFrame = (frame: HTMLIFrameElement, html: string, key: string) => {
  if (hydratedWebClipFrames.get(frame) === key) return;

  // Keep parent editor HTML stable. `iframe.srcdoc = ...` reflects into a
  // huge `srcdoc` attribute, so React/contenteditable sees a different DOM and
  // re-applies the saved content, causing the blank/html/blank reopen flicker.
  frame.removeAttribute('srcdoc');

  const write = () => {
    try {
      const doc = frame.contentDocument || frame.contentWindow?.document;
      if (!doc) return false;
      doc.open();
      doc.write(html);
      doc.close();
      hydratedWebClipFrames.set(frame, key);
      return true;
    } catch {
      return false;
    }
  };

  if (write()) return;

  const scheduleRetry = (delay: number) => {
    const existing = webClipFrameRetryTimers.get(frame);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      webClipFrameRetryTimers.delete(frame);
      if (hydratedWebClipFrames.get(frame) !== key && !write()) {
        const finalTimer = window.setTimeout(() => {
          webClipFrameRetryTimers.delete(frame);
          if (hydratedWebClipFrames.get(frame) !== key) write();
        }, 120);
        webClipFrameRetryTimers.set(frame, finalTimer);
      }
    }, delay);
    webClipFrameRetryTimers.set(frame, timer);
  };

  if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
    window.requestAnimationFrame(() => {
      if (hydratedWebClipFrames.get(frame) !== key && !write()) scheduleRetry(50);
    });
  } else {
    scheduleRetry(0);
  }
};

/**
 * Web-clip card hydration.
 * - Adds a collapse/expand toggle when the body word-count exceeds threshold.
 * - Idempotent: safe to call on every render.
 */
export const hydrateWebClipsIn = (root: HTMLElement | null, _threshold = 600) => {
  if (!root) return;
  const clips = root.querySelectorAll<HTMLElement>('.flowist-web-clip');
  clips.forEach((clip) => {
    if (clip.dataset.hydrated === '1') return;
    const body = clip.querySelector<HTMLElement>('.flowist-web-clip-body[data-role="body"]');
    if (body) {
      // Always render the full clip expanded — no "Read full clip" toggle.
      body.removeAttribute('data-collapsed');
      // Remove any pre-existing toggle button left over from older clips.
      clip.querySelectorAll('button.flowist-web-clip-toggle[data-role="toggle"]').forEach((el) => el.remove());
    }
    clip.dataset.hydrated = '1';
  });

  // Web Clipper full-page embeds: raw HTML is stored as base64 in
  // `data-clip-html` on the wrapper so it survives sanitize + contenteditable
  // serialization round-trips. Decode it and set the iframe's `srcdoc`
  // property from JS every time the note is rendered (fresh clip, reload,
  // re-open, offline). This is the fix for the "blank frame after reload" bug.
  const embeds = root.querySelectorAll<HTMLElement>('.webclipper-embed[data-clip-html]');
  embeds.forEach((embed) => {
    if ((embed as any).__wcHydrated) return;
    const encoded = embed.getAttribute('data-clip-html') || '';
    if (!encoded) return;
    let html = '';
    try {
      const bin = atob(encoded);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      html = new TextDecoder().decode(bytes);
    } catch {
      return;
    }
    if (!html) return;
    let frame = embed.querySelector<HTMLIFrameElement>('iframe[data-role="webclip-frame"]')
      || embed.querySelector<HTMLIFrameElement>('iframe');
    if (!frame) {
      frame = document.createElement('iframe');
      frame.setAttribute('data-role', 'webclip-frame');
      frame.setAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');
      frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      frame.setAttribute('loading', 'lazy');
      frame.setAttribute('style', 'width:100%;height:70vh;border:1px solid hsl(var(--border));border-radius:12px;background:white;display:block;');
      embed.appendChild(frame);
    }
    const key = `${encoded.length}:${encoded.slice(0, 24)}:${encoded.slice(-24)}`;
    writeWebClipHtmlIntoFrame(frame, html, key);
    embed.setAttribute('contenteditable', 'false');
    (embed as any).__wcHydrated = true;
  });


  // User preference: no snapshot placeholder, no "View / Hide snapshot"
  // toggle, and no "Download captured HTML" button. Any legacy fullpage
  // snapshot figures still stored in old notes are removed on hydration so
  // the note renders the inline article content only.
  root
    .querySelectorAll<HTMLElement>(
      '.flowist-web-clip-fullpage, .flowist-web-clip-fullpage-hint, .flowist-web-clip-fullpage-btn, [data-role="fullpage-snapshot"], [data-role="fullpage-open"], [data-role="fullpage-download"], iframe.flowist-web-clip-fullpage-frame',
    )
    .forEach((el) => el.remove());
  // Older clips saved these controls with different classes. Only strip
  // interactive/chrome elements whose *entire* label exactly matches the old
  // snapshot buttons (anchored regex + length cap) so we never remove real
  // article prose that happens to mention "snapshot" or "download".
  const SNAPSHOT_LABEL_RE = /^(hide snapshot|view snapshot|view full captured(?: html| page)?|download captured html|snapshot stored offline|snapshot saved offline)$/i;
  const isSnapshotWrapper = (el: HTMLElement): boolean => {
    const cls = typeof el.className === 'string' ? el.className : '';
    if (/flowist-web-clip-fullpage/.test(cls)) return true;
    const role = el.getAttribute('data-role') || '';
    return role.startsWith('fullpage-');
  };
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>('button, a, [role="button"]'),
  );
  for (const el of candidates) {
    if (!el.isConnected) continue;
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!txt || txt.length > 60 || !SNAPSHOT_LABEL_RE.test(txt)) continue;
    let target: HTMLElement = el;
    for (let i = 0; i < 4; i++) {
      const p = target.parentElement;
      if (!p || p === root) break;
      if (!isSnapshotWrapper(p)) break;
      target = p;
    }
    target.remove();
  }
};


/* ────────────────────────────────────────────────────────────── */
/* Code block hydration: language selector + copy + line numbers  */
/* highlight.js is dynamically imported so it doesn't inflate the */
/* Quick-Add / cold-open bundle.                                  */
/* ────────────────────────────────────────────────────────────── */

let hljsLoader: Promise<any> | null = null;
const loadHljs = () => {
  if (!hljsLoader) hljsLoader = import('highlight.js').then((m) => m.default ?? m);
  return hljsLoader;
};

export const hydrateCodeBlocksIn = (root: HTMLElement | null) => {
  if (!root) return;
  const blocks = root.querySelectorAll<HTMLPreElement>('pre.rt-codeblock');
  blocks.forEach((pre) => {
    if ((pre as any).__rtCodeHydrated) return;
    (pre as any).__rtCodeHydrated = true;

    const lang = pre.getAttribute('data-lang') || 'plaintext';
    const code = pre.querySelector('code');
    if (!code) return;

    // Ensure the code element is editable but the wrapper chrome is not.
    pre.setAttribute('contenteditable', 'false');
    code.setAttribute('contenteditable', 'true');
    code.setAttribute('spellcheck', 'false');
    code.setAttribute('data-role', 'code');

    // Chrome: language selector + copy button.
    const chrome = document.createElement('div');
    chrome.className = 'rt-codeblock-chrome';
    chrome.setAttribute('contenteditable', 'false');

    const select = document.createElement('select');
    select.className = 'rt-codeblock-lang';
    select.setAttribute('contenteditable', 'false');
    (CODE_BLOCK_LANGS as readonly string[]).forEach((l) => {
      const opt = document.createElement('option');
      opt.value = l; opt.textContent = l;
      if (l === lang) opt.selected = true;
      select.appendChild(opt);
    });

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'rt-codeblock-copy';
    copyBtn.setAttribute('contenteditable', 'false');
    copyBtn.textContent = 'Copy';

    chrome.appendChild(select);
    chrome.appendChild(copyBtn);
    pre.insertBefore(chrome, pre.firstChild);

    const relayout = async () => {
      const raw = code.innerText.replace(/\n$/, '');
      const currentLang = pre.getAttribute('data-lang') || 'plaintext';
      try {
        const hljs = await loadHljs();
        const r = currentLang && currentLang !== 'plaintext' && hljs.getLanguage(currentLang)
          ? hljs.highlight(raw, { language: currentLang, ignoreIllegals: true })
          : hljs.highlightAuto(raw);
        code.innerHTML = r.value || raw.replace(/</g, '&lt;');
      } catch {
        code.textContent = raw;
      }

      // Line numbers as a decorative gutter (contenteditable=false).
      const lines = raw.split('\n');
      let gutter = pre.querySelector<HTMLElement>('.rt-codeblock-gutter');
      if (!gutter) {
        gutter = document.createElement('div');
        gutter.className = 'rt-codeblock-gutter';
        gutter.setAttribute('contenteditable', 'false');
        pre.insertBefore(gutter, code);
      }
      gutter.innerHTML = lines.map((_, i) => `<span>${i + 1}</span>`).join('');
    };

    select.addEventListener('change', () => {
      pre.setAttribute('data-lang', select.value);
      relayout();
    });
    select.addEventListener('mousedown', (e) => e.stopPropagation());
    select.addEventListener('click', (e) => e.stopPropagation());

    copyBtn.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      try {
        await navigator.clipboard.writeText(code.innerText);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
      } catch {
        copyBtn.textContent = 'Failed';
        setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
      }
    });

    // Re-highlight when the user pauses typing.
    let t: number | undefined;
    code.addEventListener('input', () => {
      window.clearTimeout(t);
      t = window.setTimeout(relayout, 250) as unknown as number;
    });

    relayout();
  });
};

/* ────────────────────────────────────────────────────────────── */
/* Image essentials: caption, alt text, click-to-lightbox         */
/* Works on top of the existing .resizable-image-wrapper chrome.  */
/* ────────────────────────────────────────────────────────────── */

const openLightbox = (
  src: string,
  alt: string,
  gallery: { src: string; alt: string }[] = [{ src, alt }],
) => {
  const existing = document.querySelector('.rt-lightbox');
  if (existing) existing.remove();

  const items = gallery.length ? gallery : [{ src, alt }];
  let index = Math.max(0, items.findIndex((it) => it.src === src));
  if (index < 0) index = 0;

  const overlay = document.createElement('div');
  overlay.className = 'rt-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <button type="button" class="rt-lightbox-close" aria-label="Close">×</button>
    <button type="button" class="rt-lightbox-nav rt-lightbox-prev" aria-label="Previous">‹</button>
    <div class="rt-lightbox-stage">
      <img alt="" />
      <div class="rt-lightbox-counter" aria-live="polite"></div>
    </div>
    <button type="button" class="rt-lightbox-nav rt-lightbox-next" aria-label="Next">›</button>
  `;

  const imgEl = overlay.querySelector<HTMLImageElement>('img')!;
  const counter = overlay.querySelector<HTMLElement>('.rt-lightbox-counter')!;
  const prevBtn = overlay.querySelector<HTMLElement>('.rt-lightbox-prev')!;
  const nextBtn = overlay.querySelector<HTMLElement>('.rt-lightbox-next')!;

  const render = () => {
    const cur = items[index];
    imgEl.src = cur.src;
    imgEl.alt = cur.alt || '';
    counter.textContent = items.length > 1 ? `${index + 1} / ${items.length}` : '';
    const multi = items.length > 1;
    prevBtn.style.display = multi ? '' : 'none';
    nextBtn.style.display = multi ? '' : 'none';
  };

  const go = (delta: number) => {
    if (items.length < 2) return;
    index = (index + delta + items.length) % items.length;
    render();
  };

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = prevOverflow;
  };

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') close();
    else if (ev.key === 'ArrowRight') go(1);
    else if (ev.key === 'ArrowLeft') go(-1);
  };

  overlay.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === overlay || t.classList.contains('rt-lightbox-stage')) close();
    else if (t.closest('.rt-lightbox-close')) close();
    else if (t.closest('.rt-lightbox-prev')) go(-1);
    else if (t.closest('.rt-lightbox-next')) go(1);
  });

  // Swipe navigation (touch).
  let startX = 0, startY = 0, tracking = false;
  overlay.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; if (!t) return;
    startX = t.clientX; startY = t.clientY; tracking = true;
  }, { passive: true });
  overlay.addEventListener('touchend', (e) => {
    if (!tracking) return; tracking = false;
    const t = e.changedTouches[0]; if (!t) return;
    const dx = t.clientX - startX, dy = t.clientY - startY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    else if (dy > 80 && Math.abs(dy) > Math.abs(dx)) close();
  });

  document.addEventListener('keydown', onKey);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);
  render();
};

export const hydrateImageMediaIn = (root: HTMLElement | null) => {
  if (!root) return;
  const wrappers = root.querySelectorAll<HTMLElement>('.resizable-image-wrapper');
  wrappers.forEach((wrap) => {
    if ((wrap as any).__rtMediaHydrated) return;
    (wrap as any).__rtMediaHydrated = true;
    const img = wrap.querySelector<HTMLImageElement>('img');
    if (!img) return;

    // Alt-text edit + full-width toggle live inside the alignment toolbar.
    const toolbar = wrap.querySelector<HTMLElement>('.image-align-toolbar');
    if (toolbar && !toolbar.querySelector('.image-align-full')) {
      const fullBtn = document.createElement('button');
      fullBtn.type = 'button';
      fullBtn.className = 'image-align-full';
      fullBtn.textContent = '↔';
      fullBtn.title = 'Full width';
      Object.assign(fullBtn.style, {
        width: '28px', height: '28px', border: 'none', borderRadius: '4px',
        background: 'transparent', cursor: 'pointer', color: 'hsl(var(--foreground))',
      } as CSSStyleDeclaration);
      fullBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isFull = wrap.getAttribute('data-image-align') === 'full';
        if (isFull) {
          wrap.setAttribute('data-image-align', 'left');
          wrap.style.width = 'fit-content';
          img.style.width = (wrap.getAttribute('data-image-width') || '300') + 'px';
        } else {
          wrap.setAttribute('data-image-align', 'full');
          wrap.style.width = '100%';
          wrap.style.marginLeft = '0';
          wrap.style.marginRight = '0';
          img.style.width = '100%';
        }
        wrap.dispatchEvent(new Event('input', { bubbles: true }));
      });
      toolbar.appendChild(fullBtn);

      const altBtn = document.createElement('button');
      altBtn.type = 'button';
      altBtn.className = 'image-alt-btn';
      altBtn.textContent = 'Alt';
      altBtn.title = 'Edit alt text';
      Object.assign(altBtn.style, {
        width: '36px', height: '28px', border: 'none', borderRadius: '4px',
        background: 'transparent', cursor: 'pointer', color: 'hsl(var(--foreground))',
        fontSize: '12px', fontWeight: '600',
      } as CSSStyleDeclaration);
      altBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = window.prompt('Image alt text (for accessibility):', img.alt || '');
        if (next !== null) {
          img.alt = next;
          wrap.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      toolbar.appendChild(altBtn);
    }

    // Caption: editable <figcaption> rendered below the image.
    if (!wrap.querySelector('.rt-image-caption')) {
      const cap = document.createElement('div');
      cap.className = 'rt-image-caption';
      cap.setAttribute('contenteditable', 'true');
      cap.setAttribute('data-placeholder', 'Add a caption…');
      cap.textContent = wrap.getAttribute('data-image-caption') || '';
      cap.addEventListener('input', () => {
        wrap.setAttribute('data-image-caption', cap.textContent || '');
      });
      wrap.appendChild(cap);
    }

    // Click-to-lightbox: double click on desktop, single tap on touch.
    img.style.cursor = 'zoom-in';
    const collectGallery = () => {
      const all = Array.from(root.querySelectorAll<HTMLImageElement>('.resizable-image-wrapper img'));
      return all.filter((i) => !!i.src).map((i) => ({ src: i.src, alt: i.alt || '' }));
    };
    img.addEventListener('dblclick', (e) => {
      e.preventDefault(); e.stopPropagation();
      openLightbox(img.src, img.alt || '', collectGallery());
    });
    // Touch: single tap opens (dblclick is unreliable on mobile).
    let touchStart = 0;
    img.addEventListener('touchstart', () => { touchStart = Date.now(); }, { passive: true });
    img.addEventListener('touchend', (e) => {
      if (Date.now() - touchStart < 300) {
        e.preventDefault();
        openLightbox(img.src, img.alt || '', collectGallery());
      }
    });
  });
};



