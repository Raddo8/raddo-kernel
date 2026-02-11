ALTER TABLE public.actions
  ADD COLUMN provider text,
  ADD COLUMN provider_message_id text;

CREATE INDEX idx_actions_provider_message
  ON public.actions (provider, provider_message_id);