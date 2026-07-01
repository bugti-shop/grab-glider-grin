import { supabase } from '@/integrations/supabase/client';
import type { Note } from '@/types/note';

export interface PublishedNoteRecord {
  id: string;
  note_id: string;
  slug: string;
  title: string;
  published_at: string;
  updated_at: string;
}

/** URL-safe slug: lowercase, dashes, alphanumerics only. Trims to 60 chars. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

/** Builds a public URL from a slug — always uses window.location.origin. */
export function publicUrlForSlug(slug: string): string {
  const base =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://flowist.me';
  return `${base}/p/${slug}`;
}

export async function getPublishedForNote(
  noteId: string,
): Promise<PublishedNoteRecord | null> {
  const { data, error } = await supabase
    .from('public_notes')
    .select('id, note_id, slug, title, published_at, updated_at')
    .eq('note_id', noteId)
    .maybeSingle();
  if (error) throw error;
  return (data as PublishedNoteRecord) ?? null;
}

/** Ensures the slug is unique. Appends `-2`, `-3`, ... on collision. */
async function ensureUniqueSlug(
  desired: string,
  ignoreNoteId?: string,
): Promise<string> {
  let candidate = desired || 'note';
  let n = 1;
  // Cap iterations defensively
  while (n < 50) {
    const trial = n === 1 ? candidate : `${candidate}-${n}`;
    const { data, error } = await supabase
      .from('public_notes')
      .select('note_id')
      .eq('slug', trial)
      .maybeSingle();
    if (error) throw error;
    if (!data || (ignoreNoteId && data.note_id === ignoreNoteId)) return trial;
    n++;
  }
  return `${candidate}-${Date.now().toString(36)}`;
}

export async function publishNote(
  note: Note,
  desiredSlug?: string,
): Promise<PublishedNoteRecord> {
  const { data: session } = await supabase.auth.getUser();
  const user = session?.user;
  if (!user) throw new Error('You need to be signed in to publish a note.');

  const baseSlug = slugify(desiredSlug || note.title || `note-${note.id.slice(0, 6)}`);
  const existing = await getPublishedForNote(note.id);
  const slug =
    existing && (!desiredSlug || existing.slug === slugify(desiredSlug))
      ? existing.slug
      : await ensureUniqueSlug(baseSlug, note.id);

  const payload = {
    note_id: note.id,
    user_id: user.id,
    slug,
    title: note.title || 'Untitled',
    content: note.content || '',
    cover_image: note.images?.[0] ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('public_notes')
    .upsert(payload, { onConflict: 'user_id,note_id' })
    .select('id, note_id, slug, title, published_at, updated_at')
    .single();

  if (error) throw error;
  return data as PublishedNoteRecord;
}

export async function unpublishNote(noteId: string): Promise<void> {
  const { error } = await supabase.from('public_notes').delete().eq('note_id', noteId);
  if (error) throw error;
}
