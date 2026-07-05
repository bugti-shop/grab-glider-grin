import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LucideIcon, Type, Heading1, Heading2, Heading3, Quote, Lightbulb, ChevronRightSquare,
  Minus, List, ListOrdered, ListChecks, Table, Code, Columns2, Columns3, Sigma, Crown,
  Bold, Italic, Underline, Strikethrough, Highlighter, FileText, Palette, QrCode,
  GitGraph, Grid3x3, Calendar, Clock, CalendarPlus, CalendarMinus, Youtube, Music,
  Twitter, Globe, ListTree, Ruler,
} from 'lucide-react';

export type SlashCommandId =
  // Basic blocks
  | 'text' | 'h1' | 'h2' | 'h3'
  | 'quote' | 'callout' | 'toggle' | 'divider'
  | 'bullet' | 'numbered' | 'todo' | 'table' | 'code'
  | 'columns2' | 'columns3' | 'math'
  // Text format (inline)
  | 'i-bold' | 'i-italic' | 'i-underline' | 'i-strike' | 'i-code' | 'i-highlight'
  // Content generators
  | 'lorem' | 'color' | 'qr'
  // Dates
  | 'today' | 'now' | 'tomorrow' | 'yesterday' | 'tz'
  // Embeds
  | 'youtube' | 'spotify' | 'tweet'
  // Advanced blocks
  | 'mermaid' | 'chess' | 'toc' | 'unit';

type Group = 'Basic blocks' | 'Text format' | 'Content' | 'Dates' | 'Embeds' | 'Advanced';

interface Item {
  id: SlashCommandId;
  label: string;
  hint: string;
  icon: LucideIcon;
  keywords: string[];
  group: Group;
  /** Slash command word to insert (without leading /). If omitted the item runs its own action. */
  slashCmd?: string;
  /** True when the slash command needs an argument (menu leaves caret after "/cmd "). */
  needsArg?: boolean;
  /** When set, free users see a crown and the parent should gate via requireProFeature(proKey). */
  proKey?: string;
}

const ITEMS: Item[] = [
  // Basic blocks
  { id: 'text', label: 'Text', hint: 'Plain paragraph', icon: Type, keywords: ['text', 'paragraph', 'p'], group: 'Basic blocks' },
  { id: 'h1', label: 'Heading 1', hint: 'Large section heading', icon: Heading1, keywords: ['h1', 'heading', 'title'], group: 'Basic blocks' },
  { id: 'h2', label: 'Heading 2', hint: 'Medium heading', icon: Heading2, keywords: ['h2', 'heading'], group: 'Basic blocks' },
  { id: 'h3', label: 'Heading 3', hint: 'Small heading', icon: Heading3, keywords: ['h3', 'heading'], group: 'Basic blocks' },
  { id: 'quote', label: 'Quote', hint: 'Blue-bordered quote block', icon: Quote, keywords: ['quote', 'blockquote'], group: 'Basic blocks' },
  { id: 'callout', label: 'Callout', hint: 'Highlight important info', icon: Lightbulb, keywords: ['callout', 'note', 'info'], group: 'Basic blocks', proKey: 'block_callout' },
  { id: 'toggle', label: 'Toggle', hint: 'Collapsible content', icon: ChevronRightSquare, keywords: ['toggle', 'collapse', 'details'], group: 'Basic blocks', proKey: 'block_toggle' },
  { id: 'divider', label: 'Divider', hint: 'Horizontal line', icon: Minus, keywords: ['divider', 'separator', 'hr', 'rule'], group: 'Basic blocks' },
  { id: 'bullet', label: 'Bulleted list', hint: 'Simple bullets', icon: List, keywords: ['bullet', 'list', 'ul'], group: 'Basic blocks' },
  { id: 'numbered', label: 'Numbered list', hint: '1. 2. 3.', icon: ListOrdered, keywords: ['numbered', 'ordered', 'list', 'ol'], group: 'Basic blocks' },
  { id: 'todo', label: 'To-do list', hint: 'Checkboxes', icon: ListChecks, keywords: ['todo', 'check', 'task'], group: 'Basic blocks' },
  { id: 'table', label: 'Table', hint: 'Rows and columns', icon: Table, keywords: ['table', 'grid'], group: 'Basic blocks' },
  { id: 'code', label: 'Code block', hint: 'Monospaced block', icon: Code, keywords: ['code', 'pre'], group: 'Basic blocks', proKey: 'block_template' },
  { id: 'columns2', label: '2 Columns', hint: 'Two-column layout', icon: Columns2, keywords: ['columns', '2col', 'two', 'layout'], group: 'Basic blocks', proKey: 'block_template' },
  { id: 'columns3', label: '3 Columns', hint: 'Three-column layout', icon: Columns3, keywords: ['columns', '3col', 'three', 'layout'], group: 'Basic blocks', proKey: 'block_template' },
  { id: 'math', label: 'Math equation', hint: 'LaTeX / KaTeX block', icon: Sigma, keywords: ['math', 'equation', 'latex', 'katex', 'formula'], group: 'Basic blocks', proKey: 'block_template' },

  // Text format (inline) — insert /cmd, needs argument
  { id: 'i-bold', label: 'Bold text', hint: '/bold your text', icon: Bold, keywords: ['bold', 'strong'], group: 'Text format', slashCmd: 'bold', needsArg: true },
  { id: 'i-italic', label: 'Italic text', hint: '/italic your text', icon: Italic, keywords: ['italic', 'em'], group: 'Text format', slashCmd: 'italic', needsArg: true },
  { id: 'i-underline', label: 'Underline text', hint: '/underline your text', icon: Underline, keywords: ['underline', 'u'], group: 'Text format', slashCmd: 'underline', needsArg: true },
  { id: 'i-strike', label: 'Strike-through', hint: '/strike your text', icon: Strikethrough, keywords: ['strike', 'strikethrough', 's'], group: 'Text format', slashCmd: 'strike', needsArg: true },
  { id: 'i-code', label: 'Inline code', hint: '/code your text', icon: Code, keywords: ['code', 'inline'], group: 'Text format', slashCmd: 'code', needsArg: true },
  { id: 'i-highlight', label: 'Highlight', hint: '/highlight your text', icon: Highlighter, keywords: ['highlight', 'mark'], group: 'Text format', slashCmd: 'highlight', needsArg: true },

  // Content generators
  { id: 'lorem', label: 'Lorem ipsum', hint: '/lorem 3 → 3 paragraphs', icon: FileText, keywords: ['lorem', 'ipsum', 'placeholder', 'dummy'], group: 'Content', slashCmd: 'lorem', needsArg: true },
  { id: 'color', label: 'Colored text', hint: '/color red your text', icon: Palette, keywords: ['color', 'colour'], group: 'Content', slashCmd: 'color', needsArg: true },
  { id: 'qr', label: 'QR code', hint: '/qr text or URL', icon: QrCode, keywords: ['qr', 'qrcode', 'barcode'], group: 'Content', slashCmd: 'qr', needsArg: true },

  // Dates
  { id: 'today', label: 'Today', hint: "Insert today's date", icon: Calendar, keywords: ['today', 'date'], group: 'Dates', slashCmd: 'today' },
  { id: 'now', label: 'Now', hint: 'Insert current date + time', icon: Clock, keywords: ['now', 'time', 'datetime'], group: 'Dates', slashCmd: 'now' },
  { id: 'tomorrow', label: 'Tomorrow', hint: "Insert tomorrow's date", icon: CalendarPlus, keywords: ['tomorrow', 'date'], group: 'Dates', slashCmd: 'tomorrow' },
  { id: 'yesterday', label: 'Yesterday', hint: "Insert yesterday's date", icon: CalendarMinus, keywords: ['yesterday', 'date'], group: 'Dates', slashCmd: 'yesterday' },
  { id: 'tz', label: 'Timezone clock', hint: '/tz tokyo → local time', icon: Globe, keywords: ['tz', 'timezone', 'time', 'clock', 'city'], group: 'Dates', slashCmd: 'tz', needsArg: true },

  // Embeds
  { id: 'youtube', label: 'YouTube', hint: '/youtube <url>', icon: Youtube, keywords: ['youtube', 'yt', 'video', 'embed'], group: 'Embeds', slashCmd: 'youtube', needsArg: true },
  { id: 'spotify', label: 'Spotify', hint: '/spotify <url>', icon: Music, keywords: ['spotify', 'music', 'audio', 'embed'], group: 'Embeds', slashCmd: 'spotify', needsArg: true },
  { id: 'tweet', label: 'Tweet / X', hint: '/tweet <url>', icon: Twitter, keywords: ['tweet', 'twitter', 'x', 'embed'], group: 'Embeds', slashCmd: 'tweet', needsArg: true },

  // Advanced
  { id: 'mermaid', label: 'Mermaid diagram', hint: '/mermaid graph TD; A-->B', icon: GitGraph, keywords: ['mermaid', 'diagram', 'flowchart', 'graph'], group: 'Advanced', slashCmd: 'mermaid', needsArg: true },
  { id: 'chess', label: 'Chess board', hint: '/chess [FEN]', icon: Grid3x3, keywords: ['chess', 'board', 'fen'], group: 'Advanced', slashCmd: 'chess' },
  { id: 'toc', label: 'Table of contents', hint: 'Auto from headings', icon: ListTree, keywords: ['toc', 'contents', 'outline'], group: 'Advanced', slashCmd: 'toc' },
  { id: 'unit', label: 'Unit converter', hint: '/unit 10 km in miles', icon: Ruler, keywords: ['unit', 'convert', 'conversion'], group: 'Advanced', slashCmd: 'unit', needsArg: true },
];

export const SLASH_PRO_KEYS: Partial<Record<SlashCommandId, string>> = ITEMS.reduce((acc, it) => {
  if (it.proKey) (acc as any)[it.id] = it.proKey;
  return acc;
}, {} as Partial<Record<SlashCommandId, string>>);

export const SLASH_ITEM_META: Record<SlashCommandId, { slashCmd?: string; needsArg?: boolean }> = ITEMS.reduce((acc, it) => {
  (acc as any)[it.id] = { slashCmd: it.slashCmd, needsArg: it.needsArg };
  return acc;
}, {} as Record<SlashCommandId, { slashCmd?: string; needsArg?: boolean }>);

interface SlashCommandMenuProps {
  open: boolean;
  position: { top: number; left: number };
  query: string;
  activeIndex: number;
  onActiveIndexChange: (i: number) => void;
  onSelect: (id: SlashCommandId) => void;
  onClose: () => void;
  isPro?: boolean;
}

export const SlashCommandMenu = ({
  open, position, query, activeIndex, onActiveIndexChange, onSelect, onClose, isPro,
}: SlashCommandMenuProps) => {
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ITEMS;
    return ITEMS.filter(i =>
      i.label.toLowerCase().includes(q) || i.keywords.some(k => k.includes(q))
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  // Clamp menu into the visual viewport so it never gets clipped off-screen
  // when triggered near the right edge or bottom of the editor. Falls back to
  // opening above the caret when there's not enough room below.
  const [adjusted, setAdjusted] = useState<{ top: number; left: number }>({
    top: position.top,
    left: position.left,
  });

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const el = ref.current;
    const rect = el.getBoundingClientRect();
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const margin = 8;

    let left = position.left;
    let top = position.top;

    // Horizontal clamp — keep the full menu width visible
    if (left + rect.width + margin > vw) left = Math.max(margin, vw - rect.width - margin);
    if (left < margin) left = margin;

    // Vertical clamp — if it overflows below, flip above the caret line
    if (top + rect.height + margin > vh) {
      // caret line is ~4px above `position.top`; flip so bottom sits above it
      const flipped = position.top - 4 - rect.height;
      top = flipped >= margin ? flipped : Math.max(margin, vh - rect.height - margin);
    }

    setAdjusted({ top, left });
  }, [open, position.top, position.left, filtered.length]);

  if (!open || !filtered.length) return null;

  const activeIdx = Math.min(activeIndex, filtered.length - 1);
  let lastGroup: Group | null = null;

  return (
    <div
      ref={ref}
      className="fixed z-[60] w-72 max-h-[min(20rem,70vh)] overflow-y-auto rounded-lg border border-border bg-popover shadow-xl"
      style={{ top: adjusted.top, left: adjusted.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {filtered.map((item, i) => {
        const Icon = item.icon;
        const active = i === activeIdx;
        const showHeader = item.group !== lastGroup;
        lastGroup = item.group;
        return (
          <div key={item.id}>
            {showHeader && (
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border bg-muted/30">
                {item.group}
              </div>
            )}
            <button
              type="button"
              onMouseEnter={() => onActiveIndexChange(i)}
              onClick={() => onSelect(item.id)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2 transition-colors ${
                active ? 'bg-accent' : 'hover:bg-accent/60'
              }`}
            >
              <div className="w-7 h-7 rounded-md border border-border flex items-center justify-center bg-background shrink-0">
                <Icon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground flex items-center gap-1">
                  {item.label}
                  {item.proKey && !isPro && (
                    <Crown size={11} fill="#FFD700" color="#FFD700" />
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">{item.hint}</div>
              </div>
            </button>
          </div>
        );
      })}
      <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border bg-muted/40 flex items-center gap-1.5 sticky bottom-0">
        Tip: <kbd className="px-1 py-0.5 rounded border border-border bg-background font-mono text-[9px]">Space</kbd>
        or <kbd className="px-1 py-0.5 rounded border border-border bg-background font-mono text-[9px]">Enter</kbd>
        runs the command
      </div>
    </div>
  );
};

export const SLASH_ITEMS_COUNT_FOR_QUERY = (query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return ITEMS.length;
  return ITEMS.filter(i =>
    i.label.toLowerCase().includes(q) || i.keywords.some(k => k.includes(q))
  ).length;
};
