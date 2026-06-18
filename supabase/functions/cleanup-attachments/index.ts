// Edge function: cleanup-attachments
// Daily housekeeping. Deletes storage objects whose file_attachments row is
// soft-deleted (is_deleted=true) and older than 24h, then hard-deletes the row.
// Intended to be scheduled by pg_cron.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'user-attachments';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const { data: rows, error } = await admin.from('file_attachments')
      .select('id, storage_path, thumbnail_path')
      .eq('is_deleted', true)
      .lt('updated_at', cutoff)
      .limit(500);
    if (error) throw error;

    let deleted = 0;
    for (const row of (rows ?? []) as any[]) {
      const paths = [row.storage_path, row.thumbnail_path].filter(Boolean) as string[];
      if (paths.length) await admin.storage.from(BUCKET).remove(paths).catch(() => {});
      await admin.from('file_attachments').delete().eq('id', row.id);
      deleted += 1;
    }

    return new Response(JSON.stringify({ ok: true, deleted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
