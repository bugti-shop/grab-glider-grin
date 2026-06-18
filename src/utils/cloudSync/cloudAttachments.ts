/**
 * Cloud attachment helper.
 *
 * Uploads an attachment Blob/File to Supabase Storage (`user-attachments`
 * bucket, scoped to `{user_id}/{parent_type}/{id}-{filename}`), writes a row
 * to `file_attachments`, and asks the `generate-thumbnail` edge function to
 * produce a 256px thumbnail. Downloads are lazy — callers fetch the blob on
 * demand via `getAttachmentBlob`, and realtime INSERT events trigger
 * `onAttachmentEvent` so subscribers can opportunistically prefetch.
 *
 * Soft-delete only here; the daily `cleanup-attachments` edge function
 * removes the storage object + row 24h after `is_deleted=true`.
 */
import { supabase } from '@/integrations/supabase/client';
import { enqueueWrite } from './writeQueue';

const BUCKET = 'user-attachments';

export interface AttachmentMeta {
  id: string;
  user_id: string;
  parent_type: string;
  parent_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  thumbnail_path: string | null;
}

const blobCache = new Map<string, Promise<Blob | null>>();

export async function uploadAttachment(opts: {
  file: Blob; fileName: string; parentType: string; parentId: string; mimeType?: string;
}): Promise<AttachmentMeta | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const userId = session.user.id;
  const id = crypto.randomUUID();
  const safe = opts.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${userId}/${opts.parentType}/${id}-${safe}`;
  const mime = opts.mimeType ?? (opts.file as any).type ?? 'application/octet-stream';
  const size = (opts.file as any).size ?? null;

  try {
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, opts.file, {
      contentType: mime, upsert: false,
    });
    if (error) throw error;
  } catch (err) {
    console.warn('[attachments] upload failed', err);
    return null;
  }

  const row = {
    id, user_id: userId,
    parent_type: opts.parentType,
    parent_id: opts.parentId,
    storage_path: storagePath,
    file_name: opts.fileName,
    mime_type: mime,
    size_bytes: size,
    thumbnail_path: null,
    is_deleted: false,
    updated_at: new Date().toISOString(),
  };
  enqueueWrite('file_attachments', 'upsert', row as any);

  // Fire-and-forget thumbnail generation. The edge function is idempotent.
  supabase.functions.invoke('generate-thumbnail', { body: { attachment_id: id } }).catch(() => {});

  return row;
}

export function softDeleteAttachment(id: string): void {
  enqueueWrite('file_attachments', 'delete', { id });
  blobCache.delete(id);
}

export async function getAttachmentBlob(meta: Pick<AttachmentMeta, 'id' | 'storage_path'>): Promise<Blob | null> {
  const cached = blobCache.get(meta.id);
  if (cached) return cached;
  const p = (async () => {
    const { data, error } = await supabase.storage.from(BUCKET).download(meta.storage_path);
    if (error) { console.warn('[attachments] download failed', error); return null; }
    return data;
  })();
  blobCache.set(meta.id, p);
  return p;
}

export async function getAttachmentSignedUrl(storagePath: string, ttlSeconds = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, ttlSeconds);
  if (error) return null;
  return data.signedUrl;
}

/**
 * Called by the store bridge when a `file_attachments` realtime event arrives.
 * Soft-deleted rows are evicted from the local blob cache. New/updated rows
 * are surfaced via a window event so any UI listening for attachments under a
 * specific parent can opportunistically refresh.
 */
export function onAttachmentEvent(row: AttachmentMeta & { is_deleted?: boolean }): void {
  if (row.is_deleted) {
    blobCache.delete(row.id);
  }
  try {
    window.dispatchEvent(new CustomEvent('flowist:attachment:change', { detail: row }));
  } catch {}
}
