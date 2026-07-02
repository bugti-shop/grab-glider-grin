
CREATE TABLE IF NOT EXISTS public.otp_resend_log (
  email TEXT PRIMARY KEY,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  send_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.otp_resend_log TO service_role;
ALTER TABLE public.otp_resend_log ENABLE ROW LEVEL SECURITY;
-- No policies: only service role (via edge function) may touch this table.
