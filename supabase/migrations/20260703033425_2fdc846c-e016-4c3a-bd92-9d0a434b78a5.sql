
CREATE TABLE IF NOT EXISTS public.user_feature_tours (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tour_id TEXT NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_forever BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tour_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_feature_tours TO authenticated;
GRANT ALL ON public.user_feature_tours TO service_role;

ALTER TABLE public.user_feature_tours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tour state"
  ON public.user_feature_tours
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_feature_tours_user_idx ON public.user_feature_tours(user_id);
