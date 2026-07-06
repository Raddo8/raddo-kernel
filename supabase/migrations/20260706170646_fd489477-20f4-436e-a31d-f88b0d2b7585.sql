
CREATE TABLE public.site_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  route text,
  event text NOT NULL,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  session_id text
);

GRANT INSERT ON public.site_events TO anon;
GRANT INSERT, SELECT ON public.site_events TO authenticated;
GRANT ALL ON public.site_events TO service_role;

ALTER TABLE public.site_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can insert site events"
  ON public.site_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated can read site events"
  ON public.site_events FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX site_events_ts_idx ON public.site_events (ts DESC);
CREATE INDEX site_events_event_idx ON public.site_events (event);
