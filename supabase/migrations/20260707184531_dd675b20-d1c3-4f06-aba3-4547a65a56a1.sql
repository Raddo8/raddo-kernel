
-- Onboarding checklist per account/phase
CREATE TABLE public.onboarding_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  phase text NOT NULL,
  label text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_checklist TO authenticated;
GRANT ALL ON public.onboarding_checklist TO service_role;
ALTER TABLE public.onboarding_checklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wm read onboarding_checklist" ON public.onboarding_checklist
  FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "wm insert onboarding_checklist" ON public.onboarding_checklist
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "wm update onboarding_checklist" ON public.onboarding_checklist
  FOR UPDATE TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "wm delete onboarding_checklist" ON public.onboarding_checklist
  FOR DELETE TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE TRIGGER onboarding_checklist_updated_at BEFORE UPDATE ON public.onboarding_checklist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE INDEX onboarding_checklist_account_phase_idx ON public.onboarding_checklist (account_id, phase, sort_order);

-- Project builds
CREATE TABLE public.project_builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('mini_site','platform','module','integration','other')),
  revenue_schedule_id uuid REFERENCES public.revenue_schedules(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'specd' CHECK (status IN ('specd','in_build','internal_qa','client_review','deployed','maintained')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_builds TO authenticated;
GRANT ALL ON public.project_builds TO service_role;
ALTER TABLE public.project_builds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wm read project_builds" ON public.project_builds
  FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "wm insert project_builds" ON public.project_builds
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "wm update project_builds" ON public.project_builds
  FOR UPDATE TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "wm delete project_builds" ON public.project_builds
  FOR DELETE TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE TRIGGER project_builds_updated_at BEFORE UPDATE ON public.project_builds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE INDEX project_builds_account_idx ON public.project_builds (account_id, status);
CREATE INDEX project_builds_workspace_idx ON public.project_builds (workspace_id, status);

-- Extend work_orders.order_type to include onboarding/build order types
ALTER TABLE public.work_orders DROP CONSTRAINT IF EXISTS work_orders_order_type_check;
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_order_type_check
  CHECK (order_type IN ('qualify_enrichment','deepdive','build_asset','prepare_send','draft_nudge','revisit','kernel_step','project_build'));
