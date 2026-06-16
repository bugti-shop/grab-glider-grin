-- Track lifetime creation counts for free-tier limits across devices/reinstalls
CREATE TABLE public.user_lifetime_counters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL,
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('email', 'device')),
  notes_created INTEGER NOT NULL DEFAULT 0,
  tasks_created INTEGER NOT NULL DEFAULT 0,
  note_folders_created INTEGER NOT NULL DEFAULT 0,
  task_folders_created INTEGER NOT NULL DEFAULT 0,
  task_sections_created INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (identifier, identifier_type)
);

CREATE INDEX idx_user_lifetime_counters_identifier ON public.user_lifetime_counters(identifier, identifier_type);

ALTER TABLE public.user_lifetime_counters ENABLE ROW LEVEL SECURITY;

-- Anyone (anon + authenticated) can read/write their own counter row.
-- We can't tie this to auth.uid() because free users may not be logged in,
-- so identification is by email or device_id (client-supplied).
CREATE POLICY "Anyone can read lifetime counters"
ON public.user_lifetime_counters
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Anyone can insert lifetime counters"
ON public.user_lifetime_counters
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Anyone can update lifetime counters"
ON public.user_lifetime_counters
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE TRIGGER update_user_lifetime_counters_updated_at
BEFORE UPDATE ON public.user_lifetime_counters
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();