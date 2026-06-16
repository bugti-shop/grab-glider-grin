
-- Lock down user_daily_ai_usage and user_lifetime_counters to authenticated users
-- whose email matches the row identifier. Anonymous access removed.

DROP POLICY IF EXISTS "Anyone can read daily AI usage" ON public.user_daily_ai_usage;
DROP POLICY IF EXISTS "Anyone can insert daily AI usage" ON public.user_daily_ai_usage;
DROP POLICY IF EXISTS "Anyone can update daily AI usage" ON public.user_daily_ai_usage;

CREATE POLICY "Users read own daily AI usage"
  ON public.user_daily_ai_usage FOR SELECT TO authenticated
  USING (identifier_type = 'email' AND identifier = lower((auth.jwt() ->> 'email')));

CREATE POLICY "Users insert own daily AI usage"
  ON public.user_daily_ai_usage FOR INSERT TO authenticated
  WITH CHECK (identifier_type = 'email' AND identifier = lower((auth.jwt() ->> 'email')));

CREATE POLICY "Users update own daily AI usage"
  ON public.user_daily_ai_usage FOR UPDATE TO authenticated
  USING (identifier_type = 'email' AND identifier = lower((auth.jwt() ->> 'email')))
  WITH CHECK (identifier_type = 'email' AND identifier = lower((auth.jwt() ->> 'email')));

DROP POLICY IF EXISTS "Anyone can read lifetime counters" ON public.user_lifetime_counters;
DROP POLICY IF EXISTS "Anyone can insert lifetime counters" ON public.user_lifetime_counters;
DROP POLICY IF EXISTS "Anyone can update lifetime counters" ON public.user_lifetime_counters;

CREATE POLICY "Users read own lifetime counters"
  ON public.user_lifetime_counters FOR SELECT TO authenticated
  USING (identifier_type = 'email' AND identifier = lower((auth.jwt() ->> 'email')));

CREATE POLICY "Users insert own lifetime counters"
  ON public.user_lifetime_counters FOR INSERT TO authenticated
  WITH CHECK (identifier_type = 'email' AND identifier = lower((auth.jwt() ->> 'email')));

CREATE POLICY "Users update own lifetime counters"
  ON public.user_lifetime_counters FOR UPDATE TO authenticated
  USING (identifier_type = 'email' AND identifier = lower((auth.jwt() ->> 'email')))
  WITH CHECK (identifier_type = 'email' AND identifier = lower((auth.jwt() ->> 'email')));

-- Revoke from anon; keep grants tight
REVOKE ALL ON public.user_daily_ai_usage FROM anon;
REVOKE ALL ON public.user_lifetime_counters FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.user_daily_ai_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_lifetime_counters TO authenticated;

-- Restrict SECURITY DEFINER RPCs from anon
REVOKE EXECUTE ON FUNCTION public.increment_ai_usage_if_under_limit(text, text, text, date, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decrement_ai_usage(text, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage_if_under_limit(text, text, text, date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_ai_usage(text, text, text, date) TO authenticated;
