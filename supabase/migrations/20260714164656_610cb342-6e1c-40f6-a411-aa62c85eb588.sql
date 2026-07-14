
ALTER TABLE public.smart_link_clicks
  ADD COLUMN IF NOT EXISTS click_id UUID UNIQUE DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conversion_platform TEXT,
  ADD COLUMN IF NOT EXISTS conversion_install_referrer TEXT,
  ADD COLUMN IF NOT EXISTS conversion_device_hash TEXT;

CREATE INDEX IF NOT EXISTS smart_link_clicks_click_id_idx ON public.smart_link_clicks (click_id);
CREATE INDEX IF NOT EXISTS smart_link_clicks_converted_at_idx ON public.smart_link_clicks (converted_at DESC);

CREATE TABLE IF NOT EXISTS public.smart_link_conversions (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  click_id UUID,
  platform TEXT,
  install_referrer TEXT,
  device_hash TEXT,
  app_version TEXT,
  user_agent TEXT,
  country TEXT,
  matched BOOLEAN NOT NULL DEFAULT false
);

GRANT ALL ON public.smart_link_conversions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.smart_link_conversions_id_seq TO service_role;

ALTER TABLE public.smart_link_conversions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS smart_link_conversions_created_at_idx ON public.smart_link_conversions (created_at DESC);
CREATE INDEX IF NOT EXISTS smart_link_conversions_click_id_idx ON public.smart_link_conversions (click_id);
CREATE INDEX IF NOT EXISTS smart_link_conversions_device_hash_idx ON public.smart_link_conversions (device_hash);
