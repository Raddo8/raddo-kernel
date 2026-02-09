
-- Step 3: Database Migration + Safety Hardening
-- Corrections applied: no 'queued' status, workspace_id server-only, explicit RLS, indexes

-- A1. Expand action_status enum (no 'queued' — unused)
ALTER TYPE public.action_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE public.action_status ADD VALUE IF NOT EXISTS 'canceled';

-- A2. New columns on actions table
ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS workspace_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.templates(id),
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS trigger_state text,
  ADD COLUMN IF NOT EXISTS playbook_step_id uuid REFERENCES public.playbook_steps(id),
  ADD COLUMN IF NOT EXISTS claimed_by uuid,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- A3. Trigger to auto-populate workspace_id (server-assigned only)
CREATE OR REPLACE FUNCTION public.set_action_workspace_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT workspace_id INTO NEW.workspace_id
  FROM public.items
  WHERE id = NEW.item_id;

  IF NEW.workspace_id IS NULL THEN
    RAISE EXCEPTION 'Item % not found or has no workspace_id', NEW.item_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_action_workspace_id
BEFORE INSERT ON public.actions
FOR EACH ROW
EXECUTE FUNCTION public.set_action_workspace_id();

-- A4. Backfill existing rows
UPDATE public.actions a
SET workspace_id = i.workspace_id
FROM public.items i
WHERE a.item_id = i.id
AND a.workspace_id IS NULL;

-- Make workspace_id NOT NULL after backfill
ALTER TABLE public.actions
  ALTER COLUMN workspace_id SET NOT NULL;

-- A5. FK for workspace_id
ALTER TABLE public.actions
  ADD CONSTRAINT actions_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);

-- A6. Unique index for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS actions_idempotency_uq
ON public.actions (workspace_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

-- A7. Performance indexes
CREATE INDEX IF NOT EXISTS idx_actions_workspace_status_scheduled
ON public.actions (workspace_id, status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_actions_item_status_scheduled
ON public.actions (item_id, status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_timeline_events_item_occurred
ON public.timeline_events (item_id, occurred_at DESC);

-- A8. RLS: Replace broad FOR ALL with explicit SELECT/INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Members can manage actions" ON public.actions;
DROP POLICY IF EXISTS "Members can view actions" ON public.actions;

CREATE POLICY "Members can view actions"
ON public.actions
FOR SELECT
USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can insert actions"
ON public.actions
FOR INSERT
WITH CHECK (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can update actions"
ON public.actions
FOR UPDATE
USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can delete actions"
ON public.actions
FOR DELETE
USING (is_workspace_member(auth.uid(), workspace_id));
