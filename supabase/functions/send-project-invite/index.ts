import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const APP_URL = Deno.env.get('APP_PUBLIC_URL') ?? 'https://flowist.me'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isEmail(v: unknown): v is string {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

function randomToken() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Unauthorized' }, 401)

  // Client that authenticates as the caller — RLS enforces owner-only invite creation.
  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userRes } = await asUser.auth.getUser()
  const user = userRes?.user
  if (!user) return json({ error: 'Unauthorized' }, 401)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { projectId, email, role } = body ?? {}
  if (typeof projectId !== 'string' || !isEmail(email)) {
    return json({ error: 'projectId + valid email required' }, 400)
  }
  const inviteRole = role === 'viewer' || role === 'editor' ? role : 'editor'
  const normalizedEmail = email.trim().toLowerCase()

  // Load project name + verify caller is owner via RLS on select
  const { data: project, error: projErr } = await asUser
    .from('projects').select('id, name').eq('id', projectId).maybeSingle()
  if (projErr || !project) return json({ error: 'Project not found' }, 404)

  // Insert the invite via the user's client (RLS enforces owner-only)
  const token = randomToken()
  const { data: invite, error: insErr } = await asUser
    .from('project_invitations')
    .insert({
      project_id: projectId,
      email: normalizedEmail,
      role: inviteRole,
      token,
      invited_by: user.id,
    })
    .select('id, token, project_id, email, role, expires_at')
    .single()
  if (insErr) {
    console.error('invite insert failed', insErr)
    return json({ error: insErr.message || 'Failed to create invite' }, 403)
  }

  // Look up inviter display name via service role (profiles is RLS-protected)
  const admin = createClient(supabaseUrl, serviceKey)
  const { data: profile } = await admin
    .from('profiles').select('display_name, email').eq('id', user.id).maybeSingle()
  const inviterName = profile?.display_name || profile?.email || user.email || 'A Flowist user'

  const acceptUrl = `${APP_URL}/invite/${token}`

  // Send email via existing transactional pipeline
  const { error: sendErr } = await admin.functions.invoke('send-transactional-email', {
    body: {
      templateName: 'project-invite',
      recipientEmail: normalizedEmail,
      idempotencyKey: `project-invite-${invite.id}`,
      templateData: {
        inviterName,
        projectName: project.name,
        role: inviteRole,
        acceptUrl,
      },
    },
  })
  if (sendErr) {
    console.error('email send failed', sendErr)
    // Don't roll back — user can resend
  }

  return json({ ok: true, invite: { id: invite.id, email: normalizedEmail, role: inviteRole, expires_at: invite.expires_at } })
})
