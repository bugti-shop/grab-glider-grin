
CREATE TABLE IF NOT EXISTS public.email_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_part text NOT NULL UNIQUE,
  default_folder_id uuid REFERENCES public.folders(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_aliases_user_id_idx ON public.email_aliases(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS email_aliases_active_user_idx ON public.email_aliases(user_id) WHERE is_active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_aliases TO authenticated;
GRANT ALL ON public.email_aliases TO service_role;
ALTER TABLE public.email_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own aliases" ON public.email_aliases
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_email_aliases_updated_at BEFORE UPDATE ON public.email_aliases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
