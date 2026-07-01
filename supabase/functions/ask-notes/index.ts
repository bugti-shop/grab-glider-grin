// RAG: retrieves top note chunks for the query, then asks Gemini to answer
// grounded in those chunks. Returns { answer, citations: [{ noteId, title, snippet }] }.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const EMBED_MODEL = 'openai/text-embedding-3-small';
const CHAT_MODEL = 'google/gemini-3-flash-preview';

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
    if (!query) {
      return new Response(JSON.stringify({ error: 'missing_query' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1) Embed query
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

    // 2) Retrieve top chunks (RLS ensures own user only)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: chunks, error } = await userClient.rpc('match_note_chunks', {
      query_embedding: qvec as any,
      match_count: 8,
      min_similarity: 0.2,
    });
    if (error) {
      return new Response(JSON.stringify({ error: 'search_failed', detail: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rows = (chunks ?? []) as any[];
    if (rows.length === 0) {
      return new Response(JSON.stringify({
        answer: "I couldn't find anything in your notes about that yet.",
        citations: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const context = rows.map((r, i) =>
      `[[${i + 1}]] ${r.title ? `(${r.title}) ` : ''}${r.content}`
    ).join('\n\n');

    const systemPrompt = `You are the user's personal notes assistant. Answer their question using ONLY the note excerpts below. Cite sources inline using bracketed numbers like [1], [2] matching the [[N]] markers. If the notes don't contain the answer, say so plainly. Be concise.`;

    const chatResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Question: ${query}\n\nNotes:\n${context}` },
        ],
      }),
    });
    if (!chatResp.ok) {
      const t = await chatResp.text();
      return new Response(JSON.stringify({ error: 'chat_failed', detail: t }), {
        status: chatResp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const chatData = await chatResp.json();
    const answer = chatData.choices?.[0]?.message?.content ?? '';

    const citations = rows.map((r, i) => ({
      index: i + 1,
      noteId: r.note_id,
      title: r.title || 'Untitled',
      snippet: (r.content || '').slice(0, 220),
      similarity: r.similarity,
    }));

    return new Response(JSON.stringify({ answer, citations }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'unexpected', detail: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
