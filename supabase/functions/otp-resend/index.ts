import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Backend rate limit for OTP resend requests.
// - Minimum 45 seconds between resends per email
// - Max 5 resends per rolling 15-minute window per email

const MIN_INTERVAL_MS = 45 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 5;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface Body {
  email?: string;
  type?: 'signup' | 'email_change';
  check?: boolean; // if true, only report remaining cooldown without sending
}


const jsonResponse = (status: number, body: unknown, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: Body;
  try { body = await req.json(); } catch { return jsonResponse(400, { error: 'invalid_json' }); }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const type = body.type === 'email_change' ? 'email_change' : 'signup';
  if (!email || email.length > 254 || !email.includes('@')) {
    return jsonResponse(400, { error: 'invalid_email' });
  }

  const now = new Date();
  const nowMs = now.getTime();

  // Read current throttle state.
  const { data: existing, error: readErr } = await admin
    .from('otp_resend_log')
    .select('email, last_sent_at, send_count, window_started_at')
    .eq('email', email)
    .maybeSingle();

  if (readErr) {
    console.error('otp-resend read error', readErr);
    return jsonResponse(500, { error: 'server_error' });
  }

  if (existing) {
    const lastMs = new Date(existing.last_sent_at).getTime();
    const winStartMs = new Date(existing.window_started_at).getTime();
    const sinceLast = nowMs - lastMs;

    if (sinceLast < MIN_INTERVAL_MS) {
      const retryAfter = Math.ceil((MIN_INTERVAL_MS - sinceLast) / 1000);
      return jsonResponse(
        429,
        { error: 'cooldown', retryAfter, message: `Please wait ${retryAfter}s before requesting another code.` },
        { 'Retry-After': String(retryAfter) },
      );
    }

    const withinWindow = nowMs - winStartMs < WINDOW_MS;
    if (withinWindow && existing.send_count >= MAX_PER_WINDOW) {
      const retryAfter = Math.ceil((WINDOW_MS - (nowMs - winStartMs)) / 1000);
      return jsonResponse(
        429,
        { error: 'too_many_requests', retryAfter, message: 'Too many code requests. Try again later.' },
        { 'Retry-After': String(retryAfter) },
      );
    }
  }

  // Perform the resend using the anon client (Supabase enforces its own signup rules).
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: resendErr } = await anon.auth.resend({ type, email });
  if (resendErr) {
    console.error('otp-resend supabase error', resendErr);
    return jsonResponse(400, { error: 'resend_failed', message: resendErr.message });
  }

  // Update throttle log (upsert).
  const withinWindow = existing && nowMs - new Date(existing.window_started_at).getTime() < WINDOW_MS;
  const newRow = {
    email,
    last_sent_at: now.toISOString(),
    send_count: withinWindow ? (existing!.send_count + 1) : 1,
    window_started_at: withinWindow ? existing!.window_started_at : now.toISOString(),
  };
  const { error: upsertErr } = await admin.from('otp_resend_log').upsert(newRow);
  if (upsertErr) console.error('otp-resend upsert error', upsertErr);

  return jsonResponse(200, { ok: true, cooldownSeconds: MIN_INTERVAL_MS / 1000 });
});
