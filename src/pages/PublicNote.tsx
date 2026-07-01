import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeForDisplay } from '@/lib/sanitize';
import { format } from 'date-fns';
import { Loader2, ArrowLeft, ExternalLink, Eye, Lock, Smartphone } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

interface PublicNoteRow {
  id: string;
  slug: string;
  title: string;
  content: string;
  cover_image: string | null;
  published_at: string;
  updated_at: string;
  view_count: number;
  last_viewed_at: string | null;
}


export default function PublicNote() {
  const { slug } = useParams<{ slug: string }>();
  const [note, setNote] = useState<PublicNoteRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const isNative = Capacitor.isNativePlatform();
  const isMobileBrowser =
    !isNative &&
    typeof navigator !== 'undefined' &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Try to hand off to the installed Flowist app on mobile web via the
  // custom scheme. Universal / App Links usually intercept the https URL
  // before we even render, but this covers browsers (in-app WebViews,
  // Firefox etc.) where the OS lets the page load first.
  useEffect(() => {
    if (!slug || isNative || !isMobileBrowser) return;
    const already = sessionStorage.getItem(`p:handoff:${slug}`);
    if (already) return;
    sessionStorage.setItem(`p:handoff:${slug}`, '1');
    window.location.href = `flowist://p/${slug}`;
  }, [slug, isNative, isMobileBrowser]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('public_notes')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setNote(data as PublicNoteRow);
      setLoading(false);
      // Fire-and-forget view analytics — bumps view_count + last_viewed_at
      // via SECURITY DEFINER RPC so anonymous visitors count too.
      supabase.rpc('record_public_note_view', { p_slug: slug }).then(({ data: v }) => {
        const row = Array.isArray(v) ? v[0] : v;
        if (!cancelled && row) {
          setNote((prev) =>
            prev
              ? { ...prev, view_count: row.view_count ?? prev.view_count, last_viewed_at: row.last_viewed_at ?? prev.last_viewed_at }
              : prev,
          );
        }
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (note?.title) {
      document.title = `${note.title} · Flowist`;
    }
  }, [note?.title]);


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !note) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <h1 className="text-2xl font-semibold mb-2">Note not found</h1>
        <p className="text-muted-foreground mb-6">
          This published note may have been unpublished or the link is incorrect.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Flowist
        </Link>
      </div>
    );
  }

  const safeHtml = sanitizeForDisplay(note.content || '');

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="h-6 w-6 rounded-md bg-primary/15 text-primary flex items-center justify-center text-[11px]">
              F
            </span>
            Flowist
          </Link>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Made with Flowist <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </header>

      {isMobileBrowser && !isNative && (
        <a
          href={`flowist://p/${slug}`}
          className="block bg-primary/10 border-b border-primary/20 px-5 py-2.5 text-xs text-primary flex items-center justify-center gap-2 hover:bg-primary/15"
        >
          <Smartphone className="h-3.5 w-3.5" />
          Open in Flowist app for a better experience
        </a>
      )}

      <article className="max-w-3xl mx-auto px-5 py-10">
        {note.cover_image && (
          <img
            src={note.cover_image}
            alt=""
            className="w-full max-h-[360px] object-cover rounded-xl mb-8 border border-border/50"
          />
        )}
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
          {note.title || 'Untitled'}
        </h1>
        <div className="text-xs text-muted-foreground mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Published {format(new Date(note.published_at), 'MMM d, yyyy')}</span>
          {note.updated_at !== note.published_at && (
            <span>· Updated {format(new Date(note.updated_at), 'MMM d, yyyy')}</span>
          )}
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {note.view_count ?? 0} {note.view_count === 1 ? 'view' : 'views'}
          </span>
        </div>
        <div className="mb-8 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/60 rounded-full px-2.5 py-1">
          <Lock className="h-3 w-3" />
          Read-only public copy
        </div>
        <div
          className="prose prose-neutral dark:prose-invert max-w-none rich-text-editor pointer-events-none select-text"
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
      </article>


      <footer className="border-t border-border/60 mt-16">
        <div className="max-w-3xl mx-auto px-5 py-6 text-xs text-muted-foreground flex items-center justify-between">
          <span>© {new Date().getFullYear()} Flowist</span>
          <a href="/" className="hover:text-foreground">flowist.me</a>
        </div>
      </footer>
    </div>
  );
}
