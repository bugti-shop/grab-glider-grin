// Subscribes to the current user's web_clip_jobs and finalizes each completed
// background capture into the placeholder note that was created at submit time.
// Mount once at app root (see App.tsx).
//
// On `done`  → build the final note body via composeWebClipNote(), persist to
//              IndexedDB via saveNoteToDBSingle, trigger the offline .html
//              download, and toast "Snapshot ready".
// On `failed`→ replace the placeholder body with a red error card + toast.
//
// Idempotent: we tag processed job IDs in-memory + set a `data-clip-job-id`
// marker so a repeated realtime event doesn't re-download the .html.

import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { loadNoteFromDB, saveNoteToDBSingle } from '@/utils/noteStorage';
import { compressHtml } from '@/utils/htmlCompression';
import {
  composeWebClipNote,
  composeFailedWebClipBody,
} from '@/utils/webClipCompose';

type JobRow = {
  id: string;
  user_id: string;
  note_id: string;
  url: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  result: {
    title?: string;
    author?: string;
    siteName?: string;
    leadImage?: string;
    excerpt?: string;
    publishedTime?: string;
    rawHtml?: string;
    finalUrl?: string;
  } | null;
  error_code: string | null;
  error_message: string | null;
};

async function triggerHtmlDownload(filename: string, html: string): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform?.()) {
      const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ]);
      const writeRes = await Filesystem.writeFile({
        path: filename, data: html, directory: Directory.Documents,
        encoding: Encoding.UTF8, recursive: true,
      });
      try {
        await Share.share({ title: filename, text: 'Flowist web clip snapshot', url: writeRes.uri, dialogTitle: 'Save snapshot' });
      } catch { /* dismissed */ }
      return;
    }
  } catch { /* fall through to web path */ }
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function finalizeJob(job: JobRow) {
  const note = await loadNoteFromDB(job.note_id);
  if (!note) {
    console.warn('[useWebClipJobs] note missing for job', job.id);
    return;
  }
  // Idempotency: skip if the note body already contains a finalized web clip
  // (i.e. this job was processed on a previous mount).
  if (note.content && note.content.includes('data-block-type="webClip"') && !note.content.includes('flowist-web-clip-pending')) {
    return;
  }

  if (job.status === 'done' && job.result?.rawHtml) {
    const { rawHtml, title = '', author, siteName, leadImage, excerpt, publishedTime } = job.result;
    const composed = composeWebClipNote({
      rawHtml,
      url: job.url,
      title,
      meta: { author, siteName, leadImage, excerpt, publishedTime },
    });

    const fullPageSnapshot = {
      ...(await compressHtml(composed.snapshotHtml)),
      url: job.url,
      capturedAt: new Date().toISOString(),
    };

    await saveNoteToDBSingle({
      ...note,
      title: (title || note.title || 'Web clip').substring(0, 200),
      content: composed.noteBody,
      fullPageSnapshot,
      updatedAt: new Date(),
    });

    // Only trigger download when the user is currently on the site.
    try { await triggerHtmlDownload(composed.filename, composed.snapshotHtml); } catch { /* ignore */ }

    toast.success('Web clip ready', {
      description: title || job.url,
    });
  } else if (job.status === 'failed') {
    const failedBody = composeFailedWebClipBody(
      job.url,
      job.error_code || 'unknown',
      job.error_message || 'Capture failed after several attempts.',
    );
    await saveNoteToDBSingle({
      ...note,
      content: failedBody,
      updatedAt: new Date(),
    });
    toast.error('Web clip failed', { description: job.error_message || job.url });
  }
}

export function useWebClipJobs() {
  const processedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess?.user?.id;
      if (!uid || cancelled) return;

      // 1) Sweep any completed jobs that finished while the app was closed.
      const { data: pending } = await supabase
        .from('web_clip_jobs')
        .select('id,user_id,note_id,url,status,result,error_code,error_message')
        .eq('user_id', uid)
        .in('status', ['done', 'failed'])
        .order('finished_at', { ascending: false })
        .limit(20);
      for (const row of (pending as JobRow[] | null) || []) {
        if (processedRef.current.has(row.id)) continue;
        processedRef.current.add(row.id);
        try { await finalizeJob(row); } catch (e) {
          console.warn('[useWebClipJobs] sweep finalize failed', e);
        }
      }

      if (cancelled) return;

      // 2) Live subscription for future transitions.
      channel = supabase
        .channel(`web-clip-jobs-${uid}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'web_clip_jobs', filter: `user_id=eq.${uid}` },
          async (payload) => {
            const row = payload.new as JobRow;
            if (row.status !== 'done' && row.status !== 'failed') return;
            if (processedRef.current.has(row.id)) return;
            processedRef.current.add(row.id);
            try { await finalizeJob(row); } catch (e) {
              console.warn('[useWebClipJobs] live finalize failed', e);
            }
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);
}
