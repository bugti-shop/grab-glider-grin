
-- 1) AI usage RPCs: derive identifier from session, don't trust caller
CREATE OR REPLACE FUNCTION public.increment_ai_usage_if_under_limit(
  p_identifier text, p_identifier_type text, p_feature text, p_usage_date date, p_limit integer
)
RETURNS TABLE(allowed boolean, new_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(nullif(auth.jwt() ->> 'email', ''), ''));
  v_identifier text := p_identifier;
BEGIN
  -- Enforce that the identifier matches the authenticated session.
  IF p_identifier_type = 'user_id' THEN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    v_identifier := v_uid::text;
  ELSIF p_identifier_type = 'email' THEN
    IF v_email = '' THEN RAISE EXCEPTION 'auth email required'; END IF;
    v_identifier := v_email;
  ELSIF p_identifier_type = 'device_id' THEN
    -- Anonymous device counters only (signed-in users must use user_id/email).
    IF v_uid IS NOT NULL THEN RAISE EXCEPTION 'signed-in users must use user_id/email'; END IF;
    IF p_identifier IS NULL OR length(trim(p_identifier)) = 0 THEN
      RAISE EXCEPTION 'device_id required';
    END IF;
    v_identifier := p_identifier;
  ELSE
    RAISE EXCEPTION 'invalid identifier_type';
  END IF;

  INSERT INTO public.user_daily_ai_usage AS u
    (identifier, identifier_type, feature, usage_date, count)
  VALUES (v_identifier, p_identifier_type, p_feature, p_usage_date, 1)
  ON CONFLICT (identifier, identifier_type, feature, usage_date)
  DO UPDATE SET count = u.count + 1, updated_at = now()
  WHERE u.count < p_limit
  RETURNING u.count INTO v_count;

  IF v_count IS NULL THEN
    SELECT u.count INTO v_count FROM public.user_daily_ai_usage u
    WHERE u.identifier = v_identifier
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
  p_identifier text, p_identifier_type text, p_feature text, p_usage_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(nullif(auth.jwt() ->> 'email', ''), ''));
  v_identifier text := p_identifier;
BEGIN
  IF p_identifier_type = 'user_id' THEN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    v_identifier := v_uid::text;
  ELSIF p_identifier_type = 'email' THEN
    IF v_email = '' THEN RAISE EXCEPTION 'auth email required'; END IF;
    v_identifier := v_email;
  ELSIF p_identifier_type = 'device_id' THEN
    IF v_uid IS NOT NULL THEN RAISE EXCEPTION 'signed-in users must use user_id/email'; END IF;
    IF p_identifier IS NULL OR length(trim(p_identifier)) = 0 THEN
      RAISE EXCEPTION 'device_id required';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid identifier_type';
  END IF;

  UPDATE public.user_daily_ai_usage
  SET count = GREATEST(count - 1, 0), updated_at = now()
  WHERE identifier = v_identifier
    AND identifier_type = p_identifier_type
    AND feature = p_feature
    AND usage_date = p_usage_date;
END;
$$;

-- 2) Admin role system
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
