import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { FileText, LayoutList, LayoutGrid, Rows3, Settings2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadNotesFromDB } from '@/utils/noteStorage';
import { getSetting, setSetting } from '@/utils/settingsStorage';
import type { Note } from '@/types/note';

export type NoteBlockLayout = 'list' | 'grid' | 'compact';

interface NoteBlocksConfig {
  noteId: string | null;
  layout: NoteBlockLayout;
  maxBlocks: number;
}

interface Block {
  kind: 'heading' | 'checklist' | 'paragraph' | 'image';
  text: string;
  checked?: boolean;
  src?: string;
}

const SETTINGS_KEY = 'home_note_blocks_widget';
const DEFAULT_CONFIG: NoteBlocksConfig = { noteId: null, layout: 'list', maxBlocks: 8 };

/** Parses a note's HTML content into a compact list of display blocks. */
function extractBlocks(html: string, limit: number): Block[] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: Block[] = [];
  const walker = doc.body.querySelectorAll(
    'h1, h2, h3, h4, li.checklist-item, li, p, img',
  );
  for (const el of Array.from(walker)) {
    if (out.length >= limit) break;
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').trim();
    if (tag === 'img') {
      const src = (el as HTMLImageElement).getAttribute('src') || '';
      if (src) out.push({ kind: 'image', text: '', src });
      continue;
    }
    if (!text) continue;
    if (tag.startsWith('h')) {
      out.push({ kind: 'heading', text });
    } else if (el.classList?.contains('checklist-item')) {
      const checked = el.getAttribute('checked') === 'true' ||
        el.querySelector('input[type="checkbox"]')?.hasAttribute('checked') ||
        false;
      out.push({ kind: 'checklist', text, checked: !!checked });
    } else {
      out.push({ kind: 'paragraph', text: text.length > 140 ? text.slice(0, 140) + '…' : text });
    }
  }
  return out;
}

export const NoteBlocksWidget = () => {
  const [config, setConfig] = useState<NoteBlocksConfig>(DEFAULT_CONFIG);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [cfg, allNotes] = await Promise.all([
        getSetting<NoteBlocksConfig>(SETTINGS_KEY, DEFAULT_CONFIG),
        loadNotesFromDB(),
      ]);
      setConfig({ ...DEFAULT_CONFIG, ...cfg });
      setNotes(allNotes);
      setLoading(false);
    })();
  }, []);

  const persist = async (next: NoteBlocksConfig) => {
    setConfig(next);
    await setSetting(SETTINGS_KEY, next);
  };

  const activeNote = useMemo(
    () => notes.find((n) => n.id === config.noteId) ?? null,
    [notes, config.noteId],
  );

  const blocks = useMemo(
    () => (activeNote ? extractBlocks(activeNote.content || '', config.maxBlocks) : []),
    [activeNote, config.maxBlocks],
  );

  if (loading) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {activeNote ? activeNote.title || 'Untitled note' : 'Note widget'}
          </span>
          <div className="flex items-center gap-1">
            {activeNote && (
              <Link
                to={`/note/${activeNote.id}`}
                className="text-muted-foreground hover:text-foreground p-1"
                title="Open note"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7">
                  <Settings2 className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 max-h-80 overflow-auto">
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
      <CardContent className="pt-0">
        {!activeNote ? (
          <div className="text-xs text-muted-foreground py-6 text-center">
            Pick a note from the settings icon to build a widget from its content blocks.
          </div>
        ) : blocks.length === 0 ? (
          <div className="text-xs text-muted-foreground py-6 text-center">
            This note has no content blocks yet.
          </div>
        ) : (
          <BlocksView blocks={blocks} layout={config.layout} />
        )}
      </CardContent>
    </Card>
  );
};

const BlocksView = ({ blocks, layout }: { blocks: Block[]; layout: NoteBlockLayout }) => {
  if (layout === 'grid') {
    return (
      <div className="grid grid-cols-2 gap-2">
        {blocks.map((b, i) => (
          <div
            key={i}
            className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs min-h-[52px]"
          >
            <BlockInner block={b} />
          </div>
        ))}
      </div>
    );
  }
  if (layout === 'compact') {
    return (
      <div className="text-xs text-muted-foreground leading-relaxed">
        {blocks.map((b, i) => (
          <span key={i} className="mr-2">
            {b.kind === 'heading' ? (
              <span className="font-semibold text-foreground">{b.text}</span>
            ) : b.kind === 'checklist' ? (
              <span className={cn(b.checked && 'line-through opacity-60')}>
                {b.checked ? '☑' : '☐'} {b.text}
              </span>
            ) : b.kind === 'image' ? (
              '🖼'
            ) : (
              b.text
            )}
            {i < blocks.length - 1 && ' · '}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {blocks.map((b, i) => (
        <div key={i} className="text-sm">
          <BlockInner block={b} />
        </div>
      ))}
    </div>
  );
};

const BlockInner = ({ block }: { block: Block }) => {
  if (block.kind === 'heading') {
    return <div className="font-semibold text-foreground text-sm">{block.text}</div>;
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
        alt=""
        className="w-full h-16 object-cover rounded"
        loading="lazy"
      />
    );
  }
  return <div className="text-muted-foreground">{block.text}</div>;
};
