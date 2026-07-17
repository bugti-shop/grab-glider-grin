DROP POLICY IF EXISTS "Authenticated can read page events" ON public.page_events;
REVOKE SELECT ON public.page_events FROM authenticated, anon;
GRANT ALL ON public.page_events TO service_role;