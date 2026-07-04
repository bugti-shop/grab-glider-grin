import { describe, it, expect } from 'vitest';
import { evaluateMathExpression, tryMathShortcut } from '@/components/richtext/mathShortcut';
import { autoCalculate } from '@/utils/autoCalculator';

describe('evaluateMathExpression (mathjs path)', () => {
  const cases: Array<[string, string | null]> = [
    ['2+3', ' 5'],
    ['10-4', ' 6'],
    ['6*7', ' 42'],
    ['20/4', ' 5'],
    ['2^10', ' 1024'],
    ['(2+3)*4', ' 20'],
    ['sqrt(16)', ' 4'],
    ['sin(0)', ' 0'],
    ['cos(0)', ' 1'],
    ['log(100,10)', ' 2'],
    ['abs(-5)', ' 5'],
    ['round(3.7)', ' 4'],
    ['floor(3.9)', ' 3'],
    ['ceil(3.1)', ' 4'],
    ['5!', ' 120'],
    ['gcd(12,18)', ' 6'],
    ['lcm(4,6)', ' 12'],
    ['50% of 200', ' 100'],
    ['1/3 + 1/6', ' 0.5'],
    ['mean(1,2,3)', ' 2'],
    ['5 km to miles', null], // just check not null via separate test
  ];
  for (const [input, expected] of cases) {
    it(`evaluates "${input}"`, () => {
      const out = evaluateMathExpression(input);
      if (expected === null) {
        expect(out).not.toBeNull();
      } else {
        expect(out).toBe(expected);
      }
    });
  }
});

describe('autoCalculate (keydown path)', () => {
  const cases: Array<[string, string]> = [
    ['2+3=', '5'],
    ['56*45=', '2520'],
    ['56x45=', '2520'],
    ['50+10%=', '55'],
    ['100-20%=', '80'],
    ['(2+3)*4=', '20'],
  ];
  for (const [input, expected] of cases) {
    it(`autoCalculate("${input}") = ${expected}`, () => {
      expect(autoCalculate(input)).toBe(expected);
    });
  }
});

describe('tryMathShortcut DOM insertion', () => {
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

  it('inserts = result after typing = on "2+3"', () => {
    const { root, tn } = setup('2+3');
    const ok = tryMathShortcut(root);
    expect(ok).toBe(true);
    expect(tn.data).toBe('2+3= 5');
  });

  it('re-evaluates when user retypes = ("2+3= 5" typing = after)', () => {
    const { root, tn } = setup('2+3= 5');
    // Simulate user placing cursor at end and typing =
    // tryMathShortcut cuts at last '=' so it should re-eval "2+3"
    const ok = tryMathShortcut(root);
    expect(ok).toBe(true);
    // The insertion happens at caret: after "5", we get "= 5" appended.
    expect(tn.data.endsWith('= 5')).toBe(true);
  });

  it('does nothing for plain "hello"', () => {
    const { root } = setup('hello');
    expect(tryMathShortcut(root)).toBe(false);
  });
});
