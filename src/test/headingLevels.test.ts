import { describe, it, expect } from 'vitest';
import {
  tryMarkdownBlockShortcut,
  tryMarkdownCompletedBlockShortcut,
} from '@/components/richtext/markdownShortcuts';

function setup(text: string) {
  document.body.innerHTML = '<div id="e" contenteditable="true"><p></p></div>';
  const root = document.getElementById('e') as HTMLElement;
  const p = root.querySelector('p') as HTMLParagraphElement;
  const t = document.createTextNode(text);
  p.appendChild(t);
  const r = document.createRange();
  r.setStart(t, t.data.length);
  r.collapse(true);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(r);
  return root;
}

describe('heading levels', () => {
  for (let n = 1; n <= 6; n++) {
    const marker = '#'.repeat(n);
    it(`space path: ${marker} → h${n}`, () => {
      const root = setup(marker);
      expect(tryMarkdownBlockShortcut(root)).toBe(true);
      expect(root.querySelector(`h${n}`)).not.toBeNull();
    });
    it(`mobile path: "${marker} Title" → h${n}`, () => {
      const root = setup(`${marker} Title`);
      expect(tryMarkdownCompletedBlockShortcut(root)).toBe(true);
      const h = root.querySelector(`h${n}`);
      expect(h, `expected h${n}`).not.toBeNull();
      expect(h?.textContent).toBe('Title');
    });
    it(`mobile fallback (no space): "${marker}Title" → h${n}`, () => {
      const root = setup(`${marker}Title`);
      expect(tryMarkdownCompletedBlockShortcut(root)).toBe(true);
      const h = root.querySelector(`h${n}`);
      expect(h, `expected h${n} from "${marker}Title"`).not.toBeNull();
    });
  }
});
