// Chunks a note and embeds each chunk with the Lovable AI Gateway,
// then upserts them into public.note_embeddings for semantic search.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_CHUNK_CHARS = 1200;
const CHUNK_OVERLAP = 150;
const EMBED_MODEL = 'openai/text-embedding-3-small';

function stripHtml(html: string): string {
  return (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function chunkText(text: string): string[] {
  if (!text) return [];
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + MAX_CHUNK_CHARS, text.length);
    chunks.push(text.slice(i, end));
    if (end >= text.length) break;
    i = end - CHUNK_OVERLAP;
  }
  return chunks;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'missing_ai_key' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const noteId: string | undefined = body.noteId;
    const title: string = (body.title ?? '').toString().slice(0, 500);
    const rawContent: string = (body.content ?? '').toString();
    if (!noteId) {
      return new Response(JSON.stringify({ error: 'missing_noteId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const plain = stripHtml(rawContent);
    const fullText = [title, plain].filter(Boolean).join('\n\n').trim();

    // Empty note → clear existing embeddings
    if (!fullText) {
      await admin.from('note_embeddings').delete().eq('note_id', noteId).eq('user_id', userId);
      return new Response(JSON.stringify({ ok: true, chunks: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const chunks = chunkText(fullText);

    // Batch embed
    const embedResp = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: chunks }),
    });
    if (!embedResp.ok) {
      const errText = await embedResp.text();
      return new Response(JSON.stringify({ error: 'embed_failed', detail: errText }), {
        status: embedResp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const embedData = await embedResp.json();
    const vectors: number[][] = (embedData.data ?? []).map((d: any) => d.embedding);

    // Replace existing embeddings for this note
    await admin.from('note_embeddings').delete().eq('note_id', noteId).eq('user_id', userId);

    const rows = chunks.map((content, idx) => ({
      note_id: noteId,
      user_id: userId,
      chunk_index: idx,
      title,
      content,
      embedding: vectors[idx] as any,
      model: EMBED_MODEL,
      updated_at: new Date().toISOString(),
    }));
    const { error: insertErr } = await admin.from('note_embeddings').insert(rows);
    if (insertErr) {
      return new Response(JSON.stringify({ error: 'insert_failed', detail: insertErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, chunks: chunks.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'unexpected', detail: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
