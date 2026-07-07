
CREATE TABLE public.revenue_occurrence_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.revenue_schedules(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  occurrence_month date NOT NULL,
  override_kind text NOT NULL CHECK (override_kind IN ('skip','move','adjust_amount','mark_paid')),
  new_date date,
  new_amount_usd numeric,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, occurrence_month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.revenue_occurrence_overrides TO authenticated;
GRANT ALL ON public.revenue_occurrence_overrides TO service_role;

ALTER TABLE public.revenue_occurrence_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read overrides"
  ON public.revenue_occurrence_overrides FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "workspace members write overrides"
  ON public.revenue_occurrence_overrides FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "workspace members update overrides"
  ON public.revenue_occurrence_overrides FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "workspace members delete overrides"
  ON public.revenue_occurrence_overrides FOR DELETE
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX idx_rev_overrides_schedule ON public.revenue_occurrence_overrides(schedule_id);
CREATE INDEX idx_rev_overrides_workspace ON public.revenue_occurrence_overrides(workspace_id);

CREATE TRIGGER trg_rev_overrides_updated_at
  BEFORE UPDATE ON public.revenue_occurrence_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
