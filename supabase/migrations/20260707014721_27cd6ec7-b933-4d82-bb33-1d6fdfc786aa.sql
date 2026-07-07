-- Web Clipper background job infrastructure
-- Mirrors the email_queue pattern: pgmq queue + pg_cron dispatcher + wake trigger.

CREATE TYPE public.web_clip_job_status AS ENUM ('pending','processing','done','failed');

CREATE TABLE public.web_clip_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  note_id uuid NOT NULL,
  url text NOT NULL,
  status public.web_clip_job_status NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  error_code text,
  error_message text,
  result jsonb,
  bytes int,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX web_clip_jobs_user_status_idx ON public.web_clip_jobs (user_id, status, created_at DESC);
CREATE INDEX web_clip_jobs_note_idx ON public.web_clip_jobs (note_id);

GRANT SELECT, INSERT, UPDATE ON public.web_clip_jobs TO authenticated;
GRANT ALL ON public.web_clip_jobs TO service_role;

ALTER TABLE public.web_clip_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own web clip jobs"
  ON public.web_clip_jobs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Inserts happen via the SECURITY DEFINER RPC; still gate direct inserts to owner.
CREATE POLICY "Users insert their own web clip jobs"
  ON public.web_clip_jobs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER web_clip_jobs_touch
  BEFORE UPDATE ON public.web_clip_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime so the client hook can react to status transitions.
ALTER PUBLICATION supabase_realtime ADD TABLE public.web_clip_jobs;
ALTER TABLE public.web_clip_jobs REPLICA IDENTITY FULL;

-- ── Enqueue RPC ────────────────────────────────────────────────────────────
-- Client calls this once the placeholder note is inserted. It writes the job
-- row + puts a message on the pgmq queue in the same transaction.
CREATE OR REPLACE FUNCTION public.enqueue_web_clip_job(p_note_id uuid, p_url text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_job_id uuid;
  v_note_owner uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF p_url IS NULL OR length(trim(p_url)) = 0 THEN
    RAISE EXCEPTION 'url required';
  END IF;

  SELECT user_id INTO v_note_owner FROM public.notes WHERE id = p_note_id;
  IF v_note_owner IS NULL OR v_note_owner <> v_user THEN
    RAISE EXCEPTION 'note not found or forbidden';
  END IF;

  INSERT INTO public.web_clip_jobs (user_id, note_id, url)
  VALUES (v_user, p_note_id, p_url)
  RETURNING id INTO v_job_id;

  BEGIN
    PERFORM pgmq.send('web_clips', jsonb_build_object(
      'job_id', v_job_id,
      'user_id', v_user,
      'note_id', p_note_id,
      'url', p_url
    ));
  EXCEPTION WHEN undefined_table THEN
    PERFORM pgmq.create('web_clips');
    PERFORM pgmq.send('web_clips', jsonb_build_object(
      'job_id', v_job_id,
      'user_id', v_user,
      'note_id', p_note_id,
      'url', p_url
    ));
  END;

  RETURN v_job_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_web_clip_job(uuid, text) TO authenticated;

-- Ensure queue exists.
DO $$ BEGIN PERFORM pgmq.create('web_clips'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── Dispatcher: called by pg_cron, pings the edge worker ───────────────────
CREATE OR REPLACE FUNCTION public.web_clips_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.q_web_clips) THEN
    BEGIN
      PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000002);
      IF EXISTS (SELECT 1 FROM pgmq.q_web_clips) THEN
        RETURN;
      END IF;
      PERFORM cron.unschedule('process-web-clips');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'web_clips_dispatch: cron unschedule failed: %', SQLERRM;
    END;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://hbkzstxquviwxbgntozl.supabase.co/functions/v1/process-web-clips',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Lovable-Context', 'cron',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- ── Wake trigger: arm the cron the instant a job is enqueued ───────────────
CREATE OR REPLACE FUNCTION public.web_clips_wake()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000002);
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-web-clips') THEN
    BEGIN
      PERFORM cron.schedule('process-web-clips', '10 seconds', $cron$ SELECT public.web_clips_dispatch(); $cron$);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'web_clips_wake: cron schedule failed: %', SQLERRM;
    END;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://hbkzstxquviwxbgntozl.supabase.co/functions/v1/process-web-clips',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Lovable-Context', 'wake',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
        )
      ),
      body := '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'web_clips_wake failed: %', SQLERRM;
  RETURN NULL;
END;
$$;

CREATE TRIGGER web_clip_jobs_wake_trigger
  AFTER INSERT ON public.web_clip_jobs
  FOR EACH ROW EXECUTE FUNCTION public.web_clips_wake();