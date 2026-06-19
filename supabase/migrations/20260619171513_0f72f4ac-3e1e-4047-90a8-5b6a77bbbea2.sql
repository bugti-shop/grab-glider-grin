
-- 1. Add payload column to habits for full non-destructive sync (completions, reminders, etc.)
ALTER TABLE public.habits ADD COLUMN IF NOT EXISTS payload JSONB;

-- 2. Countdowns table
CREATE TABLE IF NOT EXISTS public.countdowns (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  event_date DATE,
  event_type TEXT,
  repeat TEXT,
  payload JSONB,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.countdowns TO authenticated;
GRANT ALL ON public.countdowns TO service_role;
ALTER TABLE public.countdowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own countdowns" ON public.countdowns
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_countdowns_user_updated ON public.countdowns(user_id, updated_at);
ALTER TABLE public.countdowns REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.countdowns;

-- 3. Habit sections table
CREATE TABLE IF NOT EXISTS public.habit_sections (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  order_index DOUBLE PRECISION NOT NULL DEFAULT 0,
  payload JSONB,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habit_sections TO authenticated;
GRANT ALL ON public.habit_sections TO service_role;
ALTER TABLE public.habit_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own habit_sections" ON public.habit_sections
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_habit_sections_user_updated ON public.habit_sections(user_id, updated_at);
ALTER TABLE public.habit_sections REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.habit_sections;

-- 4. Standard updated_at preservation trigger (same as tasks/notes)
CREATE OR REPLACE FUNCTION public.sync_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.updated_at IS NULL OR NEW.updated_at = OLD.updated_at THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_countdowns_updated_at ON public.countdowns;
CREATE TRIGGER trg_countdowns_updated_at BEFORE UPDATE ON public.countdowns
  FOR EACH ROW EXECUTE FUNCTION public.sync_set_updated_at();

DROP TRIGGER IF EXISTS trg_habit_sections_updated_at ON public.habit_sections;
CREATE TRIGGER trg_habit_sections_updated_at BEFORE UPDATE ON public.habit_sections
  FOR EACH ROW EXECUTE FUNCTION public.sync_set_updated_at();
