// Auto-calculator utility for detecting and solving math expressions in text
// Works completely offline - no external API calls
//
// All evaluation is delegated to the shared mathjs instance in
// `src/components/richtext/mathShortcut.ts`. This avoids `new Function` /
// `eval` and keeps math semantics consistent across the app (inline math
// shortcut, `=` trigger, and the auto-calculator all agree on results).

import { create, all, type MathJsInstance } from 'mathjs';

let mathInstance: MathJsInstance | null = null;
function getMath(): MathJsInstance {
  if (mathInstance) return mathInstance;
  mathInstance = create(all, { number: 'number' });
  // Disable dangerous meta-functions (same hardening as mathShortcut).
  mathInstance.import({
    import: function () { throw new Error('disabled'); },
    createUnit: function () { throw new Error('disabled'); },
  }, { override: true });
  return mathInstance;
}

/**
 * Safely evaluates a mathematical expression using mathjs.
 * Supports: +, -, *, /, ^, parentheses, x/× (multiplication), ÷ (division),
 * and % (percentage).
 *
 * Percentage handling:
 * - "50+10%" means 50 + (10% of 50) = 55
 * - "100-20%" means 100 - (20% of 100) = 80
 * - "50*10%" means 50 * 0.1 = 5
 * - "100/50%" means 100 / 0.5 = 200
 */
export const safeEvaluate = (expression: string): number | null => {
  try {
    let cleaned = expression.trim().replace(/\s+/g, '').replace(/=+$/, '');
    if (!cleaned) return null;

    // Normalize alternate operator glyphs.
    cleaned = cleaned.replace(/×/g, '*').replace(/x/gi, '*').replace(/÷/g, '/');

    // Whitelist: digits, operators, decimals, parens, % only.
    if (!/^[0-9+\-*/().^%]+$/.test(cleaned)) return null;
    // Must contain at least one operator.
    if (!/[+\-*/^%]/.test(cleaned)) return null;

    // Percentage rewrites (before handing to mathjs so semantics match the
    // "50+10% = 55" convention users expect from a calculator).
    cleaned = cleaned.replace(
      /(\d+(?:\.\d+)?)\s*([+\-])\s*(\d+(?:\.\d+)?)%/g,
      (_m, base, op, percent) => {
        const b = parseFloat(base);
        const p = parseFloat(percent);
        return `${b}${op}${(b * p) / 100}`;
      },
    );
    cleaned = cleaned.replace(
      /([*/])\s*(\d+(?:\.\d+)?)%/g,
      (_m, op, percent) => `${op}${parseFloat(percent) / 100}`,
    );
    cleaned = cleaned.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');

    // Guard against division by literal zero.
    if (/\/0(?![0-9.])/.test(cleaned)) return null;

    const math = getMath();
    const result = math.evaluate(cleaned);
    if (typeof result !== 'number' || !isFinite(result) || isNaN(result)) {
      return null;
    }
    // Round to avoid floating-point display noise.
    return Math.round(result * 1e9) / 1e9;
  } catch {
    return null;
  }
};

/**
 * Detects patterns like "3+4=" and returns the expression before =
 */
export const detectMathExpression = (text: string): { expression: string; position: number } | null => {
  // Match patterns like "3+4=", "10*5=", "(2+3)*4=", "56x45=", "50+10%=", etc.
  // The pattern should end with = and be preceded by a valid math expression
  // Include 'x' and '×' as multiplication symbols
  const regex = /([0-9+\-*/().^%×÷x\s]+)=$/i;
  const match = text.match(regex);
  
  if (match && match[1]) {
    const expression = match[1].trim();
    // Ensure there's at least one operator (including x for multiplication)
    if (/[+\-*/^%×÷x]/i.test(expression)) {
      return {
        expression,
        position: match.index || 0
      };
    }
  }
  
  return null;
};

/**
 * Process text and auto-complete calculations
 * Input: "3+4=" -> Output: "7"
 * Input: "56*45=" -> Output: "2520"
 * Input: "56x45=" -> Output: "2520"
 * Input: "50+10%=" -> Output: "55"
 * Input: "100-20%=" -> Output: "80"
 */
export const autoCalculate = (text: string): string | null => {
  const detected = detectMathExpression(text);
  
  if (!detected) return null;
  
  const result = safeEvaluate(detected.expression);
  
  if (result !== null) {
    // Format the result nicely
    const formattedResult = Number.isInteger(result) 
      ? result.toString() 
      : result.toFixed(Math.min(10, (result.toString().split('.')[1] || '').length));
    
    return formattedResult;
  }
  
  return null;
};

/**
 * Check if cursor is right after an = sign following a math expression
 */
export const shouldAutoCalculate = (text: string, cursorPosition: number): boolean => {
  const textBeforeCursor = text.substring(0, cursorPosition);
  return detectMathExpression(textBeforeCursor) !== null;
};
