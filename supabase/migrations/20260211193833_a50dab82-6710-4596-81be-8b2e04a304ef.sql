CREATE TABLE public.suppression_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  email text NOT NULL,
  contact_id uuid,
  reason text NOT NULL,
  source text NOT NULL,
  scope text NOT NULL DEFAULT 'workspace',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email),
  CHECK (email = lower(email))
);

ALTER TABLE public.suppression_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view suppression_list"
  ON public.suppression_list FOR SELECT
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can insert suppression_list"
  ON public.suppression_list FOR INSERT
  WITH CHECK (is_workspace_member(auth.uid(), workspace_id));