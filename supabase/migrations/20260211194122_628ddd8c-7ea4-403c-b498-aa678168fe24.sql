CREATE TABLE public.message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  action_id uuid,
  provider text NOT NULL DEFAULT 'resend',
  provider_message_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.message_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view message_events"
  ON public.message_events FOR SELECT
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX idx_message_events_provider_msg
  ON public.message_events (provider_message_id);