import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Globe, Copy, ExternalLink, Loader2, Trash2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Note } from '@/types/note';
import {
  getPublishedForNote,
  publicUrlForSlug,
  publishNote,
  slugify,
  unpublishNote,
  type PublishedNoteRecord,
} from '@/utils/publishNote';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: Note | null;
}

export default function PublishNoteSheet({ open, onOpenChange, note }: Props) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState<PublishedNoteRecord | null>(null);
  const [slug, setSlug] = useState('');

  useEffect(() => {
    if (!open || !note) return;
    setLoading(true);
    getPublishedForNote(note.id)
      .then((rec) => {
        setRecord(rec);
        setSlug(rec?.slug ?? slugify(note.title || `note-${note.id.slice(0, 6)}`));
      })
      .catch((e) => {
        console.warn('[Publish] load failed', e);
        toast.error('Could not load publish status');
      })
      .finally(() => setLoading(false));
  }, [open, note]);

  const handlePublish = async () => {
    if (!note) return;
    const cleaned = slugify(slug);
    if (!cleaned) {
      toast.error('Enter a valid URL slug');
      return;
    }
    setBusy(true);
    try {
      const rec = await publishNote(note, cleaned);
      setRecord(rec);
      setSlug(rec.slug);
      toast.success(record ? 'Public page updated' : 'Note published to the web');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to publish note');
    } finally {
      setBusy(false);
    }
  };

  const handleUnpublish = async () => {
    if (!note) return;
    setBusy(true);
    try {
      await unpublishNote(note.id);
      setRecord(null);
      toast.success('Note is no longer public');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to unpublish');
    } finally {
      setBusy(false);
    }
  };

  const url = record ? publicUrlForSlug(record.slug) : publicUrlForSlug(slugify(slug || 'note'));

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleShare = async () => {
    if (!navigator.share) {
      handleCopy();
      return;
    }
    try {
      await navigator.share({ title: note?.title || 'Flowist note', url });
    } catch {
      /* user cancelled */
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Publish to the web
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-4 space-y-5 pb-6">
            <p className="text-sm text-muted-foreground">
              Turn this note into a shareable public page. Anyone with the link can view it — you
              stay in control and can unpublish anytime.
            </p>

            <div className="space-y-2">
              <Label htmlFor="publish-slug" className="text-xs uppercase tracking-wide">
                Custom URL
              </Label>
              <div className="flex items-center gap-1 rounded-lg border bg-muted/40 px-3 py-2">
                <span className="text-xs text-muted-foreground truncate">
                  {typeof window !== 'undefined' ? window.location.host : 'flowist.me'}/p/
                </span>
                <Input
                  id="publish-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="border-0 bg-transparent px-0 h-7 focus-visible:ring-0"
                  placeholder="my-note"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Lowercase letters, numbers, and dashes only.
              </p>
            </div>

            {record && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-primary uppercase tracking-wide">
                    Live
                  </span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="text-sm break-all font-mono text-foreground/80">{url}</div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="secondary" className="flex-1" onClick={handleCopy}>
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Copy link
                  </Button>
                  <Button size="sm" variant="secondary" className="flex-1" onClick={handleShare}>
                    <Share2 className="h-3.5 w-3.5 mr-1.5" />
                    Share
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={handlePublish} disabled={busy} className="w-full">
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : record ? (
                  'Update published note'
                ) : (
                  'Publish note'
                )}
              </Button>
              {record && (
                <Button
                  variant="ghost"
                  onClick={handleUnpublish}
                  disabled={busy}
                  className="w-full text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Unpublish
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
