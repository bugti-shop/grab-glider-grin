
CREATE TABLE public.page_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  referrer TEXT,
  source TEXT,
  user_agent TEXT,
  device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX page_events_created_at_idx ON public.page_events (created_at DESC);
CREATE INDEX page_events_session_idx ON public.page_events (session_id, created_at DESC);
CREATE INDEX page_events_path_idx ON public.page_events (path);

GRANT INSERT ON public.page_events TO anon, authenticated;
GRANT SELECT ON public.page_events TO authenticated;
GRANT ALL ON public.page_events TO service_role;

ALTER TABLE public.page_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can log pageview"
  ON public.page_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can read page events"
  ON public.page_events
  FOR SELECT
  TO authenticated
  USING (true);
