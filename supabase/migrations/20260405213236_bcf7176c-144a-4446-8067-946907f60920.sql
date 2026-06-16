CREATE TABLE IF NOT EXISTS public.user_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  google_refresh_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_refresh_tokens ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_user_refresh_tokens_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_user_refresh_tokens_updated_at ON public.user_refresh_tokens;
CREATE TRIGGER set_user_refresh_tokens_updated_at
BEFORE UPDATE ON public.user_refresh_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_user_refresh_tokens_updated_at();

DROP POLICY IF EXISTS "Users can read their own refresh token" ON public.user_refresh_tokens;
CREATE POLICY "Users can read their own refresh token"
ON public.user_refresh_tokens
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own refresh token" ON public.user_refresh_tokens;
CREATE POLICY "Users can create their own refresh token"
ON public.user_refresh_tokens
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own refresh token" ON public.user_refresh_tokens;
CREATE POLICY "Users can update their own refresh token"
ON public.user_refresh_tokens
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own refresh token" ON public.user_refresh_tokens;
CREATE POLICY "Users can delete their own refresh token"
ON public.user_refresh_tokens
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);