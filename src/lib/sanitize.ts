/**
 * HTML Sanitization utilities using DOMPurify
 * Provides defense-in-depth against XSS attacks
 */
import DOMPurify from 'dompurify';

// Configure DOMPurify with allowed tags and attributes for rich text editing
const RICH_TEXT_CONFIG = {
  ALLOWED_TAGS: [
    'b', 'i', 'u', 'a', 'img', 'p', 'br', 'div', 'span',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'strong', 'em', 'code', 'pre', 'mark',
    'blockquote', 'hr', 'sub', 'sup', 's', 'strike',
    'font', 'small', 'big',
    'details', 'summary', // Toggle blocks
    'figure', 'figcaption', // Image captions
    'select', 'option', 'button', 'input', // Code-block chrome + checklists
    'audio', 'source',
    'svg', 'polygon', 'rect', 'path', 'circle', 'line', 'polyline', 'g',
    'math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'ms', 'mtext',
    'mfrac', 'msup', 'msub', 'msubsup', 'msqrt', 'mroot', 'mover', 'munder',
    'munderover', 'mtable', 'mtr', 'mtd', 'mstyle', 'mspace', 'mpadded', 'mphantom',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'class', 'style', 'id',
    'target', 'rel', 'width', 'height', 'colspan', 'rowspan',
    'data-id', 'data-type', 'data-find-highlight',
    'data-mention-type', 'data-mention-id', 'data-mention-path', 'data-mention-href', 'data-prefix', 'data-variant',
    'data-latex', 'data-display', 'data-cols', 'data-comment', 'data-comment-id', 'data-synced-id', 'data-role',
    'data-lang', 'data-line-numbers', 'data-image-caption', 'data-image-align', 'data-image-width', 'data-placeholder',
    'open', 'title',
    'data-recording-id', 'data-audio-src',
    'data-file-name', 'data-file-type', 'data-file-size', 'data-file-url', 'data-click-attached',
    'data-task-id', 'checked', 'value', 'selected', 'spellcheck', 'placeholder',
    'color', 'size', 'face', 'contenteditable', 'draggable',
    'controls', 'type',
    'aria-label', 'aria-hidden', 'role', 'tabindex',
    'viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'points', 'x', 'y', 'rx', 'ry', 'd', 'cx', 'cy', 'r',
    'mathvariant', 'displaystyle', 'scriptlevel', 'lspace', 'rspace', 'separator', 'stretchy', 'accent',
  ],
  ALLOW_DATA_ATTR: true,
  // Allow safe URLs only
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  // Return string instead of TrustedHTML
  RETURN_TRUSTED_TYPE: false,
};

// Stricter config for code highlighting (only span tags with specific attributes)
const CODE_HIGHLIGHT_CONFIG = {
  ALLOWED_TAGS: ['span', 'br'],
  ALLOWED_ATTR: ['class', 'style'],
  ALLOW_DATA_ATTR: false,
  RETURN_TRUSTED_TYPE: false,
};

/**
 * Sanitize HTML content for rich text editing
 * Use this for editor innerHTML operations
 */
export const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, RICH_TEXT_CONFIG) as string;
};

/**
 * Sanitize code highlighting output
 * Use this for syntax-highlighted code display
 */
export const sanitizeCodeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, CODE_HIGHLIGHT_CONFIG) as string;
};

/**
 * Sanitize HTML for read-only display
 * Slightly more permissive for viewing content
 */
export const sanitizeForDisplay = (html: string): string => {
  return DOMPurify.sanitize(html, {
    ...RICH_TEXT_CONFIG,
    ADD_ATTR: ['loading'], // Allow lazy loading for images
  }) as string;
};

/**
 * Sanitize HTML captured by the Web Clipper. Extends the display config to
 * allow safe embeds (iframe/video) so users can keep YouTube/Vimeo-style
 * players and lazy-loaded imagery in the saved note.
 */
export const sanitizeClippedArticle = (html: string): string => {
  const clean = DOMPurify.sanitize(html, {
    ...RICH_TEXT_CONFIG,
    ADD_TAGS: ['iframe', 'video', 'figure', 'figcaption', 'picture', 'section', 'article', 'aside', 'header', 'footer', 'time'],
    ADD_ATTR: [
      'loading', 'srcset', 'sizes', 'poster', 'controls', 'muted',
      'playsinline', 'autoplay', 'preload',
      'frameborder', 'allow', 'allowfullscreen', 'referrerpolicy',
      'alt', 'title', 'aria-label', 'data-caption',
    ],
  }) as string;
  // ── Post-sanitize normalization: strip layout traps (floats, absolute
  // positioning, tiny fixed widths) that break the reader view — this is
  // what causes the broken column-of-single-letters wrapping around orphan
  // floated images. Also flatten empty placeholder blocks left behind by
  // lazy-loaders and give every clip a stable `.evernote-clip` shell.
  try {
    if (typeof window === 'undefined' || !clean) return clean;
    const doc = new DOMParser().parseFromString(`<div id="__root">${clean}</div>`, 'text/html');
    const root = doc.getElementById('__root');
    if (!root) return clean;

    const KILL_STYLE = /(?:^|;)\s*(?:float|position|transform|clip|clip-path|z-index|top|left|right|bottom|max-height|min-width|min-height|columns|column-count|writing-mode)\s*:[^;]+/gi;
    const KILL_WIDTH = /(?:^|;)\s*(?:width|max-width)\s*:[^;]+/gi;

    root.querySelectorAll<HTMLElement>('*').forEach((el) => {
      const s = el.getAttribute('style');
      if (s) {
        let next = s.replace(KILL_STYLE, '');
        if (!/^(IMG|VIDEO|IFRAME|PICTURE)$/i.test(el.tagName)) next = next.replace(KILL_WIDTH, '');
        next = next.replace(/^\s*;+/, '').trim();
        if (next) el.setAttribute('style', next);
        else el.removeAttribute('style');
      }
      if (el.hasAttribute('align')) el.removeAttribute('align');
      if (!/^(IMG|VIDEO|IFRAME|PICTURE|TABLE|TD|TH)$/i.test(el.tagName)) {
        el.removeAttribute('width');
        el.removeAttribute('height');
      }
    });

    root.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      img.removeAttribute('width');
      img.removeAttribute('height');
      img.setAttribute('loading', 'lazy');
      img.setAttribute('referrerpolicy', 'no-referrer');
      const prev = img.getAttribute('style') || '';
      img.setAttribute(
        'style',
        `${prev};display:block;max-width:100%;height:auto;margin:16px auto;border-radius:8px;`.replace(/^;/, ''),
      );
    });

    root.querySelectorAll<HTMLElement>('div,span,section,aside').forEach((el) => {
      const hasMedia = el.querySelector('img,video,iframe,picture,svg,audio');
      const text = (el.textContent || '').trim();
      if (!hasMedia && text.length === 0) el.remove();
    });

    root.querySelectorAll<SVGElement>('svg').forEach((svg) => {
      const w = parseInt(svg.getAttribute('width') || '0', 10);
      const h = parseInt(svg.getAttribute('height') || '0', 10);
      if (w && h && w < 24 && h < 24) svg.remove();
    });

    if (!root.querySelector(':scope > .evernote-clip')) {
      const shell = doc.createElement('div');
      shell.className = 'evernote-clip';
      while (root.firstChild) shell.appendChild(root.firstChild);
      root.appendChild(shell);
    }
    return root.innerHTML;
  } catch {
    return clean;
  }
};

/**
 * Strip all HTML tags and return plain text
 * Useful for extracting text content safely
 */
export const stripHtml = (html: string): string => {
  return DOMPurify.sanitize(html, { 
    ALLOWED_TAGS: [], 
    ALLOWED_ATTR: [],
    RETURN_TRUSTED_TYPE: false,
  }) as string;
};
