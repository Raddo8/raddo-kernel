
-- accounts.billing_mode
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'manual'
  CHECK (billing_mode IN ('manual','auto_draft'));

-- revenue_schedules.invoice_separately
ALTER TABLE public.revenue_schedules
  ADD COLUMN IF NOT EXISTS invoice_separately boolean NOT NULL DEFAULT false;

-- Sequence table (per workspace + year) for gapless invoice numbers
CREATE TABLE IF NOT EXISTS public.invoice_number_sequences (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  year int NOT NULL,
  last_number int NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, year)
);
GRANT SELECT ON public.invoice_number_sequences TO authenticated;
GRANT ALL ON public.invoice_number_sequences TO service_role;
ALTER TABLE public.invoice_number_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members read sequences" ON public.invoice_number_sequences
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  billing_period date NOT NULL,           -- first of month
  billing_mode text NOT NULL DEFAULT 'manual' CHECK (billing_mode IN ('manual','auto_draft')),
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','auto_draft','issued','sent','paid','overdue','void')),
  paid_at timestamptz,
  paid_via text CHECK (paid_via IN ('stripe','bank','manual')),
  paid_note text,
  void_reason text,
  stripe_invoice_id text,
  stripe_payment_link text,
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS idx_invoices_workspace ON public.invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invoices_account ON public.invoices(account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_billing_period ON public.invoices(billing_period);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe ON public.invoices(stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read invoices" ON public.invoices FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members insert invoices" ON public.invoices FOR INSERT
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members update invoices" ON public.invoices FOR UPDATE
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members delete invoices" ON public.invoices FOR DELETE
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Invoice number generator RPC (gapless, per workspace per year)
CREATE OR REPLACE FUNCTION public.next_invoice_number(p_workspace_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := extract(year from now())::int;
  v_next int;
BEGIN
  IF NOT public.is_workspace_member(auth.uid(), p_workspace_id) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;
  INSERT INTO public.invoice_number_sequences (workspace_id, year, last_number)
  VALUES (p_workspace_id, v_year, 1)
  ON CONFLICT (workspace_id, year) DO UPDATE
    SET last_number = public.invoice_number_sequences.last_number + 1
  RETURNING last_number INTO v_next;
  RETURN 'COB-' || v_year::text || '-' || lpad(v_next::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO authenticated, service_role;
