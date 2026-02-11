-- 1. Idempotency: one row per (provider, message, event_type)
-- provider_message_id is already NOT NULL, so no partial index needed
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_events_idempotent
  ON public.message_events (provider, provider_message_id, event_type);

-- 2. Queryable recipient email column
ALTER TABLE public.message_events
  ADD COLUMN IF NOT EXISTS recipient_email text;