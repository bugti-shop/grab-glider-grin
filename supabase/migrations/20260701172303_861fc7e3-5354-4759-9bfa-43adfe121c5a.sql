
-- Semantic search over notes: pgvector + per-chunk embeddings
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.note_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL,
  user_id uuid NOT NULL,
  chunk_index int NOT NULL DEFAULT 0,
  content text NOT NULL,
  title text,
  embedding vector(1536) NOT NULL,
  model text NOT NULL DEFAULT 'openai/text-embedding-3-small',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, chunk_index)
);

GRANT SELECT ON public.note_embeddings TO authenticated;
GRANT ALL ON public.note_embeddings TO service_role;

ALTER TABLE public.note_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own note embeddings"
  ON public.note_embeddings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS note_embeddings_user_note_idx
  ON public.note_embeddings (user_id, note_id);

CREATE INDEX IF NOT EXISTS note_embeddings_embedding_idx
  ON public.note_embeddings USING hnsw (embedding vector_cosine_ops);

-- Similarity search scoped to the caller's user
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
SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION public.match_note_chunks(vector, int, float) TO authenticated;
