
-- Shared trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- subscriptions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  plan_type TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'active',
  is_trialing BOOLEAN NOT NULL DEFAULT false,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_email ON public.subscriptions (user_email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON public.subscriptions (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No direct read access to subscriptions" ON public.subscriptions;
CREATE POLICY "No direct read access to subscriptions"
  ON public.subscriptions FOR SELECT USING (false);

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- onboarding_responses
-- ============================================================
CREATE TABLE IF NOT EXISTS public.onboarding_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT,
  user_email TEXT,
  language TEXT,
  goals JSONB DEFAULT '[]'::jsonb,
  source TEXT,
  previous_app TEXT,
  frustration TEXT,
  task_view_preference TEXT,
  journey_selected TEXT,
  devices JSONB DEFAULT '[]'::jsonb,
  offline_preference TEXT,
  unfinished_reason TEXT,
  slowdown_reason TEXT,
  why_apps_fail TEXT,
  user_name TEXT,
  note_created BOOLEAN DEFAULT false,
  sketch_created BOOLEAN DEFAULT false,
  tasks_created_count INTEGER DEFAULT 0,
  notes_folders_count INTEGER DEFAULT 0,
  tasks_folders_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.onboarding_responses TO anon, authenticated;
GRANT ALL ON public.onboarding_responses TO service_role;

ALTER TABLE public.onboarding_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can insert onboarding responses" ON public.onboarding_responses;
CREATE POLICY "Anyone can insert onboarding responses"
  ON public.onboarding_responses FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "No direct read access to onboarding responses" ON public.onboarding_responses;
CREATE POLICY "No direct read access to onboarding responses"
  ON public.onboarding_responses FOR SELECT USING (false);

-- ============================================================
-- user_refresh_tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  google_refresh_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_refresh_tokens TO authenticated;
GRANT ALL ON public.user_refresh_tokens TO service_role;

ALTER TABLE public.user_refresh_tokens ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_user_refresh_tokens_updated_at ON public.user_refresh_tokens;
CREATE TRIGGER set_user_refresh_tokens_updated_at
  BEFORE UPDATE ON public.user_refresh_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "No direct read access to refresh tokens" ON public.user_refresh_tokens;
CREATE POLICY "No direct read access to refresh tokens"
  ON public.user_refresh_tokens FOR SELECT TO authenticated USING (false);
DROP POLICY IF EXISTS "Users can create their own refresh token" ON public.user_refresh_tokens;
CREATE POLICY "Users can create their own refresh token"
  ON public.user_refresh_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own refresh token" ON public.user_refresh_tokens;
CREATE POLICY "Users can update their own refresh token"
  ON public.user_refresh_tokens FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own refresh token" ON public.user_refresh_tokens;
CREATE POLICY "Users can delete their own refresh token"
  ON public.user_refresh_tokens FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- user_lifetime_counters
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_lifetime_counters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL,
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('email', 'device', 'user')),
  notes_created INTEGER NOT NULL DEFAULT 0,
  tasks_created INTEGER NOT NULL DEFAULT 0,
  note_folders_created INTEGER NOT NULL DEFAULT 0,
  task_folders_created INTEGER NOT NULL DEFAULT 0,
  task_sections_created INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (identifier, identifier_type)
);
CREATE INDEX IF NOT EXISTS idx_user_lifetime_counters_identifier
  ON public.user_lifetime_counters(identifier, identifier_type);

GRANT SELECT, INSERT, UPDATE ON public.user_lifetime_counters TO anon, authenticated;
GRANT ALL ON public.user_lifetime_counters TO service_role;

ALTER TABLE public.user_lifetime_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read lifetime counters" ON public.user_lifetime_counters;
CREATE POLICY "Anyone can read lifetime counters"
  ON public.user_lifetime_counters FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can insert lifetime counters" ON public.user_lifetime_counters;
CREATE POLICY "Anyone can insert lifetime counters"
  ON public.user_lifetime_counters FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update lifetime counters" ON public.user_lifetime_counters;
CREATE POLICY "Anyone can update lifetime counters"
  ON public.user_lifetime_counters FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_user_lifetime_counters_updated_at ON public.user_lifetime_counters;
CREATE TRIGGER update_user_lifetime_counters_updated_at
  BEFORE UPDATE ON public.user_lifetime_counters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- user_daily_ai_usage
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_daily_ai_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL,
  identifier_type TEXT NOT NULL,
  feature TEXT NOT NULL,
  usage_date DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (identifier, identifier_type, feature, usage_date)
);
CREATE INDEX IF NOT EXISTS idx_user_daily_ai_usage_lookup
  ON public.user_daily_ai_usage (identifier, identifier_type, feature, usage_date);

GRANT SELECT, INSERT, UPDATE ON public.user_daily_ai_usage TO anon, authenticated;
GRANT ALL ON public.user_daily_ai_usage TO service_role;

ALTER TABLE public.user_daily_ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read daily AI usage" ON public.user_daily_ai_usage;
CREATE POLICY "Anyone can read daily AI usage"
  ON public.user_daily_ai_usage FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can insert daily AI usage" ON public.user_daily_ai_usage;
CREATE POLICY "Anyone can insert daily AI usage"
  ON public.user_daily_ai_usage FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update daily AI usage" ON public.user_daily_ai_usage;
CREATE POLICY "Anyone can update daily AI usage"
  ON public.user_daily_ai_usage FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_user_daily_ai_usage_updated_at ON public.user_daily_ai_usage;
CREATE TRIGGER update_user_daily_ai_usage_updated_at
  BEFORE UPDATE ON public.user_daily_ai_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- user_entitlements (RevenueCat-pushed state)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_entitlements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  app_user_id TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  product_id TEXT,
  expires_at TIMESTAMPTZ,
  grace_period_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_entitlements TO authenticated;
GRANT ALL ON public.user_entitlements TO service_role;

ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read their own entitlement" ON public.user_entitlements;
CREATE POLICY "Users can read their own entitlement"
  ON public.user_entitlements FOR SELECT TO authenticated
  USING (
    app_user_id = auth.uid()::text
    OR app_user_id = (auth.jwt() ->> 'email')
  );

DROP TRIGGER IF EXISTS update_user_entitlements_updated_at ON public.user_entitlements;
CREATE TRIGGER update_user_entitlements_updated_at
  BEFORE UPDATE ON public.user_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RPC helpers used by aiUsageLimits / aiUsageCloud
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_ai_usage_if_under_limit(
  p_identifier text,
  p_identifier_type text,
  p_feature text,
  p_usage_date date,
  p_limit integer
)
RETURNS TABLE (allowed boolean, new_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.user_daily_ai_usage AS u
    (identifier, identifier_type, feature, usage_date, count)
  VALUES (p_identifier, p_identifier_type, p_feature, p_usage_date, 1)
  ON CONFLICT (identifier, identifier_type, feature, usage_date)
  DO UPDATE SET
    count = u.count + 1,
    updated_at = now()
  WHERE u.count < p_limit
  RETURNING u.count INTO v_count;

  IF v_count IS NULL THEN
    SELECT u.count INTO v_count FROM public.user_daily_ai_usage u
    WHERE u.identifier = p_identifier
      AND u.identifier_type = p_identifier_type
      AND u.feature = p_feature
      AND u.usage_date = p_usage_date;
    RETURN QUERY SELECT false, COALESCE(v_count, p_limit);
  ELSE
    RETURN QUERY SELECT true, v_count;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_ai_usage(
  p_identifier text,
  p_identifier_type text,
  p_feature text,
  p_usage_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_daily_ai_usage
  SET count = GREATEST(count - 1, 0),
      updated_at = now()
  WHERE identifier = p_identifier
    AND identifier_type = p_identifier_type
    AND feature = p_feature
    AND usage_date = p_usage_date;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_ai_usage_if_under_limit(text,text,text,date,integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_ai_usage(text,text,text,date) TO anon, authenticated;
