import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, List } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TocItem {
  level: number;
  text: string;
  index: number; // nth heading (0-based) among all headings
}

interface TableOfContentsProps {
  /** Live HTML string from the editor. */
  content: string;
  /** Ref to the contenteditable div — used to scroll to the actual heading. */
  editorRef: React.RefObject<HTMLDivElement>;
  className?: string;
  /** Deepest heading level to include (1–6). Defaults to 6 (all). */
  maxLevel?: number;
}

/**
 * Auto-generated live TOC for a rich-text note.
 * Re-parses `content` on every change, so headings stay in sync.
 * Clicking an item scrolls to the matching heading in the live editor DOM.
 */
export const TableOfContents = ({ content, editorRef, className, maxLevel = 6 }: TableOfContentsProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const cap = Math.min(6, Math.max(1, maxLevel));

  const items = useMemo<TocItem[]>(() => {
    if (!content) return [];
    try {
      const doc = new DOMParser().parseFromString(`<div>${content}</div>`, 'text/html');
      const selector = Array.from({ length: cap }, (_, i) => `h${i + 1}`).join(', ');
      const nodes = doc.querySelectorAll(selector);
      // Also index all headings so scroll target matches editor DOM order regardless of filter.
      const allNodes = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const indexMap = new Map<Element, number>();
      allNodes.forEach((n, i) => indexMap.set(n, i));
      const out: TocItem[] = [];
      nodes.forEach((n) => {
        const text = (n.textContent || '').trim();
        if (!text) return;
        out.push({ level: Number(n.tagName.substring(1)), text, index: indexMap.get(n) ?? 0 });
      });
      return out;
    } catch {
      return [];
    }
  }, [content, cap]);

  // Auto-hide entirely if there are no headings
  if (items.length === 0) {
    return (
      <div className={cn(
        'mx-4 mt-3 mb-2 rounded-lg border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground',
        className,
      )}>
        <List className="inline h-3.5 w-3.5 mr-1.5 align-[-2px]" />
        Add headings (H1–H6) to build your table of contents automatically.
      </div>
    );
  }

  const scrollTo = (idx: number) => {
    const root = editorRef.current;
    if (!root) return;
    const all = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const target = all[idx] as HTMLElement | undefined;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Brief highlight for feedback
      const prev = target.style.backgroundColor;
      target.style.transition = 'background-color 0.6s ease';
      target.style.backgroundColor = 'hsl(var(--primary) / 0.18)';
      window.setTimeout(() => { target.style.backgroundColor = prev; }, 900);
    }
  };

  return (
    <div className={cn(
      'mx-4 mt-3 mb-2 rounded-lg border border-border/60 bg-muted/40',
      className,
    )}>
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground/80 hover:text-foreground"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        <List className="h-3.5 w-3.5" />
        <span>Table of Contents</span>
        <span className="ml-auto text-[10px] font-normal text-muted-foreground">
          {items.length} {items.length === 1 ? 'section' : 'sections'}
        </span>
      </button>
      {!collapsed && (
        <ul className="max-h-56 overflow-y-auto px-2 pb-2">
          {items.map((it, i) => (
            <li key={`${it.index}-${i}`}>
              <button
                type="button"
                onClick={() => scrollTo(it.index)}
                className="block w-full truncate rounded px-2 py-1 text-left text-xs text-foreground/80 hover:bg-accent hover:text-foreground"
                style={{ paddingLeft: `${(it.level - 1) * 12 + 8}px` }}
                title={it.text}
              >
                {it.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
