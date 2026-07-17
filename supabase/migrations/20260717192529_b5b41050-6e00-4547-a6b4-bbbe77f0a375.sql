
-- 1. Set immutable search_path on functions missing it
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;

-- 2. Revoke EXECUTE from PUBLIC/anon/authenticated for internal SECURITY DEFINER helpers
--    (these are only meant to be called from RLS policies or edge functions running as service_role)
REVOKE ALL ON FUNCTION public.can_edit_project(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_edit_task(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_view_task(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_project_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.project_role_of(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrement_ai_usage(text, text, text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_ai_usage_if_under_limit(text, text, text, date, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.web_clips_wake() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.web_clips_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 3. enqueue_web_clip_job: strictly authenticated (it already checks auth.uid())
REVOKE ALL ON FUNCTION public.enqueue_web_clip_job(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_web_clip_job(uuid, text) TO authenticated;

-- 4. record_public_note_view stays callable from client (public notes view counter)
GRANT EXECUTE ON FUNCTION public.record_public_note_view(text) TO anon, authenticated;

-- 5. Replace overly permissive page_events INSERT policy with a constrained one
DROP POLICY IF EXISTS "Anyone can log pageview" ON public.page_events;
CREATE POLICY "Anyone can log pageview"
  ON public.page_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    session_id IS NOT NULL
    AND path IS NOT NULL
    AND length(session_id) BETWEEN 1 AND 200
    AND length(path) BETWEEN 1 AND 2000
    AND (referrer IS NULL OR length(referrer) <= 2000)
    AND (user_agent IS NULL OR length(user_agent) <= 500)
    AND (source IS NULL OR length(source) <= 200)
    AND (device IS NULL OR length(device) <= 100)
  );
