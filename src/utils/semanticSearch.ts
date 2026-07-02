// Client helpers for the note semantic-search edge functions.
import { supabase } from '@/integrations/supabase/client';

export interface SemanticSearchHit {
  note_id: string;
  chunk_index: number;
  title: string | null;
  content: string;
  similarity: number;
}

export interface AskNotesCitation {
  index: number;
  noteId: string;
  title: string;
  snippet: string;
  similarity: number;
}

export interface AskNotesResult {
  answer: string;
  citations: AskNotesCitation[];
}

/** Queue an embed request for a note. Debounced per-note. */
const embedTimers = new Map<string, number>();
export function scheduleEmbedNote(note: { id: string; title?: string; content?: string }, delay = 1500): void {
  const existing = embedTimers.get(note.id);
  if (existing) window.clearTimeout(existing);
  const handle = window.setTimeout(() => {
    embedTimers.delete(note.id);
    void embedNote(note);
  }, delay);
  embedTimers.set(note.id, handle);
}

export async function embedNote(note: { id: string; title?: string; content?: string }): Promise<void> {
  try {
    // Skip when the user isn't signed in — embed-note requires auth.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase.functions.invoke('embed-note', {
      body: { noteId: note.id, title: note.title || '', content: note.content || '' },
    });
    if (error) console.warn('[semanticSearch] embed-note failed', error.message);
  } catch (e) {
    console.warn('[semanticSearch] embed-note threw', e);
  }
}


export async function semanticSearchNotes(query: string, limit = 12): Promise<SemanticSearchHit[]> {
  const { data, error } = await supabase.functions.invoke('search-notes', {
    body: { query, limit },
  });
  if (error) throw new Error(error.message);
  return (data?.results ?? []) as SemanticSearchHit[];
}

export async function askNotes(query: string): Promise<AskNotesResult> {
  const { data, error } = await supabase.functions.invoke('ask-notes', {
    body: { query },
  });
  if (error) throw new Error(error.message);
  return {
    answer: data?.answer ?? '',
    citations: (data?.citations ?? []) as AskNotesCitation[],
  };
}
