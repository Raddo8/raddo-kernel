-- HNSW cosine indexes · must match the <=> operator used by world_search_v1.
CREATE INDEX IF NOT EXISTS world_claims_embedding_hnsw
  ON public.world_claims USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS memory_entries_embedding_hnsw
  ON public.memory_entries USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS storyline_embedding_hnsw
  ON public.storyline USING hnsw (embedding vector_cosine_ops);

-- Keep embeddings current · same pattern as the eleven existing cron jobs.
SELECT cron.unschedule('embed-backfill-10min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'embed-backfill-10min');

SELECT cron.schedule(
  'embed-backfill-10min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vacpgxxgdfhgvkduljgs.supabase.co/functions/v1/embed-backfill',
    headers := public.get_cron_headers(),
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);