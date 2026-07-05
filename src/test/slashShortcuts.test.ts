import { describe, expect, it } from 'vitest';
import {
  isSlashLineShortcutAutoReady,
  isSlashLineShortcutReady,
  trySlashLineShortcut,
} from '@/components/richtext/extraShortcuts';

const setupLine = (text: string) => {
  document.body.innerHTML = '<div id="editor" contenteditable="true"><p></p></div>';
  const root = document.getElementById('editor') as HTMLElement;
  const p = root.querySelector('p') as HTMLParagraphElement;
  const textNode = document.createTextNode(text);
  p.appendChild(textNode);

  const range = document.createRange();
  range.setStart(textNode, textNode.data.length);
  range.collapse(true);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);

  return root;
};

describe('slash line shortcuts', () => {
  it('marks no-argument mobile commands as auto-ready without Space or Enter', () => {
    expect(isSlashLineShortcutAutoReady('/today')).toBe(true);
    expect(isSlashLineShortcutAutoReady('/now')).toBe(true);
    expect(isSlashLineShortcutAutoReady('/h1')).toBe(true);
    expect(isSlashLineShortcutAutoReady('/bullet')).toBe(true);
    expect(isSlashLineShortcutAutoReady('/lorem 3')).toBe(false);
    expect(isSlashLineShortcutReady('/lorem 3')).toBe(true);
  });

  it('executes date commands directly from the current line', async () => {
    const root = setupLine('/today');

    await expect(trySlashLineShortcut(root)).resolves.toBe(true);

    expect(root.textContent).not.toContain('/today');
    expect(root.textContent?.trim().length).toBeGreaterThan(6);
  });

  it('accepts common date aliases and misspellings', async () => {
    for (const cmd of ['/Today', '/tommorrw', '/tmrw', '/yday', '/now']) {
      const root = setupLine(cmd);
      await expect(trySlashLineShortcut(root), cmd).resolves.toBe(true);
      expect(root.textContent).not.toContain(cmd);
      expect(root.textContent?.trim().length).toBeGreaterThan(3);
      expect(isSlashLineShortcutReady(cmd), `${cmd} ready`).toBe(true);
    }
  });

  it('supports common slash block commands that were advertised on mobile', async () => {
    const h1Root = setupLine('/h1');
    await expect(trySlashLineShortcut(h1Root)).resolves.toBe(true);
    expect(h1Root.querySelector('h1')).not.toBeNull();

    const bulletRoot = setupLine('/bullet');
    await expect(trySlashLineShortcut(bulletRoot)).resolves.toBe(true);
    expect(bulletRoot.querySelector('ul li')).not.toBeNull();

    const todoRoot = setupLine('/check');
    await expect(trySlashLineShortcut(todoRoot)).resolves.toBe(true);
    expect(todoRoot.querySelector('ul.checklist .checklist-checkbox')).not.toBeNull();
  });

  it('supports inline formatting slash commands with text', async () => {
    const boldRoot = setupLine('/bold Important');
    await expect(trySlashLineShortcut(boldRoot)).resolves.toBe(true);
    expect(boldRoot.querySelector('strong')?.textContent).toBe('Important');

    const highlightRoot = setupLine('/highlight Remember this');
    await expect(trySlashLineShortcut(highlightRoot)).resolves.toBe(true);
    expect(highlightRoot.querySelector('mark')?.textContent).toBe('Remember this');
  });
});