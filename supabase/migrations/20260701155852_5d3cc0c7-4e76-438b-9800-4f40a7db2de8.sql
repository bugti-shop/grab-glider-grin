
ALTER TABLE public.public_notes
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz;

CREATE OR REPLACE FUNCTION public.record_public_note_view(p_slug text)
RETURNS TABLE(view_count integer, last_viewed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.public_notes
     SET view_count = COALESCE(view_count, 0) + 1,
         last_viewed_at = now()
   WHERE slug = p_slug
  RETURNING public_notes.view_count, public_notes.last_viewed_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_public_note_view(text) TO anon, authenticated;
