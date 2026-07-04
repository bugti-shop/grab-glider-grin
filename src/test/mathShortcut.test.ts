import { describe, it, expect } from 'vitest';
import {
  evaluateMathExpression,
  evaluateMathExpressionDetailed,
  tryMathShortcut,
  tryMathAutoOnSpace,
} from '@/components/richtext/mathShortcut';
import { autoCalculate } from '@/utils/autoCalculator';

/* ────────────────────── mathjs coverage ────────────────────── */
describe('evaluateMathExpression – arithmetic', () => {
  const cases: Array<[string, string]> = [
    ['2+3', ' 5'],
    ['10-4', ' 6'],
    ['6*7', ' 42'],
    ['20/4', ' 5'],
    ['2^10', ' 1024'],
    ['17%5', ' 2'],
    ['(2+3)*4', ' 20'],
    ['1/3 + 1/6', ' 0.5'],
  ];
  for (const [i, e] of cases)
    it(i, () => expect(evaluateMathExpression(i)).toBe(e));
});

describe('evaluateMathExpression – scientific', () => {
  const cases: Array<[string, RegExp | string]> = [
    ['sqrt(16)', ' 4'],
    ['sqrt(2)', /^ 1\.4142/],
    ['sin(0)', ' 0'],
    ['cos(0)', ' 1'],
    ['tan(0)', ' 0'],
    ['log(100,10)', ' 2'],
    ['log(e)', /^ 1/],
    ['exp(0)', ' 1'],
    ['abs(-5)', ' 5'],
    ['round(3.7)', ' 4'],
    ['floor(3.9)', ' 3'],
    ['ceil(3.1)', ' 4'],
  ];
  for (const [i, e] of cases)
    it(i, () => {
      const r = evaluateMathExpression(i);
      if (e instanceof RegExp) expect(String(r ?? '')).toMatch(e);
      else expect(r).toBe(e);
    });
});

describe('evaluateMathExpression – combinatorics & number theory', () => {
  const cases: Array<[string, string]> = [
    ['5!', ' 120'],
    ['factorial(6)', ' 720'],
    ['gcd(12,18)', ' 6'],
    ['lcm(4,6)', ' 12'],
    ['combinations(5,2)', ' 10'],
    ['permutations(5,2)', ' 20'],
  ];
  for (const [i, e] of cases)
    it(i, () => expect(evaluateMathExpression(i)).toBe(e));
});

describe('evaluateMathExpression – statistics', () => {
  const cases: Array<[string, string]> = [
    ['mean(1,2,3)', ' 2'],
    ['median(1,2,3,4,5)', ' 3'],
    ['min(4,2,9,1)', ' 1'],
    ['max(4,2,9,1)', ' 9'],
  ];
  for (const [i, e] of cases)
    it(i, () => expect(evaluateMathExpression(i)).toBe(e));
});

describe('evaluateMathExpression – constants', () => {
describe('evaluateMathExpression – constants (used inside expressions)', () => {
  it('pi*2', () => expect(String(evaluateMathExpression('pi*2') ?? '')).toMatch(/6\.283/));
  it('e*1', () => expect(String(evaluateMathExpression('e*1') ?? '')).toMatch(/2\.71828/));
  it('tau/2', () => expect(String(evaluateMathExpression('tau/2') ?? '')).toMatch(/3\.14159/));
});

describe('evaluateMathExpression – percentages', () => {
  it('50% of 200', () => expect(evaluateMathExpression('50% of 200')).toBe(' 100'));
  it('25% of 80', () => expect(evaluateMathExpression('25% of 80')).toBe(' 20'));
});

describe('evaluateMathExpression – unit conversion', () => {
  it('5 km to miles', () => {
    const r = evaluateMathExpression('5 km to miles');
    expect(r).not.toBeNull();
    expect(r!).toMatch(/miles/i);
  });
  it('1 hour to minutes', () => {
    const r = evaluateMathExpression('1 hour to minutes');
    expect(r).not.toBeNull();
    expect(r!).toMatch(/min/);
  });
  it('2.5 kg to lb', () => {
    const r = evaluateMathExpression('2.5 kg to lb');
    expect(r).not.toBeNull();
    expect(r!).toMatch(/lb/i);
  });
});

describe('evaluateMathExpression – currency', () => {
  it('100 usd to pkr uses ≈ prefix', () => {
    const r = evaluateMathExpression('100 usd to pkr');
    expect(r).not.toBeNull();
    expect(r!).toMatch(/≈/);
    expect(r!).toMatch(/PKR/);
  });
});

describe('evaluateMathExpression – bases', () => {
  const cases: Array<[string, string]> = [
    ['0xff', ' 255'],
    ['0b1010', ' 10'],
  ];
  for (const [i, e] of cases)
    it(i, () => expect(evaluateMathExpression(i)).toBe(e));
});

/* ────────────────────── error/prose classification ────────────────────── */
describe('evaluateMathExpressionDetailed – classifier', () => {
  it('returns not-math for plain prose', () => {
    expect(evaluateMathExpressionDetailed('hello world').kind).toBe('not-math');
  });
  it('returns error for broken math with operator', () => {
    // `2 +` — operator present, so classifier tries to eval, mathjs throws.
    const r = evaluateMathExpressionDetailed('2 +');
    expect(r.kind).toBe('error');
  });
  it('returns error for sqrt with no arg', () => {
    const r = evaluateMathExpressionDetailed('sqrt(');
    expect(r.kind).toBe('error');
  });
});

/* ────────────────────── autoCalculator (keydown) ────────────────────── */
describe('autoCalculate keydown path', () => {
  const cases: Array<[string, string]> = [
    ['2+3=', '5'],
    ['56*45=', '2520'],
    ['56x45=', '2520'],
    ['50+10%=', '55'],
    ['100-20%=', '80'],
    ['(2+3)*4=', '20'],
  ];
  for (const [i, e] of cases)
    it(`${i} → ${e}`, () => expect(autoCalculate(i)).toBe(e));
});

/* ────────────────────── DOM: = trigger ────────────────────── */
function setup(text: string) {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  root.contentEditable = 'true';
  const p = document.createElement('p');
  const tn = document.createTextNode(text);
  p.appendChild(tn);
  root.appendChild(p);
  document.body.appendChild(root);
  const range = document.createRange();
  range.setStart(tn, text.length);
  range.collapse(true);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  return { root, tn };
}

describe('tryMathShortcut DOM = trigger', () => {
  it('inserts = result after "2+3"', () => {
    const { root, tn } = setup('2+3');
    expect(tryMathShortcut(root)).toBe(true);
    expect(tn.data).toBe('2+3= 5');
  });
  it('inserts error for broken expression "2+"', () => {
    const { root, tn } = setup('2+');
    expect(tryMathShortcut(root)).toBe(true);
    expect(tn.data.startsWith('2+= ⚠')).toBe(true);
  });
  it('leaves prose alone', () => {
    const { root, tn } = setup('hello world');
    expect(tryMathShortcut(root)).toBe(false);
    expect(tn.data).toBe('hello world');
  });
});

/* ────────────────────── DOM: space trigger (no-= auto eval) ────────── */
describe('tryMathAutoOnSpace', () => {
  it('auto-evaluates "2+3 " → "2+3 = 5"', () => {
    const { root, tn } = setup('2+3 ');
    expect(tryMathAutoOnSpace(root)).toBe(true);
    expect(tn.data).toBe('2+3 = 5');
  });
  it('handles "(2+3)*4 "', () => {
    const { root, tn } = setup('(2+3)*4 ');
    expect(tryMathAutoOnSpace(root)).toBe(true);
    expect(tn.data.endsWith('= 20')).toBe(true);
  });
  it('handles trailing factorial "5! "', () => {
    const { root, tn } = setup('5! ');
    expect(tryMathAutoOnSpace(root)).toBe(true);
    expect(tn.data.endsWith('= 120')).toBe(true);
  });
  it('handles function call "sqrt(16) "', () => {
    const { root, tn } = setup('sqrt(16) ');
    expect(tryMathAutoOnSpace(root)).toBe(true);
    expect(tn.data.endsWith('= 4')).toBe(true);
  });
  it('handles gcd "gcd(12,18) "', () => {
    const { root, tn } = setup('gcd(12,18) ');
    expect(tryMathAutoOnSpace(root)).toBe(true);
    expect(tn.data.endsWith('= 6')).toBe(true);
  });
  it('handles unit conversion "5 km to miles "', () => {
    const { root, tn } = setup('5 km to miles ');
    expect(tryMathAutoOnSpace(root)).toBe(true);
    expect(tn.data).toMatch(/= .*miles/i);
  });
  it('handles percent-of "50% of 200 "', () => {
    const { root, tn } = setup('50% of 200 ');
    expect(tryMathAutoOnSpace(root)).toBe(true);
    expect(tn.data.endsWith('= 100')).toBe(true);
  });
  it('does NOT fire on prose "I ate 3 apples "', () => {
    const { root, tn } = setup('I ate 3 apples ');
    expect(tryMathAutoOnSpace(root)).toBe(false);
    expect(tn.data).toBe('I ate 3 apples ');
  });
  it('does NOT fire on bare number "42 "', () => {
    const { root, tn } = setup('42 ');
    expect(tryMathAutoOnSpace(root)).toBe(false);
    expect(tn.data).toBe('42 ');
  });
  it('does NOT re-fire when line already has an =', () => {
    const { root, tn } = setup('2+3= 5 ');
    expect(tryMathAutoOnSpace(root)).toBe(false);
    expect(tn.data).toBe('2+3= 5 ');
  });
});
