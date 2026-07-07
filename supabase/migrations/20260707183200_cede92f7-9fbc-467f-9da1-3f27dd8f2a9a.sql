
CREATE TABLE public.work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  order_type text NOT NULL CHECK (order_type IN ('qualify_enrichment','deepdive','build_asset','prepare_send','draft_nudge','revisit')),
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','claimed','in_progress','done','failed','cancelled')),
  created_by text NOT NULL DEFAULT 'manual' CHECK (created_by IN ('manual','autopilot','playbook')),
  claimed_by text,
  claimed_at timestamptz,
  completed_at timestamptz,
  result_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_orders TO authenticated;
GRANT ALL ON public.work_orders TO service_role;

ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read work_orders"
  ON public.work_orders FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "workspace members insert work_orders"
  ON public.work_orders FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "workspace members update work_orders"
  ON public.work_orders FOR UPDATE TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "workspace members delete work_orders"
  ON public.work_orders FOR DELETE TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE TRIGGER work_orders_updated_at
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX work_orders_item_status_idx ON public.work_orders (item_id, status);
CREATE INDEX work_orders_workspace_status_idx ON public.work_orders (workspace_id, status);
