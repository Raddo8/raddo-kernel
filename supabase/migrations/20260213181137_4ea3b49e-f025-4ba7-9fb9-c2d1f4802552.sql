
-- suppression_list
CREATE POLICY "Deny update on suppression_list"
  ON public.suppression_list AS RESTRICTIVE
  FOR UPDATE TO authenticated, anon
  USING (false);

CREATE POLICY "Deny delete on suppression_list"
  ON public.suppression_list AS RESTRICTIVE
  FOR DELETE TO authenticated, anon
  USING (false);

REVOKE UPDATE, DELETE ON TABLE public.suppression_list FROM anon, authenticated;

-- message_events
CREATE POLICY "Deny insert on message_events"
  ON public.message_events AS RESTRICTIVE
  FOR INSERT TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "Deny update on message_events"
  ON public.message_events AS RESTRICTIVE
  FOR UPDATE TO authenticated, anon
  USING (false);

CREATE POLICY "Deny delete on message_events"
  ON public.message_events AS RESTRICTIVE
  FOR DELETE TO authenticated, anon
  USING (false);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.message_events FROM anon, authenticated;

-- timeline_events
CREATE POLICY "Deny update on timeline_events"
  ON public.timeline_events AS RESTRICTIVE
  FOR UPDATE TO authenticated, anon
  USING (false);

CREATE POLICY "Deny delete on timeline_events"
  ON public.timeline_events AS RESTRICTIVE
  FOR DELETE TO authenticated, anon
  USING (false);

REVOKE UPDATE, DELETE ON TABLE public.timeline_events FROM anon, authenticated;

-- scores
CREATE POLICY "Deny insert on scores"
  ON public.scores AS RESTRICTIVE
  FOR INSERT TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "Deny update on scores"
  ON public.scores AS RESTRICTIVE
  FOR UPDATE TO authenticated, anon
  USING (false);

CREATE POLICY "Deny delete on scores"
  ON public.scores AS RESTRICTIVE
  FOR DELETE TO authenticated, anon
  USING (false);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.scores FROM anon, authenticated;

-- workspace_members
CREATE POLICY "Deny update on workspace_members"
  ON public.workspace_members AS RESTRICTIVE
  FOR UPDATE TO authenticated, anon
  USING (false);

CREATE POLICY "Deny delete on workspace_members"
  ON public.workspace_members AS RESTRICTIVE
  FOR DELETE TO authenticated, anon
  USING (false);

REVOKE UPDATE, DELETE ON TABLE public.workspace_members FROM anon, authenticated;

-- workspaces
CREATE POLICY "Deny delete on workspaces"
  ON public.workspaces AS RESTRICTIVE
  FOR DELETE TO authenticated, anon
  USING (false);

REVOKE DELETE ON TABLE public.workspaces FROM anon, authenticated;
