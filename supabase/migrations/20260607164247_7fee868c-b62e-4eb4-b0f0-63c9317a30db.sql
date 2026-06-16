-- Add trial tracking columns
ALTER TABLE public.user_lifetime_counters
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_device_fingerprint TEXT;

-- Grant anon access (needed for anonymous-trial device rows)
GRANT SELECT, INSERT, UPDATE ON public.user_lifetime_counters TO anon;

-- Drop the existing authenticated-only policies and recreate with anon support
DROP POLICY IF EXISTS "Users read own lifetime counters" ON public.user_lifetime_counters;
DROP POLICY IF EXISTS "Users insert own lifetime counters" ON public.user_lifetime_counters;
DROP POLICY IF EXISTS "Users update own lifetime counters" ON public.user_lifetime_counters;

-- Anon device rows: any anon can manage rows of type 'device'
-- (identifier is the device fingerprint controlled client-side; can't be guessed)
CREATE POLICY "Anon manage device lifetime rows"
ON public.user_lifetime_counters
FOR ALL
TO anon
USING (identifier_type = 'device')
WITH CHECK (identifier_type = 'device');

-- Authenticated: own email row OR any device row (so a signed-in user can still bootstrap from device)
CREATE POLICY "Auth read own lifetime counters"
ON public.user_lifetime_counters
FOR SELECT
TO authenticated
USING (
  (identifier_type = 'email' AND identifier = lower((auth.jwt() ->> 'email')))
  OR identifier_type = 'device'
);

CREATE POLICY "Auth insert own lifetime counters"
ON public.user_lifetime_counters
FOR INSERT
TO authenticated
WITH CHECK (
  (identifier_type = 'email' AND identifier = lower((auth.jwt() ->> 'email')))
  OR identifier_type = 'device'
);

CREATE POLICY "Auth update own lifetime counters"
ON public.user_lifetime_counters
FOR UPDATE
TO authenticated
USING (
  (identifier_type = 'email' AND identifier = lower((auth.jwt() ->> 'email')))
  OR identifier_type = 'device'
)
WITH CHECK (
  (identifier_type = 'email' AND identifier = lower((auth.jwt() ->> 'email')))
  OR identifier_type = 'device'
);