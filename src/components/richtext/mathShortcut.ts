/**
 * Inline math evaluation for the rich-text editor.
 *
 * Trigger: user types `=` at the end of an expression. If the text immediately
 * before the caret (bounded by whitespace or block start) parses as a math
 * expression, we append ` <result>` after the `=`.
 *
 * Powered by mathjs — supports:
 *   - Basic arithmetic:      2+3, 10-4, 6*7, 20/4, 2^10, 17%5, (2+3)*4
 *   - Percentages:           50% of 200 = 100,  200 - 10% = 180
 *   - Scientific:            sqrt(16), sin(pi/2), cos(0), log(100,10), ln(e),
 *                            exp(1), abs(-5), round(3.7), floor(3.9), ceil(3.1),
 *                            factorial(5) or 5!,  gcd(12,18), lcm(4,6),
 *                            atan(1), asin(0.5), tan(45 deg)
 *   - Constants:             pi, e, tau, phi
 *   - Bitwise / logic:       5 & 3, 5 | 3, 5 xor 3, 5 << 1, ~5
 *   - Bases:                 0b1010, 0o17, 0xff, hex(255), bin(10), oct(9)
 *   - Complex numbers:       (2 + 3i) * (1 - i)
 *   - Fractions:             1/3 + 1/6
 *   - Statistics:            mean(1,2,3), median(1,2,3), std(1,2,3), variance(...)
 *   - Combinatorics:         combinations(5,2), permutations(5,2)
 *   - Unit conversion:       5 km to miles, 100 f to c, 1 hour to minutes,
 *                            2.5 kg to lb, 1 gallon to liters
 *   - Currency (approx):     100 usd to pkr, 50 eur to usd  (static rates —
 *                            shown as ≈ because rates are not live)
 */

import { create, all, type MathJsInstance } from 'mathjs';

// Static currency reference rates relative to USD. Approximate — for live
// rates, wire an FX API and set these dynamically.
const CURRENCY_TO_USD: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  PKR: 0.0036,
  INR: 0.012,
  AED: 0.27,
  SAR: 0.27,
  JPY: 0.0064,
  CNY: 0.14,
  CAD: 0.73,
  AUD: 0.66,
  CHF: 1.12,
  BDT: 0.0085,
  TRY: 0.029,
  RUB: 0.011,
  BRL: 0.18,
  ZAR: 0.055,
  SGD: 0.74,
  HKD: 0.13,
  KRW: 0.00072,
  MXN: 0.058,
  NZD: 0.60,
  SEK: 0.093,
  NOK: 0.091,
  DKK: 0.14,
};

const CURRENCY_ALIASES: Record<string, string> = {
  RS: 'PKR', PKR: 'PKR', RUPEE: 'PKR', RUPEES: 'PKR',
  DOLLAR: 'USD', DOLLARS: 'USD', USD: 'USD',
  EURO: 'EUR', EUROS: 'EUR', EUR: 'EUR',
  POUND: 'GBP', POUNDS: 'GBP', GBP: 'GBP',
  YEN: 'JPY', JPY: 'JPY',
  YUAN: 'CNY', RMB: 'CNY', CNY: 'CNY',
  DIRHAM: 'AED', AED: 'AED',
  RIYAL: 'SAR', SAR: 'SAR',
  INR: 'INR', BDT: 'BDT', CAD: 'CAD', AUD: 'AUD',
  CHF: 'CHF', TRY: 'TRY', RUB: 'RUB', BRL: 'BRL',
  ZAR: 'ZAR', SGD: 'SGD', HKD: 'HKD', KRW: 'KRW',
  MXN: 'MXN', NZD: 'NZD', SEK: 'SEK', NOK: 'NOK', DKK: 'DKK',
};

let mathInstance: MathJsInstance | null = null;
function getMath(): MathJsInstance {
  if (mathInstance) return mathInstance;
  mathInstance = create(all, { number: 'number' });
  // Disable dangerous functions.
  mathInstance.import({
    import: function () { throw new Error('disabled'); },
    createUnit: function () { throw new Error('disabled'); },
    evaluate: function () { throw new Error('disabled'); },
    parse: function () { throw new Error('disabled'); },
    simplify: function () { throw new Error('disabled'); },
    derivative: function () { throw new Error('disabled'); },
  }, { override: true });
  return mathInstance;
}

function formatResult(value: unknown): string {
  const math = getMath();
  try {
    if (typeof value === 'number') {
      if (!isFinite(value)) return String(value);
      // Trim to sensible precision; drop trailing zeros.
      const rounded = math.round(value, 10) as number;
      return String(rounded);
    }
    return math.format(value, { precision: 10 });
  } catch {
    return String(value);
  }
}

/** Currency conversion: "100 usd to pkr" → "100 USD ≈ 27777.78 PKR" or null. */
function tryCurrency(expr: string): string | null {
  const m = expr.match(/^\s*([\d.,]+)\s*([a-zA-Z]{2,8})\s+(?:to|in)\s+([a-zA-Z]{2,8})\s*$/i);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ''));
  if (!isFinite(amount)) return null;
  const from = CURRENCY_ALIASES[m[2].toUpperCase()];
  const to = CURRENCY_ALIASES[m[3].toUpperCase()];
  if (!from || !to) return null;
  const usd = amount * CURRENCY_TO_USD[from];
  const out = usd / CURRENCY_TO_USD[to];
  const rounded = Math.round(out * 100) / 100;
  return `≈ ${rounded.toLocaleString()} ${to}`;
}

/** Percent-of shorthand: "50% of 200" → 100. */
function tryPercentOf(expr: string): string | null {
  const m = expr.match(/^\s*([\d.]+)\s*%\s*of\s*([\d.]+)\s*$/i);
  if (!m) return null;
  const pct = parseFloat(m[1]);
  const val = parseFloat(m[2]);
  if (!isFinite(pct) || !isFinite(val)) return null;
  return String(Math.round(pct * val) / 100);
}

/**
 * Attempt to evaluate the text just before the caret as a math expression.
 * Returns the string to insert after the `=` (space + result), or null when
 * the input isn't recognisably math.
 */
export function evaluateMathExpression(rawBefore: string): string | null {
  // Grab the trailing expression: continue backwards until a hard boundary
  // (newline, `=`, or block start). Keep spaces so unit/currency phrases work.
  const trimmed = rawBefore.replace(/\u00A0/g, ' ');
  // Cut off any earlier `= …` results so re-typing `=` re-evaluates fresh.
  const lastEq = trimmed.lastIndexOf('=');
  const segment = (lastEq >= 0 ? trimmed.slice(0, lastEq) : trimmed).trim();
  if (!segment) return null;
  if (segment.length > 200) return null;
  // Must contain at least one digit or math function name.
  if (!/[\d]/.test(segment) && !/\b(pi|e|tau|phi|sqrt|sin|cos|tan|log|ln|exp|abs)\b/i.test(segment)) {
    return null;
  }
  // Reject when it looks like prose (letters with no math operator/unit).
  if (!/[+\-*/^%()!]|to |in |of |sqrt|sin|cos|tan|log|ln|exp|abs|round|floor|ceil|mean|median|std|gcd|lcm|combinations|permutations|factorial|deg|rad|hex|bin|oct/i.test(segment)
      && !/^\s*[\d.,]+\s*[a-zA-Z]/.test(segment)) {
    // Plain "hello" — not math.
    if (!/^[\d\s.,+\-*/^%()!]+$/.test(segment)) return null;
  }

  // 1. Currency conversion shortcut
  const cur = tryCurrency(segment);
  if (cur) return ' ' + cur;

  // 2. Percent-of shortcut
  const pct = tryPercentOf(segment);
  if (pct) return ' ' + pct;

  // 3. Full mathjs evaluation (arithmetic, scientific, units, complex, etc.)
  const math = getMath();
  try {
    // mathjs handles `%` as modulo; treat trailing "X%" (no operator after)
    // as "X/100" for calculator-style percentage.
    let expr = segment;
    expr = expr.replace(/(\d+(?:\.\d+)?)\s*%(?!\s*\d)/g, '($1/100)');
    const result = math.evaluate(expr);
    if (result === undefined || result === null) return null;
    // Skip function references, matrices with functions, etc.
    if (typeof result === 'function') return null;
    const formatted = formatResult(result);
    if (!formatted || formatted === expr.trim()) return null;
    return ' ' + formatted;
  } catch {
    return null;
  }
}

/**
 * Handle `=` keypress in the editor. If the text before the caret is a math
 * expression, inserts ` result` after the `=` and returns true.
 * Caller should preventDefault when true and fire handleInput.
 */
export function tryMathShortcut(root: HTMLElement | null): boolean {
  if (!root) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== 3) return false;
  const textNode = node as Text;
  const caret = range.startOffset;
  const before = textNode.data.slice(0, caret);

  // Skip inside code blocks / inline code.
  let el: Node | null = textNode.parentNode;
  while (el && el !== root) {
    if (el.nodeType === 1) {
      const tag = (el as HTMLElement).tagName;
      if (tag === 'CODE' || tag === 'PRE') return false;
      if ((el as HTMLElement).classList?.contains('rt-codeblock')) return false;
    }
    el = el.parentNode;
  }

  const result = evaluateMathExpression(before);
  if (!result) return false;

  // Insert "= result" at caret (the `=` keydown will be prevented; we type it ourselves).
  const insertion = '=' + result;
  const after = textNode.data.slice(caret);
  textNode.data = before + insertion + after;

  const newRange = document.createRange();
  const newCaret = before.length + insertion.length;
  newRange.setStart(textNode, newCaret);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);
  return true;
}
