// Edge function: generate-thumbnail
// Requires a valid user JWT and verifies that the attachment belongs to the caller
// before performing any service-role operations.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const BUCKET = 'user-attachments';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // ---- AuthN: require a valid Supabase JWT ----
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.slice(7).trim();
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const callerId = claims.claims.sub as string;

    const { attachment_id } = await req.json();
    if (!attachment_id || typeof attachment_id !== 'string') {
      return new Response(JSON.stringify({ error: 'attachment_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: row, error: rowErr } = await admin
      .from('file_attachments').select('*').eq('id', attachment_id).maybeSingle();
    if (rowErr || !row) {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---- AuthZ: caller must own the attachment ----
    if ((row as any).user_id !== callerId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const storagePath = (row as any).storage_path as string | null;
    const mime = String((row as any).mime_type ?? '');
    if (!storagePath || !mime.startsWith('image/')) {
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(storagePath);
    if (dlErr || !blob) throw dlErr ?? new Error('download failed');

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const img = await Image.decode(bytes);
    const ratio = img.width > img.height ? 256 / img.width : 256 / img.height;
    const thumb = img.clone().resize(Math.round(img.width * ratio), Math.round(img.height * ratio));
    const out = await thumb.encodeJPEG(72);

    const thumbPath = storagePath.replace(/(\.[^/.]+)?$/, '.thumb.jpg');
    await admin.storage.from(BUCKET).upload(thumbPath, out, {
      contentType: 'image/jpeg', upsert: true,
    });

    await admin.from('file_attachments').update({
      thumbnail_path: thumbPath, updated_at: new Date().toISOString(),
    } as any).eq('id', attachment_id);

    return new Response(JSON.stringify({ ok: true, thumbnail_path: thumbPath }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
