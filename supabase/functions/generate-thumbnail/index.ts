// Edge function: generate-thumbnail
// Invoked after a file_attachments INSERT (via client trigger or DB webhook).
// Reads the original from the `user-attachments` bucket, generates a small
// thumbnail using ImageScript, uploads it next to the original with a
// `.thumb.jpg` suffix, and writes the thumbnail path back onto the row.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'user-attachments';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { attachment_id } = await req.json();
    if (!attachment_id) {
      return new Response(JSON.stringify({ error: 'attachment_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: row, error: rowErr } = await admin
      .from('file_attachments').select('*').eq('id', attachment_id).maybeSingle();
    if (rowErr || !row) throw rowErr ?? new Error('not found');

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
