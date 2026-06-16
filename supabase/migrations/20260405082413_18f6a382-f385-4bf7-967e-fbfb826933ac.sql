
CREATE TABLE public.onboarding_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT,
  user_email TEXT,
  language TEXT,
  goals JSONB DEFAULT '[]'::jsonb,
  source TEXT,
  previous_app TEXT,
  frustration TEXT,
  task_view_preference TEXT,
  journey_selected TEXT,
  devices JSONB DEFAULT '[]'::jsonb,
  offline_preference TEXT,
  unfinished_reason TEXT,
  slowdown_reason TEXT,
  why_apps_fail TEXT,
  user_name TEXT,
  note_created BOOLEAN DEFAULT false,
  sketch_created BOOLEAN DEFAULT false,
  tasks_created_count INTEGER DEFAULT 0,
  notes_folders_count INTEGER DEFAULT 0,
  tasks_folders_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert onboarding responses"
ON public.onboarding_responses
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Anyone can read onboarding responses"
ON public.onboarding_responses
FOR SELECT
TO authenticated
USING (true);
