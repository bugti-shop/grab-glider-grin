/**
 * Comprehensive audit of every slash command documented in the
 * ShortcutsCheatSheet. Verifies each command executes and produces the
 * documented block, and that auto-ready coverage matches user expectations
 * (arg-less commands fire on mobile without Space/Enter).
 */
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
  const node = document.createTextNode(text);
  p.appendChild(node);
  const range = document.createRange();
  range.setStart(node, node.data.length);
  range.collapse(true);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  return root;
};

const run = async (text: string) => {
  const root = setupLine(text);
  const ok = await trySlashLineShortcut(root);
  return { ok, root };
};

describe('slash command audit — arg-less commands', () => {
  const cases: Array<[string, (root: HTMLElement) => boolean]> = [
    ['/h1', (r) => !!r.querySelector('h1')],
    ['/h2', (r) => !!r.querySelector('h2')],
    ['/h3', (r) => !!r.querySelector('h3')],
    ['/bullet', (r) => !!r.querySelector('ul li')],
    ['/numbered', (r) => !!r.querySelector('ol li')],
    ['/todo', (r) => !!r.querySelector('ul.checklist .checklist-checkbox')],
    ['/check', (r) => !!r.querySelector('ul.checklist')],
    ['/quote', (r) => !!r.querySelector('blockquote')],
    ['/divider', (r) => !!r.querySelector('hr')],
    ['/table', (r) => !!r.querySelector('table tbody tr td')],
    ['/today', (r) => (r.textContent || '').length > 3 && !(r.textContent || '').includes('/today')],
    ['/tomorrow', (r) => (r.textContent || '').length > 3 && !(r.textContent || '').includes('/tomorrow')],
    ['/yesterday', (r) => (r.textContent || '').length > 3 && !(r.textContent || '').includes('/yesterday')],
    ['/now', (r) => (r.textContent || '').length > 3 && !(r.textContent || '').includes('/now')],
    ['/chess', (r) => !!r.querySelector('.rt-chess')],
  ];

  for (const [cmd, check] of cases) {
    it(`${cmd} executes and is marked auto-ready for mobile`, async () => {
      const { ok, root } = await run(cmd);
      expect(ok, `${cmd} should execute`).toBe(true);
      expect(check(root), `${cmd} should produce expected DOM`).toBe(true);
      expect(isSlashLineShortcutAutoReady(cmd), `${cmd} should be auto-ready`).toBe(true);
    });
  }
});

describe('slash command audit — arg-taking commands', () => {
  it('/bold text produces <strong>', async () => {
    const { ok, root } = await run('/bold Hello');
    expect(ok).toBe(true);
    expect(root.querySelector('strong')?.textContent).toBe('Hello');
    expect(isSlashLineShortcutReady('/bold Hello')).toBe(true);
  });
  it('/italic text produces <em>', async () => {
    const { root } = await run('/italic Hello');
    expect(root.querySelector('em')?.textContent).toBe('Hello');
  });
  it('/underline text produces <u>', async () => {
    const { root } = await run('/underline Hello');
    expect(root.querySelector('u')?.textContent).toBe('Hello');
  });
  it('/strike text produces <s>', async () => {
    const { root } = await run('/strike Hello');
    expect(root.querySelector('s')?.textContent).toBe('Hello');
  });
  it('/code text produces <code>', async () => {
    const { root } = await run('/code Hello');
    expect(root.querySelector('code')?.textContent).toBe('Hello');
  });
  it('/highlight text produces <mark>', async () => {
    const { root } = await run('/highlight Hello');
    expect(root.querySelector('mark')?.textContent).toBe('Hello');
  });
  it('/lorem 2 produces two paragraphs', async () => {
    const { root } = await run('/lorem 2');
    expect(root.querySelectorAll('p').length).toBe(2);
  });
  it('/color red hello produces coloured span', async () => {
    const { root } = await run('/color red hello');
    const span = root.querySelector('span[style*="color"]') as HTMLElement | null;
    expect(span?.textContent).toBe('hello');
  });
  it('/qr text produces rt-qr figure', async () => {
    const { root } = await run('/qr hello');
    expect(root.querySelector('figure.rt-qr img')).not.toBeNull();
  }, 10000);
  it('/mermaid graph TD; A-->B produces rt-mermaid block', async () => {
    const { root } = await run('/mermaid graph TD; A-->B');
    expect(root.querySelector('.rt-mermaid')).not.toBeNull();
  });
  it('/toc with no headings still inserts placeholder', async () => {
    const { root } = await run('/toc');
    expect(root.textContent).toContain('No headings');
  });
  it('/youtube <url> produces YouTube iframe', async () => {
    const { root } = await run('/youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(root.querySelector('iframe[src*="youtube.com/embed"]')).not.toBeNull();
  });
  it('/spotify <url> produces Spotify iframe', async () => {
    const { root } = await run('/spotify https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6');
    expect(root.querySelector('iframe[src*="open.spotify.com/embed"]')).not.toBeNull();
  });
  it('/tweet <url> produces tweet iframe', async () => {
    const { root } = await run('/tweet https://twitter.com/jack/status/20');
    expect(root.querySelector('iframe[src*="platform.twitter.com"]')).not.toBeNull();
  });
  it('/tz tokyo produces localized time text', async () => {
    const { root, ok } = await run('/tz tokyo');
    expect(ok).toBe(true);
    expect(root.textContent).toContain('Asia/Tokyo');
  });
  it('/unit 10 km in miles produces converted paragraph', async () => {
    const { root, ok } = await run('/unit 10 km in miles');
    expect(ok).toBe(true);
    expect((root.textContent || '').toLowerCase()).toMatch(/mi|mile/);
  });
});
