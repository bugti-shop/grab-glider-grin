import { describe, it, expect } from 'vitest';
import {
  validateUrl,
  escapeMarkdown,
  sanitizeParam,
  parseClipMode,
  extractUrlAndText,
  buildClipNoteBody,
  buildClipperUrl,
  buildShareSignature,
  isDuplicateShare,
  MAX_LENGTHS,
  SHARE_CONSUMED_WINDOW_MS,
} from '@/utils/webClipper';

describe('webClipper.validateUrl', () => {
  it('accepts http and https', () => {
    expect(validateUrl('https://flowist.me/x')).toBe('https://flowist.me/x');
    expect(validateUrl('http://example.com/')).toBe('http://example.com/');
  });
  it('rejects javascript/data/file protocols', () => {
    expect(validateUrl('javascript:alert(1)')).toBe('');
    expect(validateUrl('data:text/html,<script>')).toBe('');
    expect(validateUrl('file:///etc/passwd')).toBe('');
  });
  it('rejects malformed URLs', () => {
    expect(validateUrl('not a url')).toBe('');
    expect(validateUrl('')).toBe('');
  });
});

describe('webClipper.sanitizeParam', () => {
  it('strips HTML', () => {
    expect(sanitizeParam('<script>alert(1)</script>hello', 50)).not.toContain('<');
  });
  it('truncates to max length', () => {
    expect(sanitizeParam('a'.repeat(500), 10)).toHaveLength(10);
  });
  it('handles null/empty', () => {
    expect(sanitizeParam(null, 10)).toBe('');
    expect(sanitizeParam('', 10)).toBe('');
  });
});

describe('webClipper.escapeMarkdown', () => {
  it('escapes brackets and parens', () => {
    expect(escapeMarkdown('[hi](evil)')).toBe('\\[hi\\]\\(evil\\)');
  });
});

describe('webClipper.parseClipMode', () => {
  it('normalises known modes', () => {
    expect(parseClipMode('selection')).toBe('selection');
    expect(parseClipMode('full-page')).toBe('fullpage');
    expect(parseClipMode('article')).toBe('article');
  });
  it('defaults to clean article mode for unknown/empty', () => {
    expect(parseClipMode('garbage')).toBe('article');
    expect(parseClipMode(null)).toBe('article');
  });
});

describe('webClipper.isDuplicateShare', () => {
  const createStorage = () => {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    };
  };

  it('blocks stale native share payloads across app launches', () => {
    const session = createStorage();
    const consumed = createStorage();
    const sig = buildShareSignature({ url: 'https://example.com/article', text: '' });
    expect(isDuplicateShare(sig, 1000, session, consumed)).toBe(false);
    expect(isDuplicateShare(sig, 1000 + 60_000, createStorage(), consumed)).toBe(true);
  });

  it('allows the same share again after the stale-intent window', () => {
    const consumed = createStorage();
    const sig = buildShareSignature({ url: 'https://example.com/article', text: '' });
    expect(isDuplicateShare(sig, 1000, createStorage(), consumed)).toBe(false);
    expect(isDuplicateShare(sig, 1000 + SHARE_CONSUMED_WINDOW_MS + 1, createStorage(), consumed)).toBe(false);
  });
});

describe('webClipper.extractUrlAndText', () => {
  it('treats a pure URL payload as url-only', () => {
    expect(extractUrlAndText('https://example.com/a')).toEqual({
      url: 'https://example.com/a',
      text: '',
    });
  });
  it('separates URL from surrounding text (selection share)', () => {
    const r = extractUrlAndText('Check this: https://example.com/x great read');
    expect(r.url).toBe('https://example.com/x');
    expect(r.text).toContain('Check this:');
    expect(r.text).toContain('great read');
  });
  it('returns text-only when no URL present', () => {
    expect(extractUrlAndText('just some quoted text')).toEqual({
      url: '',
      text: 'just some quoted text',
    });
  });
});

describe('webClipper.buildClipNoteBody', () => {
  it('selection mode keeps only the quote', () => {
    const body = buildClipNoteBody({
      url: 'https://x.com',
      selection: 'quoted bit',
      content: 'full article body',
      mode: 'selection',
    });
    expect(body).toContain('quoted bit');
    expect(body).not.toContain('full article body');
  });
  it('article mode includes content body', () => {
    const body = buildClipNoteBody({
      url: 'https://x.com',
      content: 'full article body',
      mode: 'article',
    });
    expect(body).toContain('full article body');
    expect(body).toContain('**Source:**');
  });
  it('escapes markdown in URLs to block link injection', () => {
    const body = buildClipNoteBody({ url: 'https://x.com/(a)[b]', mode: 'article' });
    expect(body).toContain('\\(a\\)\\[b\\]');
  });
});

describe('webClipper.buildClipperUrl', () => {
  it('produces a /webclipper URL with encoded params', () => {
    const u = buildClipperUrl({
      title: 'Hello & World',
      url: 'https://example.com/?q=1',
      mode: 'article',
    });
    expect(u.startsWith('/webclipper?')).toBe(true);
    const parsed = new URLSearchParams(u.split('?')[1]);
    expect(parsed.get('title')).toBe('Hello & World');
    expect(parsed.get('url')).toBe('https://example.com/?q=1');
    expect(parsed.get('mode')).toBe('article');
  });
  it('truncates oversized payloads at MAX_LENGTHS', () => {
    const u = buildClipperUrl({ content: 'x'.repeat(MAX_LENGTHS.content + 500) });
    const parsed = new URLSearchParams(u.split('?')[1]);
    expect((parsed.get('content') || '').length).toBe(MAX_LENGTHS.content);
  });
});
