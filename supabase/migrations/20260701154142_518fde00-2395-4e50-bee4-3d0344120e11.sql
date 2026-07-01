
CREATE TABLE public.public_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  cover_image text,
  view_count integer NOT NULL DEFAULT 0,
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, note_id)
);

CREATE INDEX idx_public_notes_slug ON public.public_notes (slug);
CREATE INDEX idx_public_notes_user ON public.public_notes (user_id);

GRANT SELECT ON public.public_notes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_notes TO authenticated;
GRANT ALL ON public.public_notes TO service_role;

ALTER TABLE public.public_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read published notes"
  ON public.public_notes FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Owners can insert their published notes"
  ON public.public_notes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update their published notes"
  ON public.public_notes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can delete their published notes"
  ON public.public_notes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_public_notes_updated_at
  BEFORE UPDATE ON public.public_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
