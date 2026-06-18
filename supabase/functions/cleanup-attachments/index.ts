// Edge function: cleanup-attachments
// Triggered daily by pg_cron. Requires `Authorization: Bearer <CRON_SECRET>`
// to prevent unauthenticated callers from forcing early hard-deletes.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const BUCKET = 'user-attachments';

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // ---- Shared-secret check ----
    if (!CRON_SECRET) {
      return new Response(JSON.stringify({ error: 'CRON_SECRET not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const authHeader = req.headers.get('Authorization') ?? '';
    const provided = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim() : '';
    if (!provided || !timingSafeEqual(provided, CRON_SECRET)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
