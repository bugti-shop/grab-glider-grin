import { useEffect, useMemo, useRef } from 'react';
import { LucideIcon, Type, Heading1, Heading2, Heading3, Quote, Lightbulb, ChevronRightSquare,
  Minus, List, ListOrdered, ListChecks, Table, Code, Columns2, Columns3, Sigma, Crown,
} from 'lucide-react';

export type SlashCommandId =
  | 'text' | 'h1' | 'h2' | 'h3'
  | 'quote' | 'callout' | 'toggle' | 'divider'
  | 'bullet' | 'numbered' | 'todo' | 'table' | 'code'
  | 'columns2' | 'columns3' | 'math';

interface Item {
  id: SlashCommandId;
  label: string;
  hint: string;
  icon: LucideIcon;
  keywords: string[];
  /** When set, free users see a crown and the parent should gate via requireProFeature(proKey). */
  proKey?: string;
}

const ITEMS: Item[] = [
  { id: 'text', label: 'Text', hint: 'Plain paragraph', icon: Type, keywords: ['text', 'paragraph', 'p'] },
  { id: 'h1', label: 'Heading 1', hint: 'Large section heading', icon: Heading1, keywords: ['h1', 'heading', 'title'] },
  { id: 'h2', label: 'Heading 2', hint: 'Medium heading', icon: Heading2, keywords: ['h2', 'heading'] },
  { id: 'h3', label: 'Heading 3', hint: 'Small heading', icon: Heading3, keywords: ['h3', 'heading'] },
  { id: 'quote', label: 'Quote', hint: 'Blue-bordered quote block', icon: Quote, keywords: ['quote', 'blockquote'] },
  { id: 'callout', label: 'Callout', hint: 'Highlight important info', icon: Lightbulb, keywords: ['callout', 'note', 'info'], proKey: 'block_callout' },
  { id: 'toggle', label: 'Toggle', hint: 'Collapsible content', icon: ChevronRightSquare, keywords: ['toggle', 'collapse', 'details'], proKey: 'block_toggle' },
  { id: 'divider', label: 'Divider', hint: 'Horizontal line', icon: Minus, keywords: ['divider', 'separator', 'hr', 'rule'] },
  { id: 'bullet', label: 'Bulleted list', hint: 'Simple bullets', icon: List, keywords: ['bullet', 'list', 'ul'] },
  { id: 'numbered', label: 'Numbered list', hint: '1. 2. 3.', icon: ListOrdered, keywords: ['numbered', 'ordered', 'list', 'ol'] },
  { id: 'todo', label: 'To-do list', hint: 'Checkboxes', icon: ListChecks, keywords: ['todo', 'check', 'task'] },
  { id: 'table', label: 'Table', hint: 'Rows and columns', icon: Table, keywords: ['table', 'grid'] },
  { id: 'code', label: 'Code block', hint: 'Monospaced block', icon: Code, keywords: ['code', 'pre'], proKey: 'block_template' },
  { id: 'columns2', label: '2 Columns', hint: 'Two-column layout', icon: Columns2, keywords: ['columns', '2col', 'two', 'layout'], proKey: 'block_template' },
  { id: 'columns3', label: '3 Columns', hint: 'Three-column layout', icon: Columns3, keywords: ['columns', '3col', 'three', 'layout'], proKey: 'block_template' },
  { id: 'math', label: 'Math equation', hint: 'LaTeX / KaTeX block', icon: Sigma, keywords: ['math', 'equation', 'latex', 'katex', 'formula'], proKey: 'block_template' },
];

export const SLASH_PRO_KEYS: Partial<Record<SlashCommandId, string>> = ITEMS.reduce((acc, it) => {
  if (it.proKey) (acc as any)[it.id] = it.proKey;
  return acc;
}, {} as Partial<Record<SlashCommandId, string>>);

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

  if (!open || !filtered.length) return null;

  return (
    <div
      ref={ref}
      className="fixed z-[60] w-64 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover shadow-xl"
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
        Basic blocks
      </div>
      {filtered.map((item, i) => {
        const Icon = item.icon;
        const active = i === Math.min(activeIndex, filtered.length - 1);
        return (
          <button
            key={item.id}
            type="button"
            onMouseEnter={() => onActiveIndexChange(i)}
            onClick={() => onSelect(item.id)}
            className={`w-full text-left flex items-center gap-3 px-3 py-2 transition-colors ${
              active ? 'bg-accent' : 'hover:bg-accent/60'
            }`}
          >
            <div className="w-7 h-7 rounded-md border border-border flex items-center justify-center bg-background">
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
        );
      })}
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
