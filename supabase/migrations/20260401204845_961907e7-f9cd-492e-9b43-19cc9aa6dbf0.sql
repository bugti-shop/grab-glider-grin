
-- Drop the overly permissive policy — service role bypasses RLS anyway
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.subscriptions;
