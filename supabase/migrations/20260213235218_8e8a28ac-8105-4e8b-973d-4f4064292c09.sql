
-- =============================================
-- ST1 Phase 1, Migration 1: usage_events table
-- =============================================

-- Table
CREATE TABLE public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  action_id uuid NOT NULL REFERENCES public.actions(id),
  event_type text NOT NULL DEFAULT 'action_executed',
  channel text NOT NULL DEFAULT 'system',
  unit_count integer NOT NULL DEFAULT 1,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  billing_period text NOT NULL DEFAULT to_char(now(), 'YYYY-MM'),
  stripe_reported boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX idx_usage_events_workspace_period ON public.usage_events (workspace_id, billing_period);
CREATE INDEX idx_usage_events_recorded_at ON public.usage_events (recorded_at);

-- Enable RLS
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- PERMISSIVE SELECT: workspace members can view usage events
CREATE POLICY "Members can view usage_events"
ON public.usage_events
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (is_workspace_member(auth.uid(), workspace_id));

-- RESTRICTIVE DENY: block insert for authenticated and anon
CREATE POLICY "Deny insert on usage_events"
ON public.usage_events
AS RESTRICTIVE
FOR INSERT
TO authenticated, anon
WITH CHECK (false);

-- RESTRICTIVE DENY: block update for authenticated and anon
CREATE POLICY "Deny update on usage_events"
ON public.usage_events
AS RESTRICTIVE
FOR UPDATE
TO authenticated, anon
USING (false);

-- RESTRICTIVE DENY: block delete for authenticated and anon
CREATE POLICY "Deny delete on usage_events"
ON public.usage_events
AS RESTRICTIVE
FOR DELETE
TO authenticated, anon
USING (false);

-- Privilege revocation
REVOKE INSERT, UPDATE, DELETE ON public.usage_events FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.usage_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.usage_events FROM authenticated;

-- Grant SELECT to authenticated (RLS enforces workspace scoping)
GRANT SELECT ON public.usage_events TO authenticated;

-- Trigger: auto-meter completed actions
CREATE OR REPLACE FUNCTION public.record_usage_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    INSERT INTO public.usage_events (workspace_id, action_id, event_type, channel, billing_period)
    VALUES (
      NEW.workspace_id,
      NEW.id,
      'action_executed',
      COALESCE(NEW.channel, 'system'),
      to_char(now(), 'YYYY-MM')
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Pin ownership to postgres
ALTER FUNCTION public.record_usage_event() OWNER TO postgres;

-- Trigger on actions table
CREATE TRIGGER after_action_completed
  AFTER UPDATE ON public.actions
  FOR EACH ROW
  EXECUTE FUNCTION public.record_usage_event();
