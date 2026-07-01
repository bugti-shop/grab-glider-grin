
CREATE OR REPLACE FUNCTION public.match_note_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 8,
  min_similarity float DEFAULT 0.35
)
RETURNS TABLE (
  note_id uuid,
  chunk_index int,
  title text,
  content text,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT ne.note_id,
         ne.chunk_index,
         ne.title,
         ne.content,
         1 - (ne.embedding <=> query_embedding) AS similarity
  FROM public.note_embeddings ne
  WHERE ne.user_id = auth.uid()
    AND 1 - (ne.embedding <=> query_embedding) >= min_similarity
  ORDER BY ne.embedding <=> query_embedding
  LIMIT match_count;
$$;
