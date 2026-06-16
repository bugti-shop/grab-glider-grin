-- Daily AI usage counters per identifier+feature+date
CREATE TABLE IF NOT EXISTS public.user_daily_ai_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL,
  identifier_type TEXT NOT NULL,
  feature TEXT NOT NULL,
  usage_date DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (identifier, identifier_type, feature, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_user_daily_ai_usage_lookup
  ON public.user_daily_ai_usage (identifier, identifier_type, feature, usage_date);

ALTER TABLE public.user_daily_ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read daily AI usage"
  ON public.user_daily_ai_usage
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert daily AI usage"
  ON public.user_daily_ai_usage
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update daily AI usage"
  ON public.user_daily_ai_usage
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_user_daily_ai_usage_updated_at
  BEFORE UPDATE ON public.user_daily_ai_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();