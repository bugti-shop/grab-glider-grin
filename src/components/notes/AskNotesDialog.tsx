import { useState, useCallback, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Send, FileText, Loader2 } from 'lucide-react';
import { askNotes, type AskNotesResult } from '@/utils/semanticSearch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AskNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenNote?: (noteId: string) => void;
}

export function AskNotesDialog({ open, onOpenChange, onOpenNote }: AskNotesDialogProps) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<AskNotesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  const run = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await askNotes(q);
      setResult(r);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to ask notes');
    } finally {
      setLoading(false);
    }
  }, [query]);

  // Render answer with citation chips.
  const renderAnswer = (answer: string) => {
    if (!answer) return null;
    const parts = answer.split(/(\[\d+\])/g);
    return parts.map((p, i) => {
      const m = p.match(/^\[(\d+)\]$/);
      if (m) {
        const idx = Number(m[1]);
        const c = result?.citations.find((c) => c.index === idx);
        return (
          <button
            key={i}
            type="button"
            onClick={() => c && onOpenNote?.(c.noteId)}
            className={cn(
              'inline-flex items-center justify-center align-middle mx-0.5 h-5 min-w-[20px] px-1 rounded text-[10px] font-medium',
              'bg-primary/15 text-primary hover:bg-primary/25 transition-colors'
            )}
            title={c?.title}
          >
            {idx}
          </button>
        );
      }
      return <span key={i}>{p}</span>;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Ask your notes
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void run(); } }}
            placeholder='e.g. "What did I decide about pricing?"'
            className="flex-1"
          />
          <Button onClick={() => void run()} disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>

        {loading && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Searching your notes…
          </div>
        )}

        {result && !loading && (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="rounded-lg border bg-card p-4 text-sm leading-relaxed whitespace-pre-wrap">
              {renderAnswer(result.answer)}
            </div>

            {result.citations.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sources</p>
                {result.citations.map((c) => (
                  <button
                    key={c.index}
                    type="button"
                    onClick={() => onOpenNote?.(c.noteId)}
                    className="w-full text-left rounded-md border bg-card hover:bg-accent transition-colors p-3"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded text-[10px] font-medium bg-primary/15 text-primary">
                        {c.index}
                      </span>
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium text-sm truncate">{c.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{c.snippet}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
