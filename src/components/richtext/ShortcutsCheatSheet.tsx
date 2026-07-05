/**
 * ShortcutsCheatSheet — a comprehensive, in-editor reference of every
 * rich-text shortcut supported by the Notes editor.
 *
 * Rendered from the Note Editor options menu ("Shortcuts cheat sheet").
 * Purely presentational: no editor mutation, just a searchable dialog.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, Keyboard, Play, Hand } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getSlashRowTouchSlop,
  setSlashRowTouchSlop,
  SLASH_ROW_TOUCH_SLOP_MAX,
  SLASH_ROW_TOUCH_SLOP_MIN,
} from '@/utils/slashRowTouchSlop';

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

interface SubSection {
  title: string;
  rows: Row[];
}

interface Section {
  title: string;
  description?: string;
  rows: Row[];
  /** Optional collapsible sub-groups (rendered as <details>, closed by default). */
  groups?: SubSection[];
  /** When true, rows in this section are clickable and dispatch an apply event. */
  applySlash?: boolean;
}




function buildSections(): Section[] {
  return [
    {
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
      title: 'Slash commands',
      description: 'Complete short commands run automatically; commands with text still run with Space or Enter.',
      rows: [
        { trigger: '/h1', result: 'Heading 1', hint: 'also /h2, /h3' },
        { trigger: '/bullet', result: 'Bulleted list', hint: 'also /numbered, /todo' },
        { trigger: '/quote', result: 'Blockquote', hint: 'also /divider, /table' },
        { trigger: '/bold text', result: 'Bold text', hint: 'also /italic, /underline, /strike, /code, /highlight' },
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
      description:
        'Two ways: inline math via = or a /unit command block. Categories below are collapsed — tap to expand. Each shows two basic + two advanced examples.',
      rows: [
        { trigger: '5 km to miles =', result: 'Inline unit conversion' },
        { trigger: '/unit 10 km in miles', result: 'Same as inline, on its own line' },
        { trigger: '/unit help', result: 'Inline help card with all examples' },
      ],
      groups: [
        {
          title: 'Length',
          rows: [
            { trigger: '5 km to miles =', result: '3.10686 mi' },
            { trigger: '10 ft to m =', result: '3.048 m' },
            { trigger: '1 ly to au =', result: 'Light-year → astronomical unit' },
            { trigger: '3 parsec to km =', result: 'Astronomical distances' },
          ],
        },
        {
          title: 'Mass',
          rows: [
            { trigger: '2.5 kg to lb =', result: '5.51156 lb' },
            { trigger: '500 g to oz =', result: '17.637 oz' },
            { trigger: '1 slug to kg =', result: 'Imperial engineering mass' },
            { trigger: '12 amu to kg =', result: 'Atomic mass unit → kilograms' },
          ],
        },
        {
          title: 'Volume',
          rows: [
            { trigger: '1 gallon to liters =', result: '3.78541 L' },
            { trigger: '250 ml to cups =', result: 'Cooking measure' },
            { trigger: '1 bbl to L =', result: 'Oil barrel → litres' },
            { trigger: '2 m3 to ukgal =', result: 'Cubic metres → UK gallons' },
          ],
        },
        {
          title: 'Area',
          rows: [
            { trigger: '1 acre to m2 =', result: '4046.86 m²' },
            { trigger: '50 sqft to sqm =', result: 'Property area' },
            { trigger: '2 hectare to acre =', result: 'Land area' },
            { trigger: '1 sqmi to km2 =', result: 'Square miles → km²' },
          ],
        },
        {
          title: 'Temperature',
          rows: [
            { trigger: '100 f to c =', result: '37.7778 °C' },
            { trigger: '0 c to f =', result: '32 °F' },
            { trigger: '300 k to c =', result: 'Kelvin → Celsius' },
            { trigger: '500 r to k =', result: 'Rankine → Kelvin' },
          ],
        },
        {
          title: 'Time',
          rows: [
            { trigger: '2 h to min =', result: '120 min' },
            { trigger: '90 s to ms =', result: '90000 ms' },
            { trigger: '1 century to days =', result: 'Long-scale time' },
            { trigger: '1 year to μs =', result: 'Julian year → microseconds' },
          ],
        },
        {
          title: 'Speed',
          rows: [
            { trigger: '50 mph to kmh =', result: '80.4672 km/h' },
            { trigger: '10 m/s to kmh =', result: '36 km/h' },
            { trigger: '1 mach to mph =', result: 'Sound-speed reference' },
            { trigger: '0.001 c to km/s =', result: 'Fraction of light-speed' },
          ],
        },
        {
          title: 'Pressure',
          rows: [
            { trigger: '1 bar to psi =', result: '14.5038 psi' },
            { trigger: '760 torr to atm =', result: '1 atm' },
            { trigger: '1 kgf/cm2 to kPa =', result: 'Engineering pressure' },
            { trigger: '30 inHg to hPa =', result: 'Barometric conversion' },
          ],
        },
        {
          title: 'Energy',
          rows: [
            { trigger: '100 kcal to kj =', result: '418.4 kJ' },
            { trigger: '1 kWh to J =', result: '3.6 MJ' },
            { trigger: '1 therm to kWh =', result: 'Gas billing unit' },
            { trigger: '1 eV to J =', result: 'Particle-physics energy' },
          ],
        },
        {
          title: 'Power',
          rows: [
            { trigger: '100 hp to kW =', result: '74.5699 kW' },
            { trigger: '1500 W to hp =', result: '2.01 hp' },
            { trigger: '1 PS to W =', result: 'Metric horsepower' },
            { trigger: '5000 BTU/h to W =', result: 'HVAC capacity' },
          ],
        },
        {
          title: 'Data',
          rows: [
            { trigger: '5 gb as mb =', result: '5000 MB' },
            { trigger: '1024 kb to mb =', result: 'Decimal byte units' },
            { trigger: '1 TiB to GB =', result: 'Binary vs decimal (tebibyte → gigabyte)' },
            { trigger: '1 Gbit to MB =', result: 'Bits vs bytes' },
          ],
        },
        {
          title: 'Angle',
          rows: [
            { trigger: '180 deg to rad =', result: 'π rad' },
            { trigger: '1 turn to deg =', result: '360°' },
            { trigger: '1 arcmin to deg =', result: 'Astronomy / optics' },
            { trigger: '100 grad to arcsec =', result: 'Gradians → arcseconds' },
          ],
        },
        {
          title: 'Frequency',
          rows: [
            { trigger: '1 khz to hz =', result: '1000 Hz' },
            { trigger: '2.4 GHz to MHz =', result: '2400 MHz' },
            { trigger: '60 bpm to Hz =', result: '1 Hz' },
            { trigger: '3000 rpm to Hz =', result: 'Rotational → cyclic' },
          ],
        },
        {
          title: 'Force',
          rows: [
            { trigger: '10 N to lbf =', result: '2.24809 lbf' },
            { trigger: '1 kgf to N =', result: '9.80665 N' },
            { trigger: '1 dyn to N =', result: 'CGS force' },
            { trigger: '100 pdl to N =', result: 'Poundals → newtons' },
          ],
        },
        {
          title: 'Torque',
          rows: [
            { trigger: '100 Nm to lbft =', result: '73.7562 lbft' },
            { trigger: '50 lbft to Nm =', result: '67.7909 Nm' },
            { trigger: '1 kgm to Nm =', result: 'Metric engineering torque' },
            { trigger: '20 lbin to Nm =', result: 'Small-tool torque' },
          ],
        },
        {
          title: 'Fuel economy',
          rows: [
            { trigger: '25 mpg to l100km =', result: '9.41 L/100km' },
            { trigger: '8 l100km to mpg =', result: '29.4 mpg' },
            { trigger: '500 mi / 25 mpg to gal =', result: 'Mixed: distance ÷ economy → fuel' },
            { trigger: '(30 mpg * 15 gal) to mi =', result: 'Mixed: economy × fuel → distance' },
          ],
        },
        {
          title: 'Illuminance',
          rows: [
            { trigger: '500 lx to fc =', result: '46.45 fc' },
            { trigger: '10 fc to lx =', result: '107.64 lx' },
            { trigger: '1 phot to lux =', result: 'CGS illuminance' },
            { trigger: '1000 lx to phot =', result: 'Lux → phot' },
          ],
        },
        {
          title: 'Radioactivity',
          rows: [
            { trigger: '1 Ci to Bq =', result: '3.7 × 10¹⁰ Bq' },
            { trigger: '1 MBq to Ci =', result: 'Nuclear-medicine dose' },
            { trigger: '1 rem to Sv =', result: '0.01 Sv' },
            { trigger: '1 rad to Gy =', result: 'Absorbed-dose conversion' },
          ],
        },
      ],
    },



  ];

}

/**
 * Sweep every section and pull out rows whose `trigger` starts with `/`
 * (excluding the plain "/" row that just opens the slash menu). All of them
 * get consolidated into a single dedicated block at the top so the user can
 * click any command and have it applied to the editor immediately.
 */
function consolidateSlashCommands(sections: Section[]): Section[] {
  const slashRows: Row[] = [];
  const cleaned: Section[] = sections.map((s) => {
    const kept: Row[] = [];
    for (const r of s.rows) {
      const t = r.trigger.trim();
      // Only pull rows that start with `/word` — leave the bare "/" (opens menu)
      // and tokens like "/text" inside descriptive prose alone.
      if (/^\/[a-zA-Z]/.test(t)) {
        slashRows.push(r);
      } else {
        kept.push(r);
      }
    }
    return { ...s, rows: kept };
  }).filter((s) => s.rows.length > 0);

  if (slashRows.length === 0) return cleaned;

  const slashBlock: Section = {
    title: 'Slash commands (click to apply)',
    description: 'Tap any command below — the cheat sheet closes and it runs in the editor instantly.',
    rows: slashRows,
    applySlash: true,
  };
  return [slashBlock, ...cleaned];
}

/**
 * Sanitize a cheat-sheet trigger before dispatching it to the editor:
 *   - strip `<url>` / `<...>` placeholders
 *   - strip ellipsis characters
 *   - collapse whitespace
 * The remainder is inserted verbatim + trailing space so `trySlashLineShortcut`
 * runs it. Commands with only a `/word` prefix left over remain typed for the
 * user to complete their argument.
 */
function sanitizeSlashTrigger(trigger: string): string {
  return trigger
    .replace(/<[^>]*>/g, '')
    .replace(/…/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function ShortcutsCheatSheet({ isOpen, onClose }: Props) {
  const [query, setQuery] = useState('');
  const sections = useMemo(() => consolidateSlashCommands(buildSections()), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    const matchRow = (r: Row) =>
      r.trigger.toLowerCase().includes(q) ||
      r.result.toLowerCase().includes(q) ||
      (r.hint?.toLowerCase().includes(q) ?? false);
    return sections
      .map((s) => {
        const titleHit = s.title.toLowerCase().includes(q);
        const rows = titleHit ? s.rows : s.rows.filter(matchRow);
        const groups = (s.groups ?? [])
          .map((g) => {
            const gTitleHit = titleHit || g.title.toLowerCase().includes(q);
            const gRows = gTitleHit ? g.rows : g.rows.filter(matchRow);
            return { ...g, rows: gRows };
          })
          .filter((g) => g.rows.length > 0);
        return { ...s, rows, groups };
      })
      .filter((s) => s.rows.length > 0 || (s.groups && s.groups.length > 0));
  }, [query, sections]);

  // Live-updating touch slop for tap-vs-scroll detection on mobile.
  const [touchSlop, setTouchSlop] = useState<number>(() => getSlashRowTouchSlop());
  const touchSlopRef = useRef<number>(touchSlop);
  useEffect(() => { touchSlopRef.current = touchSlop; }, [touchSlop]);
  useEffect(() => {
    const onChange = (e: Event) => {
      const v = (e as CustomEvent<number>).detail;
      if (typeof v === 'number') setTouchSlop(v);
    };
    window.addEventListener('flowist:slash-touch-slop-changed', onChange as EventListener);
    return () => window.removeEventListener('flowist:slash-touch-slop-changed', onChange as EventListener);
  }, []);


  const applySlashRow = (trigger: string) => {
    const text = sanitizeSlashTrigger(trigger);
    if (!text.startsWith('/')) return;
    // Close the sheet first so the editor regains focus, then dispatch.
    onClose();
    setTimeout(() => {
      try {
        window.dispatchEvent(
          new CustomEvent('flowist:apply-slash-command', { detail: { text } }),
        );
      } catch {}
    }, 60);
  };

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
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Hand className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <label htmlFor="slash-touch-slop" className="shrink-0">
              Tap sensitivity
            </label>
            <input
              id="slash-touch-slop"
              type="range"
              min={SLASH_ROW_TOUCH_SLOP_MIN}
              max={SLASH_ROW_TOUCH_SLOP_MAX}
              step={1}
              value={touchSlop}
              onChange={(e) => {
                const v = Number(e.target.value);
                setTouchSlop(v);
                setSlashRowTouchSlop(v);
              }}
              className="flex-1 accent-primary"
              aria-label="Touch move threshold in pixels before a row tap is treated as a scroll"
            />
            <span className="tabular-nums w-10 text-right">{touchSlop}px</span>
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
              {section.rows.length > 0 && renderRowsTable(section.rows, !!section.applySlash)}
              {section.groups && section.groups.length > 0 && (
                <div className="mt-3 space-y-2">
                  {section.groups.map((group) => (
                    <details
                      key={group.title}
                      // Only auto-open while the user is actively searching so
                      // matched sub-groups reveal their rows; otherwise stays
                      // collapsed as the user requested.
                      open={query.trim().length > 0}
                      className="group rounded-md border bg-background overflow-hidden"
                    >
                      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium flex items-center gap-2 hover:bg-muted/50 marker:hidden [&::-webkit-details-marker]:hidden">
                        <span className="inline-block transition-transform group-open:rotate-90 text-muted-foreground">
                          ▶
                        </span>
                        <span>{group.title}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {group.rows.length}
                        </span>
                      </summary>
                      <div className="border-t">
                        {renderRowsTable(group.rows, false)}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </section>
          ))}

          <p className="text-xs text-muted-foreground text-center pt-2">
            Tip: shortcuts are silently skipped inside code blocks so you can type raw Markdown / LaTeX freely.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );

  function renderRowsTable(rows: Row[], clickable: boolean) {
    return (
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row, i) => {
              const rowClasses = cn(
                'border-b last:border-b-0 transition-colors select-none',
                i % 2 === 0 ? 'bg-muted/30' : 'bg-background',
                clickable && 'cursor-pointer hover:bg-accent/60 active:bg-accent',
              );
              const touchStartRef = { x: 0, y: 0, moved: false };
              const handlePointerDown = clickable
                ? (e: React.PointerEvent<HTMLTableRowElement>) => {
                    touchStartRef.x = e.clientX;
                    touchStartRef.y = e.clientY;
                    touchStartRef.moved = false;
                  }
                : undefined;
              const handlePointerMove = clickable
                ? (e: React.PointerEvent<HTMLTableRowElement>) => {
                    const slop = touchSlopRef.current;
                    if (
                      Math.abs(e.clientX - touchStartRef.x) > slop ||
                      Math.abs(e.clientY - touchStartRef.y) > slop
                    ) {
                      touchStartRef.moved = true;
                    }
                  }
                : undefined;
              const handlePointerUp = clickable
                ? (e: React.PointerEvent<HTMLTableRowElement>) => {
                    if (touchStartRef.moved) return;
                    if (e.pointerType === 'mouse') return;
                    e.preventDefault();
                    applySlashRow(row.trigger);
                  }
                : undefined;
              const handleClick = clickable
                ? (e: React.MouseEvent<HTMLTableRowElement>) => {
                    const anyEvt = e.nativeEvent as PointerEvent;
                    if (anyEvt.pointerType && anyEvt.pointerType !== 'mouse') return;
                    applySlashRow(row.trigger);
                  }
                : undefined;
              const handleKey = clickable
                ? (e: React.KeyboardEvent<HTMLTableRowElement>) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      applySlashRow(row.trigger);
                    }
                  }
                : undefined;
              return (
                <tr
                  key={i}
                  className={rowClasses}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onClick={handleClick}
                  onKeyDown={handleKey}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  aria-label={clickable ? `Apply ${row.trigger}` : undefined}
                  style={clickable ? { touchAction: 'pan-y' } : undefined}
                >
                  <td className="px-3 py-2 align-top w-[45%]">
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono whitespace-pre-wrap break-words">
                        {row.trigger}
                      </code>
                      {clickable && (
                        <Play className="h-3 w-3 text-primary shrink-0" aria-hidden />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div>{row.result}</div>
                    {row.hint && (
                      <div className="text-xs text-muted-foreground mt-0.5">{row.hint}</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
}
