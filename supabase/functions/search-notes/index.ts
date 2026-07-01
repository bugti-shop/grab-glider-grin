// Semantic search over the caller's notes. Returns ranked matches.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const EMBED_MODEL = 'openai/text-embedding-3-small';

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
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'missing_ai_key' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const query: string = (body.query ?? '').toString().trim();
    const limit: number = Math.min(20, Math.max(1, Number(body.limit) || 8));
    if (!query) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Embed the query
    const er = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({ model: EMBED_MODEL, input: query }),
    });
    if (!er.ok) {
      const t = await er.text();
      return new Response(JSON.stringify({ error: 'embed_failed', detail: t }), {
        status: er.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const ed = await er.json();
    const qvec: number[] = ed.data?.[0]?.embedding ?? [];

    // Call the RPC as the user so RLS applies
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data, error } = await userClient.rpc('match_note_chunks', {
      query_embedding: qvec as any,
      match_count: limit,
      min_similarity: 0.25,
    });
    if (error) {
      return new Response(JSON.stringify({ error: 'search_failed', detail: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Collapse to best hit per note
    const byNote = new Map<string, any>();
    for (const row of (data ?? []) as any[]) {
      const cur = byNote.get(row.note_id);
      if (!cur || row.similarity > cur.similarity) byNote.set(row.note_id, row);
    }
    const results = [...byNote.values()].sort((a, b) => b.similarity - a.similarity);

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'unexpected', detail: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
