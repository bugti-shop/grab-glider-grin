// Server-enforced project membership management.
// Handles role changes and removals with strict permission checks that
// cannot be bypassed by an attacker crafting direct table calls.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Sign in required' }, 401)

  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userRes } = await asUser.auth.getUser()
  const actor = userRes?.user
  if (!actor) return json({ error: 'Sign in required' }, 401)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { action, projectId, userId, role } = body ?? {}
  if (!projectId || !userId || !['remove', 'change_role'].includes(action)) {
    return json({ error: 'Missing or invalid parameters' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  // Verify actor is OWNER of the project (only owners can manage membership)
  const { data: actorMembership } = await admin
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', actor.id)
    .maybeSingle()

  if (!actorMembership || actorMembership.role !== 'owner') {
    return json({ error: 'Only the project owner can manage members' }, 403)
  }

  // Never allow demoting or removing the last owner
  const { data: target } = await admin
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!target) return json({ error: 'Member not found in this project' }, 404)

  if (target.role === 'owner') {
    return json({ error: 'The project owner cannot be removed or demoted' }, 403)
  }

  if (action === 'remove') {
    const { error } = await admin
      .from('project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', userId)
    if (error) return json({ error: error.message }, 500)

    // Unassign this user from any tasks in the project
    await admin
      .from('tasks')
      .update({ assignee_id: null })
      .eq('project_id', projectId)
      .eq('assignee_id', userId)

    return json({ ok: true })
  }

  // change_role
  if (!['editor', 'viewer'].includes(role)) {
    return json({ error: 'Invalid role' }, 400)
  }
  const { error } = await admin
    .from('project_members')
    .update({ role })
    .eq('project_id', projectId)
    .eq('user_id', userId)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
})
