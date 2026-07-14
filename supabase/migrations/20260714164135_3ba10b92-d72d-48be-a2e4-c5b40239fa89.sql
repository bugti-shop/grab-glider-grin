
CREATE TABLE public.smart_link_clicks (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  slug TEXT NOT NULL DEFAULT 'default',
  target TEXT NOT NULL,
  reached_store BOOLEAN NOT NULL DEFAULT false,
  os TEXT,
  os_version TEXT,
  device_type TEXT,
  device_vendor TEXT,
  device_model TEXT,
  browser TEXT,
  language TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  ip_hash TEXT,
  referrer TEXT,
  user_agent TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT
);

GRANT ALL ON public.smart_link_clicks TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.smart_link_clicks_id_seq TO service_role;

ALTER TABLE public.smart_link_clicks ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: all reads/writes go through edge functions (service_role).
CREATE INDEX smart_link_clicks_created_at_idx ON public.smart_link_clicks (created_at DESC);
CREATE INDEX smart_link_clicks_target_idx ON public.smart_link_clicks (target);
CREATE INDEX smart_link_clicks_country_idx ON public.smart_link_clicks (country);
