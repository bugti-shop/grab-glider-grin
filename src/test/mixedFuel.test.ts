import { describe, it, expect } from 'vitest';
import { convertMixedExpression } from '@/components/richtext/unitConvert';

describe('mixed fuel parsing', () => {
  const cases: Array<[string, number, string]> = [
    ['500 mi / 25 mpg to gal', 20, 'gal'],
    ['500 mi / 25 mi/gal to gal', 20, 'gal'],
    ['500 mi / 25 mpgus to gal', 20, 'gal'],
    ['30 mpg * 15 gal to mi', 450, 'mi'],
    ['30 mi/gal * 15 gal to mi', 450, 'mi'],
    ['100 km * 8 l/100km to l', 8, 'L'],
    ['100 km * 8 l100km to l', 8, 'L'],
  ];
  for (const [input, val, sym] of cases) {
    it(input, () => {
      const r = convertMixedExpression(input);
      expect(r, `no result for ${input}`).not.toBeNull();
      expect(r!.result).toBeCloseTo(val, 2);
      expect(r!.toSymbol).toBe(sym);
    });
  }
});

import { convertExpression, reduceParens } from '@/components/richtext/unitConvert';

describe('parentheses & precedence', () => {
  it('(30 mpg * 15 gal) to mi → 450 mi', () => {
    const r = convertExpression('(30 mpg * 15 gal) to mi');
    expect(r).not.toBeNull();
    expect(r!.result).toBeCloseTo(450, 1);
    expect(r!.toSymbol).toBe('mi');
  });
  it('(500 mi / 25 mpg) to gal → 20 gal', () => {
    const r = convertExpression('(500 mi / 25 mpg) to gal');
    expect(r).not.toBeNull();
    expect(r!.result).toBeCloseTo(20, 2);
  });
  it('reduceParens turns "(30 mpg * 15 gal)" into a canonical literal', () => {
    const s = reduceParens('(30 mpg * 15 gal) to mi');
    expect(s).toMatch(/^[\d.eE+-]+ km to mi$/);
  });
  it('handles nested parens: ((500 mi / 25 mpg)) to gal', () => {
    const r = convertExpression('((500 mi / 25 mpg)) to gal');
    expect(r).not.toBeNull();
    expect(r!.result).toBeCloseTo(20, 2);
  });
  it('returns null for unbalanced parens', () => {
    expect(convertExpression('(500 mi / 25 mpg to gal')).toBeNull();
  });
});
