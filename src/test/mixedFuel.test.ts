import { describe, it, expect } from 'vitest';
import { convertMixedExpression } from '@/components/richtext/unitConvert';

describe('mixed fuel parsing', () => {
  const cases: Array<[string, number, string]> = [
    ['500 mi / 25 mpg to gal', 20, 'gal'],
    ['500 mi / 25 mi/gal to gal', 20, 'gal'],
    ['500 mi / 25 mpgus to gal', 20, 'gal'],
    ['500 mi / 25 mile/US gallon to gal', 20, 'gal'],
    ['500 mi / 25 miles per US gallon to gal', 20, 'gal'],
    ['30 mpg * 15 gal to mi', 450, 'mi'],
    ['30 mi/gal * 15 gal to mi', 450, 'mi'],
    ['30 mile/US gallon * 15 US gallon to mi', 450, 'mi'],
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

import { normalizeImplicitMult } from '@/components/richtext/unitConvert';

describe('implicit multiplication', () => {
  it('folds "2(kg)" → "2 kg"', () => {
    expect(normalizeImplicitMult('2(kg) to lb')).toBe('2 kg to lb');
  });
  it('folds "3(l/100km)" → "3 l/100km"', () => {
    expect(normalizeImplicitMult('3(l/100km)')).toBe('3 l/100km');
  });
  it('inserts * between )( adjacency', () => {
    expect(normalizeImplicitMult('(30 mpg)(15 gal) to mi')).toBe('(30 mpg)*(15 gal) to mi');
  });
  it('inserts * between digit and (', () => {
    expect(normalizeImplicitMult('2(3+4)')).toBe('2*(3+4)');
  });
  it('2(kg) to lb resolves via convertExpression', () => {
    const r = convertExpression('2(kg) to lb');
    expect(r).not.toBeNull();
    expect(r!.result).toBeCloseTo(4.409, 2);
  });
  it('(30 mpg)(15 gal) to mi resolves via convertExpression', () => {
    const r = convertExpression('(30 mpg)(15 gal) to mi');
    expect(r).not.toBeNull();
    expect(r!.result).toBeCloseTo(450, 1);
  });
});

describe('unary plus/minus', () => {
  it('-5 km to mi', () => {
    const r = convertExpression('-5 km to mi');
    expect(r).not.toBeNull();
    expect(r!.result).toBeCloseTo(-3.10686, 3);
  });
  it('+5 km to mi', () => {
    const r = convertExpression('+5 km to mi');
    expect(r).not.toBeNull();
    expect(r!.result).toBeCloseTo(3.10686, 3);
  });
  it('(-30 mpg * 15 gal) to mi', () => {
    const r = convertExpression('(-30 mpg * 15 gal) to mi');
    expect(r).not.toBeNull();
    expect(r!.result).toBeCloseTo(-450, 1);
  });
  it('500 mi / -25 mpg to gal', () => {
    const r = convertExpression('500 mi / -25 mpg to gal');
    expect(r).not.toBeNull();
    expect(r!.result).toBeCloseTo(-20, 2);
  });
});

describe('implicit multiplication — complex forms', () => {
  it('inserts * between (unit)(unit) paren-paren adjacency', () => {
    // "(m/s)(kg)" → unwrap unit-only parens, then bridge with *
    const s = normalizeImplicitMult('(m/s)(kg)');
    expect(s).toContain('m/s');
    expect(s).toContain('kg');
    // The ")(" boundary must yield an explicit "*" somewhere between the two units.
    expect(/m\/s\s*\)?\s*\*\s*\(?\s*kg|m\/s\s*\*\s*kg/.test(s)).toBe(true);
  });

  it('(30 mpg)(15 gal)/2 folds parens and preserves /2', () => {
    const s = normalizeImplicitMult('(30 mpg)(15 gal)/2');
    // Both operands survive and a "*" is inserted at the ")(" boundary.
    expect(s).toMatch(/\)\s*\*\s*\(/);
    expect(s).toContain('/2');
  });

  it('normalizes 2(kg)^2 to lb^2 without dropping the exponent', () => {
    const s = normalizeImplicitMult('2(kg)^2 to lb^2');
    expect(s).toContain('kg^2');
    expect(s).toContain('lb^2');
    // No stray parentheses left around the unit.
    expect(s).not.toContain('(kg)');
  });

  it('unwraps (unit)^N inside larger expressions', () => {
    const s = normalizeImplicitMult('(m)^3 to ft^3');
    expect(s).toContain('m^3');
    expect(s).not.toContain('(m)');
  });
});

describe('implicit multiplication — nested parentheses', () => {
  it('normalizes ((kg)(m/s))^2 by unwrapping inner units and preserving the outer exponent', () => {
    const s = normalizeImplicitMult('((kg)(m/s))^2');
    // Inner unit-only parens are unwrapped.
    expect(s).not.toContain('(kg)');
    expect(s).not.toContain('(m/s)');
    // Explicit * is inserted at the former ")(" boundary.
    expect(s).toMatch(/kg\s*\*\s*m\/s/);
    // Outer paren + ^2 exponent survives on the compound group.
    expect(s).toMatch(/\)\s*\^\s*2/);
  });

  it('handles ((kg)(m/s))^2 to (kg*m/s)^2 as a full conversion phrase', () => {
    const s = normalizeImplicitMult('((kg)(m/s))^2 to (kg*m/s)^2');
    // Left side is fully normalized...
    expect(s).toMatch(/kg\s*\*\s*m\/s\s*\)\s*\^\s*2/);
    // ...and the "to <target>" phrase is preserved intact.
    expect(s).toContain('to (kg*m/s)^2');
  });

  it('normalizes ((m)(s))^3 with a leading number: 2((kg)(m))^2 → 2*(kg*m)^2 shape', () => {
    const s = normalizeImplicitMult('2((kg)(m))^2');
    // Leading number gets an explicit * before the group.
    expect(s).toMatch(/^2\s*\*/);
    // Inner unit-only parens fold into a single compound group with *.
    expect(s).toMatch(/kg\s*\*\s*m/);
    // Outer exponent preserved.
    expect(s).toMatch(/\)\s*\^\s*2/);
    // No stray single-unit parens left over.
    expect(s).not.toContain('(kg)');
    expect(s).not.toContain('(m)');
  });

  it('already-canonical (kg*m/s)^2 passes through unchanged', () => {
    expect(normalizeImplicitMult('(kg*m/s)^2')).toBe('(kg*m/s)^2');
  });

  it('nested unwrap does not introduce unbalanced parentheses', () => {
    for (const input of [
      '((kg)(m/s))^2',
      '((m)(s))^3',
      '2((kg)(m))^2',
      '((kg)(m/s))^2 to (kg*m/s)^2',
    ]) {
      const s = normalizeImplicitMult(input);
      const opens = (s.match(/\(/g) ?? []).length;
      const closes = (s.match(/\)/g) ?? []).length;
      expect(opens).toBe(closes);
    }
  });
});
