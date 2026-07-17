import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace(/^Bearer\s+/i, '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify the requester
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    // Admin client to perform deletion
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const userEmail = userData.user.email?.toLowerCase() ?? null;

    // Admin client to perform deletion
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Wipe rows in our own tables that reference this user. Different tables
    // key on different columns (user_id, user_email, app_user_id, device_id),
    // so we run per-table deletes with the correct column and surface errors.
    const deletions: Array<Promise<{ error: unknown; table: string }>> = [];
    const del = (table: string, q: any) =>
      deletions.push(q.then((r: any) => ({ error: r.error, table })));

    del('user_daily_ai_usage', admin.from('user_daily_ai_usage').delete().eq('identifier', userId));
    del('user_lifetime_counters', admin.from('user_lifetime_counters').delete().eq('user_id', userId));
    del('user_refresh_tokens', admin.from('user_refresh_tokens').delete().eq('user_id', userId));

    if (userEmail) {
      del('user_daily_ai_usage_email', admin.from('user_daily_ai_usage').delete().eq('identifier', userEmail));
      del('subscriptions', admin.from('subscriptions').delete().eq('user_email', userEmail));
      del('user_entitlements_email', admin.from('user_entitlements').delete().eq('app_user_id', userEmail));
      del('onboarding_responses', admin.from('onboarding_responses').delete().eq('user_email', userEmail));
    }
    del('user_entitlements_uid', admin.from('user_entitlements').delete().eq('app_user_id', userId));

    const results = await Promise.all(deletions);
    const failures = results.filter((r) => r.error);
    if (failures.length > 0) {
      console.error('delete-account: some cleanup deletes failed', failures);
    }


    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error('deleteUser error:', delErr);
      return new Response(JSON.stringify({ error: delErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('delete-account fatal:', e);
    return new Response(JSON.stringify({ error: e?.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});