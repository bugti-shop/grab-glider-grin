CREATE POLICY "Users read own daily AI usage by uid"
ON public.user_daily_ai_usage
FOR SELECT
TO authenticated
USING (identifier_type = 'user' AND identifier = auth.uid()::text);