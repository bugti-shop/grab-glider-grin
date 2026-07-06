import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import {
  FileText, LayoutList, LayoutGrid, Rows3, Settings2, ExternalLink,
  Link2, Sigma, Globe, Palette, Type,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadNoteFromDB, loadNotesMetadataFromDB } from '@/utils/noteStorage';
import { getSetting, setSetting } from '@/utils/settingsStorage';
import type { Note } from '@/types/note';

export type NoteBlockLayout = 'list' | 'grid' | 'compact';
export type WidgetAccent = 'primary' | 'blue' | 'emerald' | 'rose' | 'amber' | 'violet';
export type WidgetFontScale = 'sm' | 'md' | 'lg';
export type WidgetDensity = 'cozy' | 'compact';

interface NoteBlocksConfig {
  noteId: string | null;
  layout: NoteBlockLayout;
  maxBlocks: number;
  accent: WidgetAccent;
  fontScale: WidgetFontScale;
  density: WidgetDensity;
}

type BlockKind =
  | 'heading' | 'checklist' | 'paragraph' | 'image'
  | 'link' | 'webclip' | 'formula';

interface Block {
  kind: BlockKind;
  text: string;
  checked?: boolean;
  src?: string;
  // link / webclip
  href?: string;
  domain?: string;
  favicon?: string;
  // formula
  expr?: string;
  value?: string;
  // navigation
  anchorText?: string;
}

// SETTINGS_KEY is synced via setSetting (per-user cloud snapshot),
// so layout + selected note follow the user across devices.
const SETTINGS_KEY = 'home_note_blocks_widget';
const DEFAULT_CONFIG: NoteBlocksConfig = {
  noteId: null,
  layout: 'list',
  maxBlocks: 8,
  accent: 'primary',
  fontScale: 'md',
  density: 'cozy',
};

const ACCENTS: Record<WidgetAccent, { swatch: string; ring: string; text: string; bg: string; border: string }> = {
  primary: { swatch: 'bg-primary',       ring: 'ring-primary/40',   text: 'text-primary',       bg: 'bg-primary/10',       border: 'border-primary/30' },
  blue:    { swatch: 'bg-sky-500',       ring: 'ring-sky-400/40',   text: 'text-sky-600 dark:text-sky-400',       bg: 'bg-sky-500/10',       border: 'border-sky-500/30' },
  emerald: { swatch: 'bg-emerald-500',   ring: 'ring-emerald-400/40', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10',   border: 'border-emerald-500/30' },
  rose:    { swatch: 'bg-rose-500',      ring: 'ring-rose-400/40',  text: 'text-rose-600 dark:text-rose-400',      bg: 'bg-rose-500/10',      border: 'border-rose-500/30' },
  amber:   { swatch: 'bg-amber-500',     ring: 'ring-amber-400/40', text: 'text-amber-600 dark:text-amber-400',    bg: 'bg-amber-500/10',     border: 'border-amber-500/30' },
  violet:  { swatch: 'bg-violet-500',    ring: 'ring-violet-400/40', text: 'text-violet-600 dark:text-violet-400',  bg: 'bg-violet-500/10',    border: 'border-violet-500/30' },
};

const FONT_SIZE: Record<WidgetFontScale, string> = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' };
const DENSITY_GAP: Record<WidgetDensity, string> = { cozy: 'space-y-1.5', compact: 'space-y-0.5' };
const DENSITY_PAD: Record<WidgetDensity, string> = { cozy: 'p-2', compact: 'px-1.5 py-1' };

/**
 * Very small, side-effect free evaluator for the tiny formula language we
 * expose: {{today}}, {{now}}, {{date+7}}, and plain arithmetic {{5*3}} /
 * =SUM(1,2,3). Anything we cannot safely evaluate is returned as-is so the
 * user still sees the raw expression as a card.
 */
function evalFormula(raw: string): string {
  const expr = raw.trim();
  const lower = expr.toLowerCase();
  if (lower === 'today') return new Date().toLocaleDateString();
  if (lower === 'now') return new Date().toLocaleString();
  const dateOffset = lower.match(/^(today|now)\s*([+-])\s*(\d+)$/);
  if (dateOffset) {
    const d = new Date();
    const delta = parseInt(dateOffset[3], 10) * (dateOffset[2] === '-' ? -1 : 1);
    d.setDate(d.getDate() + delta);
    return d.toLocaleDateString();
  }
  const sum = expr.match(/^SUM\(([^)]*)\)$/i);
  if (sum) {
    const nums = sum[1].split(',').map((n) => Number(n.trim())).filter((n) => !Number.isNaN(n));
    return String(nums.reduce((a, b) => a + b, 0));
  }
  if (/^[\d+\-*/(). ]+$/.test(expr)) {
    try { // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const v = Function(`"use strict"; return (${expr});`)();
      if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    } catch { /* fall through */ }
  }
  return expr;
}

function safeDomain(href: string): string {
  try { return new URL(href).hostname.replace(/^www\./, ''); }
  catch { return href.slice(0, 40); }
}

/** Parses a note's HTML content into a compact list of display blocks. */
function extractBlocks(html: string, limit: number): Block[] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: Block[] = [];
  const seenHrefs = new Set<string>();

  // 1. Web-clip cards (rendered by our clipper as .flowist-web-clip)
  doc.body.querySelectorAll('.flowist-web-clip, [data-webclip]').forEach((clip) => {
    if (out.length >= limit) return;
    const link = clip.querySelector('a[href]') as HTMLAnchorElement | null;
    const href = link?.getAttribute('href') || '';
    const title = (clip.querySelector('h1, h2, .flowist-web-clip__title')?.textContent || '').trim();
    const excerpt = (clip.querySelector('.flowist-web-clip__excerpt, p')?.textContent || '').trim();
    if (href) seenHrefs.add(href);
    out.push({
      kind: 'webclip',
      text: title || safeDomain(href),
      href,
      domain: safeDomain(href),
      favicon: href ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(safeDomain(href))}&sz=64` : undefined,
      anchorText: title || excerpt.slice(0, 60),
    });
  });

  // 2. Regular structural blocks
  const walker = doc.body.querySelectorAll(
    'h1, h2, h3, h4, li.checklist-item, li, p, img, a[href]',
  );
  for (const el of Array.from(walker)) {
    if (out.length >= limit) break;
    if (el.closest('.flowist-web-clip, [data-webclip]')) continue; // already captured
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').trim();

    if (tag === 'img') {
      const src = (el as HTMLImageElement).getAttribute('src') || '';
      if (src) out.push({ kind: 'image', text: '', src, anchorText: (el as HTMLImageElement).alt || '' });
      continue;
    }

    if (tag === 'a') {
      const href = (el as HTMLAnchorElement).getAttribute('href') || '';
      if (!href || !/^https?:/i.test(href) || seenHrefs.has(href)) continue;
      // Skip anchor-only links inside a paragraph the walker will also catch
      const isStandalone = el.parentElement?.children.length === 1;
      if (!isStandalone && text.length < 8) continue;
      seenHrefs.add(href);
      out.push({
        kind: 'link',
        text: text || safeDomain(href),
        href,
        domain: safeDomain(href),
        favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(safeDomain(href))}&sz=64`,
        anchorText: text,
      });
      continue;
    }

    if (!text) continue;

    // Formula detection inside any text block: {{...}} or leading =FUNC(...)
    const formulaMatch = text.match(/\{\{([^}]+)\}\}|^=([A-Z]+\([^)]*\)|[\d+\-*/(). ]+)$/);
    if (formulaMatch) {
      const expr = (formulaMatch[1] || formulaMatch[2] || '').trim();
      out.push({ kind: 'formula', text, expr, value: evalFormula(expr), anchorText: text });
      continue;
    }

    if (tag.startsWith('h')) {
      out.push({ kind: 'heading', text, anchorText: text });
    } else if (el.classList?.contains('checklist-item')) {
      const checked = el.getAttribute('checked') === 'true' ||
        el.querySelector('input[type="checkbox"]')?.hasAttribute('checked') ||
        false;
      out.push({ kind: 'checklist', text, checked: !!checked, anchorText: text });
    } else {
      const clipped = text.length > 140 ? text.slice(0, 140) + '…' : text;
      out.push({ kind: 'paragraph', text: clipped, anchorText: text.slice(0, 60) });
    }
  }
  return out;
}

export const NoteBlocksWidget = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<NoteBlocksConfig>(DEFAULT_CONFIG);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [cfg, allNotes] = await Promise.all([
        getSetting<NoteBlocksConfig>(SETTINGS_KEY, DEFAULT_CONFIG),
        loadNotesMetadataFromDB(),
      ]);
      setConfig({ ...DEFAULT_CONFIG, ...cfg });
      setNotes(allNotes);
      setLoading(false);
    })();
  }, []);

  const persist = async (next: NoteBlocksConfig) => {
    setConfig(next);
    // setSetting mirrors to the cloud snapshot → follows the user across devices.
    await setSetting(SETTINGS_KEY, next);
  };

  const activeNote = useMemo(
    () => notes.find((n) => n.id === config.noteId) ?? null,
    [notes, config.noteId],
  );

  useEffect(() => {
    if (!activeNote || !(activeNote as any).__contentStub) return;
    let cancelled = false;
    loadNoteFromDB(activeNote.id)
      .then((full) => {
        if (!cancelled && full) {
          setNotes((prev) => prev.map((n) => (n.id === full.id ? full : n)));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeNote?.id, (activeNote as any)?.__contentStub]);

  const blocks = useMemo(
    () => (activeNote ? extractBlocks(activeNote.content || '', config.maxBlocks) : []),
    [activeNote, config.maxBlocks],
  );

  const accent = ACCENTS[config.accent];
  const fontClass = FONT_SIZE[config.fontScale];

  /**
   * Open the note in the editor, focused on the block the user tapped.
   * We pass `focusText` in the query string; Notes.tsx reads it and hands
   * off to NoteEditor which scrolls the matching node into view. The
   * underlying note content is never modified — the link is a pure jump.
   */
  const openAt = (block: Block) => {
    if (!activeNote) return;
    if (block.kind === 'link' || block.kind === 'webclip') {
      // External destination — open in a new tab and keep the widget in place.
      if (block.href) window.open(block.href, '_blank', 'noopener,noreferrer');
      return;
    }
    const params = new URLSearchParams();
    params.set('openNote', activeNote.id);
    const anchor = (block.anchorText || block.text || '').trim().slice(0, 120);
    if (anchor) params.set('focusText', anchor);
    navigate(`/notes?${params.toString()}`);
  };

  if (loading) return null;

  return (
    <Card className={cn('overflow-hidden', accent.border, 'border')}>
      <CardHeader className={cn('pb-2', accent.bg)}>
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className={cn('flex items-center gap-2', accent.text)}>
            <FileText className="h-4 w-4" />
            {activeNote ? activeNote.title || 'Untitled note' : 'Note widget'}
          </span>
          <div className="flex items-center gap-1">
            {activeNote && (
              <button
                type="button"
                onClick={() => navigate(`/notes?openNote=${activeNote.id}`)}
                className="text-muted-foreground hover:text-foreground p-1"
                title="Open note"
                aria-label="Open note"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7">
                  <Settings2 className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 max-h-96 overflow-auto">
                <DropdownMenuLabel>Layout</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={config.layout}
                  onValueChange={(v) => persist({ ...config, layout: v as NoteBlockLayout })}
                >
                  <DropdownMenuRadioItem value="list">
                    <LayoutList className="h-3.5 w-3.5 mr-2" /> List
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="grid">
                    <LayoutGrid className="h-3.5 w-3.5 mr-2" /> Grid
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="compact">
                    <Rows3 className="h-3.5 w-3.5 mr-2" /> Compact
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-2">
                  <Palette className="h-3.5 w-3.5" /> Accent
                </DropdownMenuLabel>
                <div className="flex flex-wrap gap-2 px-2 py-1.5">
                  {(Object.keys(ACCENTS) as WidgetAccent[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => persist({ ...config, accent: k })}
                      className={cn(
                        'h-6 w-6 rounded-full ring-offset-1 ring-offset-background transition',
                        ACCENTS[k].swatch,
                        config.accent === k ? `ring-2 ${ACCENTS[k].ring}` : 'ring-0 opacity-70 hover:opacity-100',
                      )}
                      aria-label={`Accent ${k}`}
                    />
                  ))}
                </div>

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-2">
                  <Type className="h-3.5 w-3.5" /> Text size
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={config.fontScale}
                  onValueChange={(v) => persist({ ...config, fontScale: v as WidgetFontScale })}
                >
                  <DropdownMenuRadioItem value="sm">Small</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="md">Medium</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="lg">Large</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Density</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={config.density}
                  onValueChange={(v) => persist({ ...config, density: v as WidgetDensity })}
                >
                  <DropdownMenuRadioItem value="cozy">Cozy</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Source note</DropdownMenuLabel>
                {notes.slice(0, 40).map((n) => (
                  <DropdownMenuItem
                    key={n.id}
                    onSelect={() => persist({ ...config, noteId: n.id })}
                    className={cn(config.noteId === n.id && 'bg-accent')}
                  >
                    <span className="truncate">{n.title || 'Untitled'}</span>
                  </DropdownMenuItem>
                ))}
                {notes.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Create a note first.
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className={cn('pt-3', config.density === 'compact' && 'pt-2 pb-3')}>
        {!activeNote ? (
          <div className="text-xs text-muted-foreground py-6 text-center">
            Pick a note from the settings icon to build a widget from its content blocks.
          </div>
        ) : blocks.length === 0 ? (
          <div className="text-xs text-muted-foreground py-6 text-center">
            This note has no content blocks yet.
          </div>
        ) : (
          <BlocksView
            blocks={blocks}
            layout={config.layout}
            fontClass={fontClass}
            density={config.density}
            accent={accent}
            onOpen={openAt}
          />
        )}
      </CardContent>
    </Card>
  );
};

interface ViewProps {
  blocks: Block[];
  layout: NoteBlockLayout;
  fontClass: string;
  density: WidgetDensity;
  accent: typeof ACCENTS[WidgetAccent];
  onOpen: (b: Block) => void;
}

const BlocksView = ({ blocks, layout, fontClass, density, accent, onOpen }: ViewProps) => {
  if (layout === 'grid') {
    return (
      <div className={cn('grid grid-cols-2', density === 'compact' ? 'gap-1.5' : 'gap-2')}>
        {blocks.map((b, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onOpen(b)}
            className={cn(
              'text-left rounded-md border border-border/60 bg-muted/30 min-h-[52px]',
              'hover:bg-muted/60 focus:outline-none focus-visible:ring-2 transition',
              accent.ring, DENSITY_PAD[density], fontClass,
            )}
          >
            <BlockInner block={b} accent={accent} />
          </button>
        ))}
      </div>
    );
  }
  if (layout === 'compact') {
    return (
      <div className={cn('leading-relaxed text-muted-foreground', fontClass)}>
        {blocks.map((b, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onOpen(b)}
            className="mr-2 hover:text-foreground transition-colors text-left"
          >
            {b.kind === 'heading' ? (
              <span className={cn('font-semibold', accent.text)}>{b.text}</span>
            ) : b.kind === 'checklist' ? (
              <span className={cn(b.checked && 'line-through opacity-60')}>
                {b.checked ? '☑' : '☐'} {b.text}
              </span>
            ) : b.kind === 'image' ? (
              '🖼'
            ) : b.kind === 'link' || b.kind === 'webclip' ? (
              <span className={accent.text}>🔗 {b.domain}</span>
            ) : b.kind === 'formula' ? (
              <span className={accent.text}>ƒ {b.value}</span>
            ) : (
              b.text
            )}
            {i < blocks.length - 1 && ' · '}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className={cn(DENSITY_GAP[density])}>
      {blocks.map((b, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onOpen(b)}
          className={cn(
            'w-full text-left rounded-md hover:bg-muted/50 focus:outline-none focus-visible:ring-2 transition',
            accent.ring, DENSITY_PAD[density], fontClass,
          )}
        >
          <BlockInner block={b} accent={accent} />
        </button>
      ))}
    </div>
  );
};

const BlockInner = ({ block, accent }: { block: Block; accent: typeof ACCENTS[WidgetAccent] }) => {
  if (block.kind === 'heading') {
    return <div className={cn('font-semibold', accent.text)}>{block.text}</div>;
  }
  if (block.kind === 'checklist') {
    return (
      <div className={cn('flex items-start gap-2', block.checked && 'opacity-60')}>
        <span className="mt-0.5">{block.checked ? '☑' : '☐'}</span>
        <span className={cn(block.checked && 'line-through')}>{block.text}</span>
      </div>
    );
  }
  if (block.kind === 'image' && block.src) {
    return (
      <img
        src={block.src}
        alt={block.anchorText || ''}
        className="w-full h-16 object-cover rounded"
        loading="lazy"
      />
    );
  }
  if (block.kind === 'link' || block.kind === 'webclip') {
    return (
      <div className={cn('flex items-start gap-2 rounded border', accent.border, accent.bg, 'p-2')}>
        {block.favicon ? (
          <img src={block.favicon} alt="" className="h-4 w-4 mt-0.5 rounded-sm" loading="lazy" />
        ) : (
          <Globe className={cn('h-4 w-4 mt-0.5', accent.text)} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {block.kind === 'webclip' && (
              <span className={cn('text-[10px] uppercase tracking-wide font-semibold', accent.text)}>
                Web clip
              </span>
            )}
            <span className="text-[10px] text-muted-foreground truncate">{block.domain}</span>
          </div>
          <div className="font-medium truncate">{block.text || block.domain}</div>
        </div>
        <Link2 className="h-3.5 w-3.5 text-muted-foreground mt-1 shrink-0" />
      </div>
    );
  }
  if (block.kind === 'formula') {
    return (
      <div className={cn('flex items-center gap-2 rounded border', accent.border, accent.bg, 'p-2')}>
        <Sigma className={cn('h-4 w-4 shrink-0', accent.text)} />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
            {block.expr}
          </div>
          <div className={cn('font-semibold', accent.text)}>{block.value}</div>
        </div>
      </div>
    );
  }
  return <div className="text-muted-foreground">{block.text}</div>;
};
