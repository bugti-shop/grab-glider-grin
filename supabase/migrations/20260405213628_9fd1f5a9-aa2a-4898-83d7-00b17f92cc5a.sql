DROP POLICY IF EXISTS "Users can read their own refresh token" ON public.user_refresh_tokens;

CREATE POLICY "No direct read access to refresh tokens"
ON public.user_refresh_tokens
FOR SELECT
TO authenticated
USING (false);