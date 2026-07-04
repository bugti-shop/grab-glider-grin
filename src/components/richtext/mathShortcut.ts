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

/**
 * Currency reference rates relative to USD.
 *
 * Live rates are fetched from https://open.er-api.com/v6/latest/USD (free,
 * no API key, ~160 currencies, updated every 24h). Cached in localStorage
 * for 12h. Fallback static rates are used until the first fetch resolves,
 * or if the network is unavailable.
 */
const FX_CACHE_KEY = 'flowist:fx:usd-rates:v1';
const FX_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const FX_ENDPOINT = 'https://open.er-api.com/v6/latest/USD';

// Static fallback rates (approximate, relative to USD) — used until the live
// fetch resolves.
const FALLBACK_USD_RATES: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, PKR: 278, INR: 83, AED: 3.67, SAR: 3.75,
  JPY: 156, CNY: 7.2, CAD: 1.37, AUD: 1.52, CHF: 0.89, BDT: 118, TRY: 34,
  RUB: 92, BRL: 5.5, ZAR: 18.2, SGD: 1.35, HKD: 7.8, KRW: 1385, MXN: 17.2,
  NZD: 1.66, SEK: 10.7, NOK: 11, DKK: 6.9,
};

// Live rates: 1 USD = <rate> <currency>. Populated by loadFxRates().
let usdRates: Record<string, number> = { ...FALLBACK_USD_RATES };

function loadCachedRates(): void {
  try {
    const raw = localStorage.getItem(FX_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { ts: number; rates: Record<string, number> };
    if (!parsed?.rates || typeof parsed.ts !== 'number') return;
    usdRates = { ...FALLBACK_USD_RATES, ...parsed.rates };
  } catch { /* ignore */ }
}

async function refreshFxRates(): Promise<void> {
  try {
    const cached = localStorage.getItem(FX_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as { ts: number };
      if (Date.now() - parsed.ts < FX_CACHE_TTL_MS) return; // still fresh
    }
    const res = await fetch(FX_ENDPOINT);
    if (!res.ok) return;
    const data = await res.json();
    if (data?.result !== 'success' || !data.rates) return;
    usdRates = { ...FALLBACK_USD_RATES, ...data.rates };
    localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ ts: Date.now(), rates: data.rates }));
  } catch { /* offline — keep cached/fallback */ }
}

// Initialise on module load.
if (typeof window !== 'undefined') {
  loadCachedRates();
  // Fire-and-forget background refresh.
  setTimeout(() => { void refreshFxRates(); }, 500);
}

// Common name → ISO 4217 aliases. Any ISO code returned by the FX API is
// accepted directly (see resolveCurrency), so we only need to list nicknames
// / non-standard shortcuts here.
const CURRENCY_ALIASES: Record<string, string> = {
  // South Asia
  RS: 'PKR', RUPEE: 'PKR', RUPEES: 'PKR', RUPIA: 'PKR',
  INR: 'INR', INRUPEE: 'INR', // "inr" already handled by ISO fallback
  TAKA: 'BDT', TK: 'BDT',
  NPR: 'NPR', LKR: 'LKR',
  // Western
  DOLLAR: 'USD', DOLLARS: 'USD', BUCK: 'USD', BUCKS: 'USD',
  EURO: 'EUR', EUROS: 'EUR',
  POUND: 'GBP', POUNDS: 'GBP', STERLING: 'GBP', QUID: 'GBP',
  FRANC: 'CHF', FRANCS: 'CHF',
  // East Asia
  YEN: 'JPY',
  YUAN: 'CNY', RMB: 'CNY', RENMINBI: 'CNY',
  WON: 'KRW',
  // Middle East
  DIRHAM: 'AED', DIRHAMS: 'AED',
  RIYAL: 'SAR', RIYALS: 'SAR', SR: 'SAR',
  DINAR: 'KWD', KD: 'KWD',
  SHEKEL: 'ILS', SHEKELS: 'ILS',
  LIRA: 'TRY', LIRAS: 'TRY', TL: 'TRY',
  // Other regions
  PESO: 'MXN', PESOS: 'MXN',
  REAL: 'BRL', REAIS: 'BRL', BRL: 'BRL',
  RAND: 'ZAR',
  RUBLE: 'RUB', RUBLES: 'RUB',
  KRONA: 'SEK', KRONE: 'NOK', KRONER: 'DKK',
  // Crypto (not supported by fiat FX API, but map for future)
  BITCOIN: 'BTC', BTC: 'BTC', ETHEREUM: 'ETH', ETH: 'ETH',
  // Canada/Aus/NZ dollar synonyms
  CAD: 'CAD', LOONIE: 'CAD',
  AUD: 'AUD', AUSSIE: 'AUD',
  NZD: 'NZD', KIWI: 'NZD',
};

/** Resolve any user-typed token to a currency code the API supports. */
function resolveCurrency(token: string): string | null {
  const upper = token.toUpperCase();
  // Direct ISO code returned by API (covers ~160 codes automatically).
  if (usdRates[upper]) return upper;
  // Nickname / alias lookup.
  const alias = CURRENCY_ALIASES[upper];
  if (alias && usdRates[alias]) return alias;
  return null;
}

let mathInstance: MathJsInstance | null = null;
function getMath(): MathJsInstance {
  if (mathInstance) return mathInstance;
  mathInstance = create(all, { number: 'number' });
  // Disable dangerous meta-functions that could redefine the evaluator or
  // register arbitrary units at runtime. NOTE: do NOT disable `evaluate`,
  // `parse`, `simplify`, or `derivative` — mathjs uses these internally
  // for every `math.evaluate(...)` call, so overriding them here would
  // break the entire inline math shortcut.
  mathInstance.import({
    import: function () { throw new Error('disabled'); },
    createUnit: function () { throw new Error('disabled'); },
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
  const from = resolveCurrency(m[2]);
  const to = resolveCurrency(m[3]);
  if (!from || !to) return null;
  const fromRate = usdRates[from];
  const toRate = usdRates[to];
  if (!fromRate || !toRate) return null;
  // usdRates[X] = how many X per 1 USD.
  const usd = amount / fromRate;
  const out = usd * toRate;
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
 * Detailed evaluation result.
 *   - kind:'not-math'  → segment doesn't look like math (silently ignore)
 *   - kind:'ok'        → evaluated successfully; `text` is " <result>"
 *   - kind:'error'     → segment looked like math but evaluation failed;
 *                        `message` is a short human-readable reason.
 */
export type MathEvalResult =
  | { kind: 'not-math' }
  | { kind: 'ok'; text: string }
  | { kind: 'error'; message: string };

/**
 * Full classifier + evaluator. Used by the `=` and space triggers so we can
 * distinguish "not math" (do nothing) from "math but broken" (show inline
 * error to the user instead of silently swallowing it).
 */
export function evaluateMathExpressionDetailed(rawBefore: string): MathEvalResult {
  const trimmed = rawBefore.replace(/\u00A0/g, ' ');
  const lastEq = trimmed.lastIndexOf('=');
  const segment = (lastEq >= 0 ? trimmed.slice(0, lastEq) : trimmed).trim();
  if (!segment) return { kind: 'not-math' };
  if (segment.length > 200) return { kind: 'not-math' };

  // Must contain at least one digit or math function name.
  if (!/[\d]/.test(segment) && !/\b(pi|e|tau|phi|sqrt|sin|cos|tan|log|ln|exp|abs)\b/i.test(segment)) {
    return { kind: 'not-math' };
  }

  // Prose reject — needs an operator/keyword or must look numeric-with-unit.
  const looksMathy =
    /[+\-*/^%()!]|to |in |of |sqrt|sin|cos|tan|log|ln|exp|abs|round|floor|ceil|mean|median|std|gcd|lcm|combinations|permutations|factorial|deg|rad|hex|bin|oct/i.test(segment)
    || /^\s*[\d.,]+\s*[a-zA-Z]/.test(segment);
  if (!looksMathy) {
    if (!/^[\d\s.,+\-*/^%()!]+$/.test(segment)) return { kind: 'not-math' };
  }

  // Currency conversion shortcut
  const cur = tryCurrency(segment);
  if (cur) return { kind: 'ok', text: ' ' + cur };

  // Percent-of shortcut
  const pct = tryPercentOf(segment);
  if (pct) return { kind: 'ok', text: ' ' + pct };

  const math = getMath();
  try {
    let expr = segment;
    expr = expr.replace(/(\d+(?:\.\d+)?)\s*%(?!\s*\d)/g, '($1/100)');
    const result = math.evaluate(expr);
    if (result === undefined || result === null) {
      return { kind: 'error', message: 'no result' };
    }
    if (typeof result === 'function') return { kind: 'not-math' };
    const formatted = formatResult(result);
    if (!formatted) return { kind: 'error', message: 'no result' };
    if (formatted === expr.trim()) return { kind: 'not-math' };
    return { kind: 'ok', text: ' ' + formatted };
  } catch (err: any) {
    const raw = String(err?.message || err || 'error');
    // Keep short + one line for inline display.
    const message = raw.replace(/\s+/g, ' ').slice(0, 80);
    return { kind: 'error', message };
  }
}

/**
 * Back-compat: string result, or null if not math OR if evaluation failed.
 * Prefer `evaluateMathExpressionDetailed` in new code.
 */
export function evaluateMathExpression(rawBefore: string): string | null {
  const r = evaluateMathExpressionDetailed(rawBefore);
  return r.kind === 'ok' ? r.text : null;
}

/**
 * Helper: is the current text node inside a code/pre block? (skip shortcut).
 */
function isInsideCode(root: HTMLElement, node: Node): boolean {
  let el: Node | null = node.parentNode;
  while (el && el !== root) {
    if (el.nodeType === 1) {
      const tag = (el as HTMLElement).tagName;
      if (tag === 'CODE' || tag === 'PRE') return true;
      if ((el as HTMLElement).classList?.contains('rt-codeblock')) return true;
    }
    el = el.parentNode;
  }
  return false;
}

/**
 * Handle `=` keypress. Inserts `= <result>` or `= ⚠ <error>` when the text
 * before the caret is (or looks like) a math expression. Returns true if it
 * consumed the keypress.
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

  if (isInsideCode(root, textNode)) return false;

  const r = evaluateMathExpressionDetailed(before);
  let insertion: string;
  if (r.kind === 'ok') {
    insertion = '=' + r.text;
  } else if (r.kind === 'error') {
    insertion = '= ⚠ ' + r.message;
  } else {
    return false;
  }

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

/**
 * Auto-evaluate on space. When the user types a space after a self-contained
 * math expression (e.g. `2+3 `), append `= <result>` automatically so no `=`
 * step is required. Runs only when the text right before the caret is a
 * strong-math segment to avoid clobbering prose like "I ate 3 apples ".
 *
 * Called AFTER the space has already been inserted by the browser.
 */
export function tryMathAutoOnSpace(root: HTMLElement | null): boolean {
  if (!root) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== 3) return false;
  const textNode = node as Text;
  const caret = range.startOffset;
  if (caret < 3) return false; // need at least "1+1 "
  const beforeAll = textNode.data.slice(0, caret);
  if (!/\s$/.test(beforeAll)) return false;
  // Already has `=` in the trailing segment? Skip — user is in `=`-driven mode.
  const trailingLine = beforeAll.split(/\n/).pop() || '';
  if (trailingLine.includes('=')) return false;

  // Extract the last whitespace-bounded expression segment.
  // We allow the segment to itself contain spaces IF the whole segment matches
  // a strong-math shape.
  const segRaw = trailingLine.replace(/\s+$/, '');
  if (!segRaw) return false;

  // Take the trailing chunk starting after the last hard boundary (start of
  // line, sentence terminator, or leading prose word).
  // Strong-math patterns we auto-run:
  //   1. Pure arithmetic: digits + operators + parens + %, must have operator.
  //   2. Function-call form: name(...)  e.g. sqrt(16), gcd(12,18), factorial(5)
  //   3. Unit / currency conversion: "5 km to miles", "100 usd to pkr"
  //   4. Percent-of: "50% of 200"
  //   5. Trailing "!" factorial: "5!"
  const arithMatch = segRaw.match(/[\d.()%^*/+\-!]+$/);
  const arithSeg = arithMatch ? arithMatch[0] : '';
  const strongArith =
    arithSeg.length >= 3 &&
    /[+\-*/^%!]/.test(arithSeg) &&
    /\d/.test(arithSeg) &&
    /^[\d.\s+\-*/^%()!]+$/.test(arithSeg);

  const funcMatch = segRaw.match(/\b(sqrt|sin|cos|tan|asin|acos|atan|log|ln|exp|abs|round|floor|ceil|factorial|gcd|lcm|mean|median|std|variance|combinations|permutations|hex|bin|oct)\s*\([^()]*\)$/i);

  const convMatch = segRaw.match(/(?:^|[\s.,;:!?])([\d.,]+\s*[a-zA-Z°$€£¥₹]{1,6}\s+(?:to|in)\s+[a-zA-Z°$€£¥₹]{1,6})$/i);

  const pctOfMatch = segRaw.match(/(?:^|\s)(\d+(?:\.\d+)?\s*%\s*of\s*\d+(?:\.\d+)?)$/i);

  let target: string | null = null;
  if (funcMatch) target = funcMatch[0];
  else if (convMatch) target = convMatch[1];
  else if (pctOfMatch) target = pctOfMatch[1];
  else if (strongArith) target = arithSeg;

  if (!target) return false;
  if (isInsideCode(root, textNode)) return false;

  const r = evaluateMathExpressionDetailed(target);
  if (r.kind !== 'ok') return false; // don't spam errors on plain space

  // Insert "= <result>" right after the trailing space we already have.
  const insertion = '= ' + r.text.trimStart();
  const after = textNode.data.slice(caret);
  textNode.data = beforeAll + insertion + after;

  const newRange = document.createRange();
  const newCaret = beforeAll.length + insertion.length;
  newRange.setStart(textNode, newCaret);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);
  return true;
}

