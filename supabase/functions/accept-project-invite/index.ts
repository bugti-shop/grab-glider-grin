import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  // GET: preview invite (no auth needed)
  if (req.method === 'GET') {
    const token = new URL(req.url).searchParams.get('token')
    if (!token) return json({ error: 'Token required' }, 400)
    const { data: invite } = await admin
      .from('project_invitations')
      .select('id, project_id, email, role, expires_at, accepted_at')
      .eq('token', token).maybeSingle()
    if (!invite) return json({ error: 'Invalid invitation' }, 404)
    if (invite.accepted_at) return json({ error: 'Already accepted', status: 'accepted' }, 410)
    if (new Date(invite.expires_at) < new Date()) return json({ error: 'Expired', status: 'expired' }, 410)
    const { data: project } = await admin
      .from('projects').select('id, name, color, emoji').eq('id', invite.project_id).maybeSingle()
    return json({
      status: 'pending',
      invite: { email: invite.email, role: invite.role, expires_at: invite.expires_at },
      project,
    })
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Sign in required' }, 401)

  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userRes } = await asUser.auth.getUser()
  const user = userRes?.user
  if (!user) return json({ error: 'Sign in required' }, 401)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const token = body?.token
  if (typeof token !== 'string') return json({ error: 'Token required' }, 400)

  const { data: invite } = await admin
    .from('project_invitations').select('*').eq('token', token).maybeSingle()
  if (!invite) return json({ error: 'Invalid invitation' }, 404)
  if (invite.accepted_at) return json({ error: 'Already accepted' }, 410)
  if (new Date(invite.expires_at) < new Date()) return json({ error: 'Expired' }, 410)

  const userEmail = (user.email ?? '').toLowerCase()
  if (userEmail && invite.email.toLowerCase() !== userEmail) {
    return json({ error: `This invite is for ${invite.email}. Sign in with that account to accept.` }, 403)
  }

  // Add membership (idempotent) + mark accepted — via service role to bypass member-only RLS on projects
  const { error: memberErr } = await admin
    .from('project_members')
    .upsert({ project_id: invite.project_id, user_id: user.id, role: invite.role }, { onConflict: 'project_id,user_id' })
  if (memberErr) return json({ error: memberErr.message }, 500)

  await admin
    .from('project_invitations')
    .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq('id', invite.id)

  return json({ ok: true, project_id: invite.project_id })
})
