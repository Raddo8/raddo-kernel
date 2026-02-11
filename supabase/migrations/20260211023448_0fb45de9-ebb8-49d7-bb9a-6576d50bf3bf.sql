
-- Ensure RLS is enabled (idempotent)
ALTER TABLE public.connector_accounts ENABLE ROW LEVEL SECURITY;

-- Drop broad ALL policy
DROP POLICY IF EXISTS "Members can manage connector_accounts" ON public.connector_accounts;

-- Idempotency guards for new policies
DROP POLICY IF EXISTS "Members can insert connector_accounts" ON public.connector_accounts;
DROP POLICY IF EXISTS "Members can update connector_accounts" ON public.connector_accounts;
DROP POLICY IF EXISTS "Members can delete connector_accounts" ON public.connector_accounts;

-- INSERT: membership + same workspace (single join-based EXISTS)
CREATE POLICY "Members can insert connector_accounts"
ON public.connector_accounts
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.connectors c
    JOIN public.accounts a ON a.id = connector_accounts.account_id
    WHERE c.id = connector_accounts.connector_id
      AND c.workspace_id = a.workspace_id
      AND public.is_workspace_member(auth.uid(), c.workspace_id)
  )
);

-- UPDATE: membership on existing row + same workspace on new values
CREATE POLICY "Members can update connector_accounts"
ON public.connector_accounts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.connectors c
    WHERE c.id = connector_accounts.connector_id
      AND public.is_workspace_member(auth.uid(), c.workspace_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.connectors c
    JOIN public.accounts a ON a.id = connector_accounts.account_id
    WHERE c.id = connector_accounts.connector_id
      AND c.workspace_id = a.workspace_id
      AND public.is_workspace_member(auth.uid(), c.workspace_id)
  )
);

-- DELETE: membership check only
CREATE POLICY "Members can delete connector_accounts"
ON public.connector_accounts
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.connectors c
    WHERE c.id = connector_accounts.connector_id
      AND public.is_workspace_member(auth.uid(), c.workspace_id)
  )
);
