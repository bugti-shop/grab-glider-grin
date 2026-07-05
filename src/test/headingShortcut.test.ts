/**
 * Reproduces the reported bug: typing "## " in the editor was producing an
 * <h1> instead of an <h2>. Guards that `tryMarkdownBlockShortcut` respects
 * the exact "#" count for every heading level H1..H6.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { tryMarkdownBlockShortcut } from '@/components/richtext/markdownShortcuts';

/** Set the caret at the end of `el` and simulate what happens after the user
 *  has typed the heading token and is about to press Space. */
function setCaretAtEnd(el: HTMLElement) {
  const range = document.createRange();
  const sel = window.getSelection()!;
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function makeEditor(tokenTyped: string) {
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.appendChild(root);
  const p = document.createElement('p');
  p.textContent = tokenTyped;
  root.appendChild(p);
  setCaretAtEnd(p);
  return { root, block: p };
}

describe('markdown heading shortcuts — level accuracy', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  for (const [token, tag] of [
    ['#', 'H1'],
    ['##', 'H2'],
    ['###', 'H3'],
    ['####', 'H4'],
    ['#####', 'H5'],
    ['######', 'H6'],
  ] as const) {
    it(`typing "${token} " produces a <${tag.toLowerCase()}>, not any other level`, () => {
      const { root } = makeEditor(token);
      const applied = tryMarkdownBlockShortcut(root);
      expect(applied).toBe(true);
      const heading = root.querySelector('h1,h2,h3,h4,h5,h6');
      expect(heading).not.toBeNull();
      expect(heading!.tagName).toBe(tag);
      // Guardrails: no other heading level leaked out.
      const others = root.querySelectorAll('h1,h2,h3,h4,h5,h6');
      expect(others.length).toBe(1);
    });
  }
});
