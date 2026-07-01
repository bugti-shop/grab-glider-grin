
REVOKE ALL ON FUNCTION public.match_note_chunks(vector, int, float) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_note_chunks(vector, int, float) TO authenticated;
