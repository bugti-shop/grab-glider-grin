
-- 1) subscriptions: block client writes
CREATE POLICY "subscriptions_no_client_insert" ON public.subscriptions
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "subscriptions_no_client_update" ON public.subscriptions
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "subscriptions_no_client_delete" ON public.subscriptions
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- 2) user_entitlements: block client writes
CREATE POLICY "user_entitlements_no_client_insert" ON public.user_entitlements
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "user_entitlements_no_client_update" ON public.user_entitlements
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "user_entitlements_no_client_delete" ON public.user_entitlements
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- 3) user_lifetime_counters: restrict anon to INSERT + SELECT (device rows only)
DROP POLICY IF EXISTS "Anon manage device lifetime rows" ON public.user_lifetime_counters;
CREATE POLICY "Anon insert own device lifetime row" ON public.user_lifetime_counters
  FOR INSERT TO anon
  WITH CHECK (identifier_type = 'device' AND identifier IS NOT NULL AND length(identifier) BETWEEN 8 AND 256);
CREATE POLICY "Anon select device lifetime rows" ON public.user_lifetime_counters
  FOR SELECT TO anon USING (identifier_type = 'device');

-- 4) onboarding_responses: scoped insert (no more WITH CHECK true)
DROP POLICY IF EXISTS "Anyone can insert onboarding responses" ON public.onboarding_responses;
CREATE POLICY "Insert onboarding responses (scoped)" ON public.onboarding_responses
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    (auth.uid() IS NOT NULL AND (user_email IS NULL OR lower(user_email) = lower(auth.jwt()->>'email')))
    OR
    (auth.uid() IS NULL AND device_id IS NOT NULL AND length(device_id) BETWEEN 4 AND 256)
  );

-- 5) feedback-screenshots: require auth + path starts with auth.uid()
DROP POLICY IF EXISTS "feedback uploads insert" ON storage.objects;
CREATE POLICY "feedback uploads insert (owner-scoped)" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'feedback-screenshots' AND (storage.foldername(name))[1] = (auth.uid())::text);

-- 6) Revoke EXECUTE on SECURITY DEFINER functions from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_ai_usage_if_under_limit(text, text, text, date, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_ai_usage(text, text, text, date) FROM PUBLIC, anon, authenticated;

-- 7) Move pg_net out of public (recreate in extensions schema)
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, service_role;
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 8) Realtime.messages: enable RLS and restrict to authenticated
DO $$ BEGIN
  EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE $p$
    CREATE POLICY "authenticated only realtime messages"
      ON realtime.messages FOR SELECT TO authenticated
      USING (auth.uid() IS NOT NULL)
  $p$;
EXCEPTION WHEN duplicate_object OR insufficient_privilege OR undefined_table THEN NULL;
END $$;
