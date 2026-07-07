CREATE TABLE public.revenue_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('one_time','subscription')),
  description TEXT NOT NULL,
  amount_usd NUMERIC(12,2) NOT NULL,
  cadence TEXT NOT NULL CHECK (cadence IN ('once','monthly')),
  start_date DATE,
  end_date DATE,
  next_due DATE,
  status TEXT NOT NULL DEFAULT 'expected' CHECK (status IN ('expected','agreement_pending','invoiced','active','paid','overdue','cancelled')),
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  stripe_subscription_id TEXT,
  stripe_invoice_id TEXT,
  stripe_payment_link TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.revenue_schedules TO authenticated;
GRANT ALL ON public.revenue_schedules TO service_role;

ALTER TABLE public.revenue_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read revenue_schedules"
  ON public.revenue_schedules FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "workspace members insert revenue_schedules"
  ON public.revenue_schedules FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "workspace members update revenue_schedules"
  ON public.revenue_schedules FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "workspace operators delete revenue_schedules"
  ON public.revenue_schedules FOR DELETE
  TO authenticated
  USING (public.is_operator(auth.uid()) AND public.is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX idx_revenue_schedules_workspace ON public.revenue_schedules(workspace_id);
CREATE INDEX idx_revenue_schedules_account ON public.revenue_schedules(account_id);
CREATE INDEX idx_revenue_schedules_item ON public.revenue_schedules(item_id);
CREATE INDEX idx_revenue_schedules_next_due ON public.revenue_schedules(next_due) WHERE next_due IS NOT NULL;
CREATE INDEX idx_revenue_schedules_stripe_sub ON public.revenue_schedules(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

CREATE TRIGGER update_revenue_schedules_updated_at
  BEFORE UPDATE ON public.revenue_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();