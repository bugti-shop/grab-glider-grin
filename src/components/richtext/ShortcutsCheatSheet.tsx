/**
 * ShortcutsCheatSheet — a comprehensive, in-editor reference of every
 * rich-text shortcut supported by the Notes editor.
 *
 * Rendered from the Note Editor options menu ("Shortcuts cheat sheet").
 * Purely presentational: no editor mutation, just a searchable dialog.
 */

import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface Row {
  /** Left column: the keystroke, token, or phrase to type. */
  trigger: string;
  /** Right column: what it produces. */
  result: string;
  /** Optional hint / example. */
  hint?: string;
}

interface Section {
  title: string;
  description?: string;
  rows: Row[];
}

/** Detect mac so we can display ⌘ instead of Ctrl. */
const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? '⌘' : 'Ctrl';
const ALT = isMac ? '⌥' : 'Alt';
const SHIFT = isMac ? '⇧' : 'Shift';

function buildSections(): Section[] {
  return [

      title: 'Markdown block shortcuts',
      description: 'Type these tokens at the start of a line, then press Space.',
      rows: [
        { trigger: '# ', result: 'Heading 1' },
        { trigger: '## ', result: 'Heading 2' },
        { trigger: '### ', result: 'Heading 3' },
        { trigger: '#### ', result: 'Heading 4' },
        { trigger: '- ', result: 'Bullet list', hint: 'also * or +' },
        { trigger: '1. ', result: 'Numbered list', hint: 'any digits + .' },
        { trigger: '[] ', result: 'To-do (unchecked)', hint: 'also [ ]' },
        { trigger: '[x] ', result: 'To-do (checked)' },
        { trigger: '> ', result: 'Blockquote' },
        { trigger: '``` + Enter', result: 'Fenced code block' },
        { trigger: '--- + Enter', result: 'Horizontal divider' },
        { trigger: 'Inside a list, type -/*/1. + Space', result: 'Creates a nested sub-list (no Tab needed)' },
      ],
    },
    {
      title: 'Markdown inline shortcuts',
      description: 'Type the closing marker to convert the wrapped text.',
      rows: [
        { trigger: '**text**', result: 'Bold' },
        { trigger: '*text*', result: 'Italic', hint: 'also _text_' },
        { trigger: '`text`', result: 'Inline code' },
        { trigger: '~~text~~', result: 'Strikethrough' },
        { trigger: '==text==', result: 'Highlight' },
      ],
    },
    {
      title: 'Tables',
      description: 'Fast ways to insert and grow tables.',
      rows: [
        { trigger: '/table', result: 'Open the table picker (rows × columns)' },
        { trigger: '2x3 + Space', result: 'Instant 2-row × 3-col table', hint: 'any NxM up to 10x10' },
        { trigger: '| a | b | + Enter', result: 'Markdown pipe table — Enter converts the line into a real table' },
        { trigger: 'Tab / Shift+Tab (in cell)', result: 'Next / previous cell' },
        { trigger: 'Enter (last row)', result: 'Adds a new row below' },
        { trigger: 'Right-click / long-press cell', result: 'Table menu: insert/delete row/column, styles' },
      ],
    },
    {
      title: 'Slash commands (type at line start, press Enter)',
      description: 'Powerful block inserters. Full slash menu also opens with “/”.',
      rows: [
        { trigger: '/lorem 3', result: '3 paragraphs of Lorem ipsum (1–20)' },
        { trigger: '/color red Hello', result: 'Colored text (name or #hex)' },
        { trigger: '/qr https://…', result: 'QR-code image block' },
        { trigger: '/mermaid graph TD; A-->B', result: 'Rendered Mermaid diagram' },
        { trigger: '/chess FEN', result: 'Rendered chess board (defaults to start position)' },
        { trigger: '/toc', result: 'Auto table of contents from headings' },
        { trigger: '/youtube <url>', result: 'YouTube embed', hint: 'also /yt' },
        { trigger: '/spotify <url>', result: 'Spotify track / album / playlist embed' },
        { trigger: '/tweet <url>', result: 'Tweet / X embed', hint: 'also /x, /twitter' },
      ],
    },
    {
      title: 'Dates & time',
      description: 'Insert relative dates, weekdays, and world clocks.',
      rows: [
        { trigger: '/today', result: "Today's date" },
        { trigger: '/tomorrow', result: "Tomorrow's date" },
        { trigger: '/yesterday', result: "Yesterday's date" },
        { trigger: '/now', result: 'Current date & time' },
        { trigger: '+3d + Space', result: '3 days from today', hint: 'also +2w (weeks), +1mo (months), +1y (years)' },
        { trigger: '+3h / +45m / -30s', result: 'Relative date + time (hours / minutes / seconds)' },
        { trigger: '@friday', result: 'Next Friday’s date', hint: 'any weekday name works (@mon, @thu, …)' },
        { trigger: '/tz tokyo', result: 'Current time in that city / IANA zone', hint: 'also /time, /timezone' },
      ],
    },
    {
      title: 'Math (type expression, press =)',
      description: 'Inline calculator powered by mathjs.',
      rows: [
        { trigger: '2 + 3 =', result: '5' },
        { trigger: '(2+3)*4 =', result: '20' },
        { trigger: '2^10 =', result: '1024' },
        { trigger: '17 % 5 =', result: '2  (modulo)' },
        { trigger: 'sqrt(16) =', result: '4' },
        { trigger: '5! =', result: '120  (factorial)' },
        { trigger: 'sin(pi/2) =', result: '1' },
        { trigger: 'tan(45 deg) =', result: '1' },
        { trigger: 'log(100, 10) =', result: '2' },
        { trigger: 'ln(e) =', result: '1' },
        { trigger: 'round(3.7) / floor(3.9) / ceil(3.1) =', result: 'rounding helpers' },
        { trigger: 'abs(-5) =', result: '5' },
        { trigger: 'gcd(12,18) / lcm(4,6) =', result: 'number-theory helpers' },
        { trigger: 'mean(1,2,3) / median / std / variance =', result: 'Statistics' },
        { trigger: 'combinations(5,2) / permutations(5,2) =', result: 'Combinatorics' },
        { trigger: '5 & 3, 5 | 3, 5 xor 3, 5 << 1, ~5 =', result: 'Bitwise operators' },
        { trigger: '0b1010, 0o17, 0xff =', result: 'Binary / octal / hex literals' },
        { trigger: 'hex(255) / bin(10) / oct(9) =', result: 'Base conversion' },
        { trigger: '(2 + 3i) * (1 - i) =', result: 'Complex numbers' },
        { trigger: '1/3 + 1/6 =', result: 'Fraction arithmetic' },
        { trigger: '50% of 200 =', result: '100  (percent-of)' },
        { trigger: '200 - 10% =', result: '180  (calculator-style %)' },
      ],
    },
    {
      title: 'Currency (type “N FROM to TO”, press =)',
      description: 'Uses live FX rates (cached 12h); shows ≈ when using fallback.',
      rows: [
        { trigger: '100 usd to pkr =', result: '≈ live conversion' },
        { trigger: '50 eur to usd =', result: '≈ live conversion' },
        { trigger: '2500 jpy in gbp =', result: '≈ live conversion', hint: '“in” or “to” both work' },
        { trigger: 'Nicknames', result: 'dollar, euro, pound, yen, yuan, rupee, taka, dirham, riyal, dinar, peso, real, rand, ruble, franc, krona, loonie, aussie, kiwi …' },
        { trigger: 'ISO codes', result: 'Any of ~160 ISO 4217 codes returned by the FX API (USD, EUR, GBP, JPY, AED, SAR, PKR, INR, CAD, AUD, CHF, CNY, KRW, TRY, BRL, ZAR, …)' },
      ],
    },
    {
      title: 'Unit conversion',
      description: 'Two ways: inline math via = or a /unit command block.',
      rows: [
        { trigger: '5 km to miles =', result: 'Inline unit conversion' },
        { trigger: '100 f to c =', result: 'Temperature (Fahrenheit → Celsius)' },
        { trigger: '2.5 kg to lb =', result: 'Mass' },
        { trigger: '1 gallon to liters =', result: 'Volume' },
        { trigger: '/unit 10 km in miles', result: 'Same as inline, on its own line' },
        { trigger: '/unit 5 gb as mb', result: 'Data sizes' },
        { trigger: '/unit 2 h in min', result: 'Time' },
        { trigger: '/unit 1 bar in psi', result: 'Pressure' },
        { trigger: '/unit 50 mph in kmh', result: 'Speed' },
        { trigger: '/unit 1 acre in m2', result: 'Area' },
        { trigger: '/unit 100 kcal in kj', result: 'Energy' },
        { trigger: '/unit 25 mpg in l100km', result: 'Fuel economy' },
        { trigger: '/unit help', result: 'Inline help card with all examples' },
      ],
    },
    {
      title: 'LaTeX / KaTeX',
      description: 'Beautifully rendered math inline.',
      rows: [
        { trigger: '$E = mc^2$', result: 'Rendered inline KaTeX (typing the closing $ triggers it)' },
        { trigger: '$\\frac{a}{b}$', result: 'Fractions, superscripts, subscripts, roots — full LaTeX math syntax' },
      ],
    },
    {
      title: 'Greek letters & math symbols (type \\name, then Space)',
      description: '100+ tokens. A few of the most useful:',
      rows: [
        { trigger: '\\alpha  \\beta  \\gamma  \\delta  \\pi  \\theta  \\lambda  \\sigma  \\omega', result: 'α β γ δ π θ λ σ ω  (all lowercase Greek)' },
        { trigger: '\\Alpha  \\Delta  \\Sigma  \\Omega  \\Pi  \\Theta  \\Lambda', result: 'Α Δ Σ Ω Π Θ Λ  (all uppercase Greek)' },
        { trigger: '\\sum  \\prod  \\int  \\iint  \\oint  \\sqrt  \\partial  \\nabla', result: '∑ ∏ ∫ ∬ ∮ √ ∂ ∇' },
        { trigger: '\\infty  \\forall  \\exists  \\emptyset  \\in  \\notin  \\subset  \\cup  \\cap', result: '∞ ∀ ∃ ∅ ∈ ∉ ⊂ ∪ ∩' },
        { trigger: '\\neq  \\leq  \\geq  \\approx  \\equiv  \\cong  \\sim  \\propto', result: '≠ ≤ ≥ ≈ ≡ ≅ ∼ ∝' },
        { trigger: '\\to  \\rightarrow  \\leftarrow  \\leftrightarrow  \\Rightarrow  \\Leftrightarrow  \\mapsto', result: '→ → ← ↔ ⇒ ⇔ ↦' },
        { trigger: '\\land  \\lor  \\lnot  \\implies  \\iff', result: '∧ ∨ ¬ ⟹ ⟺' },
        { trigger: '\\pm  \\mp  \\times  \\div  \\cdot  \\degree', result: '± ∓ × ÷ · °' },
        { trigger: '\\hbar  \\ell  \\aleph  \\Re  \\Im  \\wp', result: 'ℏ ℓ ℵ ℜ ℑ ℘' },
        { trigger: '\\ldots  \\cdots  \\vdots  \\ddots', result: '… ⋯ ⋮ ⋱' },
        { trigger: '\\copyright  \\trademark  \\registered  \\dagger  \\section  \\para', result: '© ™ ® † § ¶' },
      ],
    },
    {
      title: 'Smart text replacements',
      description: 'Fires automatically as you type — no shortcut needed.',
      rows: [
        { trigger: '"word"', result: 'Curly quotes: “word”' },
        { trigger: "'word'", result: 'Curly apostrophes: ‘word’' },
        { trigger: '-- + Space', result: 'Em-dash: —' },
        { trigger: '--- + Space', result: 'Em-dash (Word behavior): —' },
        { trigger: '... + Space', result: 'Ellipsis: …' },
        { trigger: '(c)', result: '©' },
        { trigger: '(tm)', result: '™' },
        { trigger: '(r)', result: '®' },
        { trigger: 'the the', result: 'Repeated word gets flagged (dashed underline)' },
      ],
    },
    {
      title: 'Editing & navigation',
      rows: [
        { trigger: 'Tab / Shift+Tab (in list)', result: 'Indent / outdent list item' },
        { trigger: 'Enter on empty list item', result: 'Exit the list' },
        { trigger: 'Backspace at line start', result: 'Convert heading / quote / list back to a paragraph' },
        { trigger: '/', result: 'Open slash-command menu' },
        { trigger: '@', result: 'Mention / link another note' },
        { trigger: `${MOD} + F`, result: 'Open Find & Replace' },
      ],
    },
    {
      title: 'Mobile tips',
      description: 'No Ctrl key needed on phones — use the quick bar, selection bubble, or simple typed commands.',
      rows: [
        { trigger: 'Tap B / I / U / H1 / • / 1. / ☑ / table', result: 'Applies the same action as Ctrl shortcuts from the mobile quick bar.' },
        { trigger: 'Select text → tap bubble buttons', result: 'Bold, italic, underline, strike, code, link, comment, or Markdown convert.' },
        { trigger: '/bold text + Space', result: 'Turns “text” bold', hint: 'also /italic text, /underline text, /strike text, /code text, /highlight text' },
        { trigger: '/h1 + Space', result: 'Heading 1', hint: 'also /h2, /h3, /bullet, /numbered, /check, /quote, /divider' },
        { trigger: 'Type token + Space', result: 'Markdown shortcuts still work — headings, lists, todos, tables, dates, units, symbols.' },
        { trigger: 'Long-press a table cell', result: 'Opens the table menu (insert / delete row-col, styles).' },
      ],
    },
  ];
}

export default function ShortcutsCheatSheet({ isOpen, onClose }: Props) {
  const [query, setQuery] = useState('');
  const sections = useMemo(buildSections, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((s) => ({
        ...s,
        rows: s.rows.filter(
          (r) =>
            r.trigger.toLowerCase().includes(q) ||
            r.result.toLowerCase().includes(q) ||
            (r.hint?.toLowerCase().includes(q) ?? false) ||
            s.title.toLowerCase().includes(q),
        ),
      }))
      .filter((s) => s.rows.length > 0);
  }, [query, sections]);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            Shortcuts cheat sheet
          </DialogTitle>
          <DialogDescription>
            Every shortcut supported by the notes editor — keyboard, Markdown, tables, dates,
            math, currency, units, LaTeX, symbols, and more.
          </DialogDescription>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search shortcuts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {filtered.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-10">
              No shortcuts match “{query}”.
            </div>
          )}
          {filtered.map((section) => (
            <section key={section.title}>
              <h3 className="text-sm font-semibold mb-1">{section.title}</h3>
              {section.description && (
                <p className="text-xs text-muted-foreground mb-2">{section.description}</p>
              )}
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {section.rows.map((row, i) => (
                      <tr
                        key={i}
                        className={cn(
                          'border-b last:border-b-0',
                          i % 2 === 0 ? 'bg-muted/30' : 'bg-background',
                        )}
                      >
                        <td className="px-3 py-2 align-top w-[45%]">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono whitespace-pre-wrap break-words">
                            {row.trigger}
                          </code>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div>{row.result}</div>
                          {row.hint && (
                            <div className="text-xs text-muted-foreground mt-0.5">{row.hint}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <p className="text-xs text-muted-foreground text-center pt-2">
            Tip: shortcuts are silently skipped inside code blocks so you can type raw Markdown / LaTeX freely.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
