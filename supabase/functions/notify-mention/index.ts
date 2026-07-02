import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const APP_URL = Deno.env.get('APP_PUBLIC_URL') ?? 'https://flowist.me'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Unauthorized' }, 401)

  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userRes } = await asUser.auth.getUser()
  const actor = userRes?.user
  if (!actor) return json({ error: 'Unauthorized' }, 401)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { commentId, taskId, mentions } = body ?? {}
  if (typeof commentId !== 'string' || typeof taskId !== 'string' || !Array.isArray(mentions) || mentions.length === 0) {
    return json({ error: 'commentId, taskId, mentions[] required' }, 400)
  }

  // RLS-gated: caller must be able to see the comment they authored
  const { data: comment } = await asUser
    .from('task_comments').select('id, body, task_id, user_id').eq('id', commentId).maybeSingle()
  if (!comment || comment.user_id !== actor.id) return json({ error: 'Forbidden' }, 403)

  const admin = createClient(supabaseUrl, serviceKey)

  // Task + project for context (service role — templated email content only)
  const { data: task } = await admin
    .from('tasks').select('id, text, project_id').eq('id', taskId).maybeSingle()
  if (!task) return json({ error: 'Task not found' }, 404)

  let projectName: string | undefined
  if (task.project_id) {
    const { data: proj } = await admin
      .from('projects').select('name').eq('id', task.project_id).maybeSingle()
    projectName = proj?.name ?? undefined
  }

  // Restrict recipients to project members (if project) and dedupe, exclude actor
  const uniqueMentions = Array.from(new Set(mentions.filter((m: unknown): m is string => typeof m === 'string' && m !== actor.id)))
  if (uniqueMentions.length === 0) return json({ ok: true, sent: 0 })

  let allowedIds = uniqueMentions
  if (task.project_id) {
    const { data: members } = await admin
      .from('project_members').select('user_id').eq('project_id', task.project_id).in('user_id', uniqueMentions)
    allowedIds = (members ?? []).map((m: any) => m.user_id)
  }
  if (allowedIds.length === 0) return json({ ok: true, sent: 0 })

  const { data: profiles } = await admin
    .from('profiles').select('id, email, display_name').in('id', allowedIds)
  const { data: actorProfile } = await admin
    .from('profiles').select('display_name, email').eq('id', actor.id).maybeSingle()

  const mentionerName = actorProfile?.display_name || actorProfile?.email || actor.email || 'A Flowist user'
  const taskTitle = (task.text ?? 'a task').slice(0, 120)
  const taskUrl = `${APP_URL}/todo/today?taskId=${task.id}`

  let sent = 0
  for (const p of profiles ?? []) {
    if (!p.email) continue
    const { error } = await admin.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'task-mention',
        recipientEmail: p.email,
        idempotencyKey: `task-mention-${commentId}-${p.id}`,
        templateData: { mentionerName, taskTitle, projectName, commentBody: comment.body, taskUrl },
      },
    })
    if (!error) sent++
    else console.error('task-mention send failed', error)
  }

  return json({ ok: true, sent })
})
