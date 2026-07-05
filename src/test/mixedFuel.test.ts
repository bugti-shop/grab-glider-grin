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
