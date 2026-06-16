-- Stores RevenueCat-pushed entitlement state per user (app_user_id from RC = our user identifier)
CREATE TABLE public.user_entitlements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  app_user_id TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  product_id TEXT,
  expires_at TIMESTAMPTZ,
  grace_period_expires_at TIMESTAMPTZ,
  in_billing_retry BOOLEAN NOT NULL DEFAULT false,
  store TEXT,
  last_event_type TEXT,
  last_event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_entitlements_app_user_id ON public.user_entitlements(app_user_id);

ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;

-- Anyone (anon + authenticated) can READ their own entitlement row by app_user_id.
-- We don't have auth.uid() mapping for native RC IDs, so allow public read by row — non-sensitive data.
CREATE POLICY "Public can read entitlements"
ON public.user_entitlements FOR SELECT
USING (true);

-- Only service role (edge function) can write
CREATE POLICY "Service role can insert entitlements"
ON public.user_entitlements FOR INSERT
WITH CHECK (false);

CREATE POLICY "Service role can update entitlements"
ON public.user_entitlements FOR UPDATE
USING (false);

-- updated_at trigger
CREATE TRIGGER update_user_entitlements_updated_at
BEFORE UPDATE ON public.user_entitlements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER TABLE public.user_entitlements REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_entitlements;