
-- Revoke EXECUTE from anon/authenticated on internal SECURITY DEFINER functions.
-- These are backend-only helpers (queue workers, usage counters, DLQ movers).

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_ai_usage(text, text, text, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_ai_usage_if_under_limit(text, text, text, date, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.web_clips_wake() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.web_clips_dispatch() FROM PUBLIC, anon, authenticated;

-- Ensure service_role can still call them (it has it by default, but be explicit).
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrement_ai_usage(text, text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage_if_under_limit(text, text, text, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;
GRANT EXECUTE ON FUNCTION public.web_clips_wake() TO service_role;
GRANT EXECUTE ON FUNCTION public.web_clips_dispatch() TO service_role;

-- record_public_note_view: keep callable by anon (public note view counter) — intentional.
-- enqueue_web_clip_job: keep callable by authenticated (owner-checked inside function) — intentional.
-- has_role / is_project_member / can_edit_project / can_view_task / can_edit_task /
-- project_role_of: keep callable — used by RLS policies as SECURITY DEFINER helpers.
