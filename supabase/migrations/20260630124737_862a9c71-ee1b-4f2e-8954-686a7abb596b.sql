
CREATE TABLE public.business_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  work_email TEXT NOT NULL,
  role TEXT,
  audience TEXT NOT NULL CHECK (audience IN ('school','team','agency','other')),
  team_size INT NOT NULL CHECK (team_size > 0 AND team_size <= 100000),
  use_case TEXT,
  message TEXT,
  source TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT INSERT ON public.business_leads TO anon, authenticated;
GRANT SELECT ON public.business_leads TO authenticated;
GRANT ALL ON public.business_leads TO service_role;

ALTER TABLE public.business_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a business lead"
  ON public.business_leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(company_name) BETWEEN 1 AND 200
    AND char_length(contact_name) BETWEEN 1 AND 200
    AND char_length(work_email) BETWEEN 3 AND 320
    AND (message IS NULL OR char_length(message) <= 4000)
    AND (use_case IS NULL OR char_length(use_case) <= 1000)
  );

CREATE POLICY "Submitters can read their own lead"
  ON public.business_leads
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid());
