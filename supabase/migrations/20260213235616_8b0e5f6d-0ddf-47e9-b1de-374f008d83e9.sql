
-- =============================================
-- Migration 2: workspace_billing (corrected)
-- =============================================

-- 1. Create workspace_billing table
CREATE TABLE public.workspace_billing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id),
  plan text NOT NULL DEFAULT 'free',
  monthly_action_limit integer NOT NULL DEFAULT 100,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.workspace_billing ENABLE ROW LEVEL SECURITY;

-- 3. Permissive SELECT for workspace members
CREATE POLICY "Members can view workspace_billing"
ON public.workspace_billing
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (is_workspace_member(auth.uid(), workspace_id));

-- 4. Permissive UPDATE with WITH CHECK (fixes critical gap)
CREATE POLICY "Members can update workspace_billing"
ON public.workspace_billing
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (is_workspace_member(auth.uid(), workspace_id))
WITH CHECK (is_workspace_member(auth.uid(), workspace_id));

-- 5. Restrictive DENY INSERT (service_role only)
CREATE POLICY "Deny insert on workspace_billing"
ON public.workspace_billing
AS RESTRICTIVE
FOR INSERT
TO authenticated, anon
WITH CHECK (false);

-- 6. Restrictive DENY DELETE (service_role only)
CREATE POLICY "Deny delete on workspace_billing"
ON public.workspace_billing
AS RESTRICTIVE
FOR DELETE
TO authenticated, anon
USING (false);

-- 7. Privilege hardening: revoke everything, then grant only what's needed
REVOKE ALL ON TABLE public.workspace_billing FROM PUBLIC;
REVOKE ALL ON TABLE public.workspace_billing FROM anon;
REVOKE ALL ON TABLE public.workspace_billing FROM authenticated;

GRANT SELECT, UPDATE ON TABLE public.workspace_billing TO authenticated;

-- 8. Timestamp trigger (update_updated_at already exists, owned by postgres, verified)
CREATE TRIGGER update_workspace_billing_updated_at
BEFORE UPDATE ON public.workspace_billing
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- 9. Seed existing workspaces with default free plan
INSERT INTO public.workspace_billing (workspace_id, plan, monthly_action_limit)
SELECT id, 'free', 100
FROM public.workspaces
WHERE id NOT IN (SELECT workspace_id FROM public.workspace_billing);
