import { describe, it, expect } from 'vitest';
import { withCopySuffix, sanitizeDisplayName, sanitizeCopySuffixes } from '@/utils/duplicateName';

describe('duplicateName', () => {
  it('strips a trailing (Copy) token', () => {
    expect(withCopySuffix('Buy milk (Copy)')).toBe('Buy milk');
    expect(withCopySuffix('Buy milk (copy)')).toBe('Buy milk');
    expect(withCopySuffix('Buy milk (Copy 2)')).toBe('Buy milk');
  });

  it('strips repeated/nested (Copy) suffixes', () => {
    expect(withCopySuffix('Buy milk (Copy) (Copy)')).toBe('Buy milk');
    expect(withCopySuffix('Buy milk   (Copy)   ')).toBe('Buy milk');
  });

  it('leaves names without a (Copy) suffix untouched', () => {
    expect(withCopySuffix('Buy milk')).toBe('Buy milk');
    expect(sanitizeDisplayName('Project plan')).toBe('Project plan');
  });

  it('sanitizes a list of items and reports whether anything changed', () => {
    const input = [
      { id: '1', text: 'A (Copy)' },
      { id: '2', text: 'B', subtasks: [{ id: '2a', text: 'B-1 (Copy)' }] },
      { id: '3', name: 'Folder (Copy 3)' },
      { id: '4', text: 'Clean' },
    ];
    const { items, changed } = sanitizeCopySuffixes(input as any);
    expect(changed).toBe(true);
    expect(items[0].text).toBe('A');
    expect((items[1] as any).subtasks[0].text).toBe('B-1');
    expect((items[2] as any).name).toBe('Folder');
    expect(items[3].text).toBe('Clean');
  });

  it('returns changed=false when nothing matches', () => {
    const { changed } = sanitizeCopySuffixes([{ text: 'one' }, { text: 'two' }] as any);
    expect(changed).toBe(false);
  });
});
