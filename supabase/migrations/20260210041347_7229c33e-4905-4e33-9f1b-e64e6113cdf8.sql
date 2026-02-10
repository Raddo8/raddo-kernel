
-- Step 1: Drop existing RLS policies on policy_rules
DROP POLICY IF EXISTS "Members can view policy_rules" ON policy_rules;
DROP POLICY IF EXISTS "Members can manage policy_rules" ON policy_rules;

-- Step 2: Rename old table
ALTER TABLE policy_rules RENAME TO policy_rate_rules;

-- Step 3: Recreate RLS policies on renamed table
CREATE POLICY "Members can view policy_rate_rules"
  ON policy_rate_rules FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM policies p
    WHERE p.id = policy_rate_rules.policy_id
    AND is_workspace_member(auth.uid(), p.workspace_id)
  ));

CREATE POLICY "Members can manage policy_rate_rules"
  ON policy_rate_rules FOR ALL
  USING (EXISTS (
    SELECT 1 FROM policies p
    WHERE p.id = policy_rate_rules.policy_id
    AND is_workspace_member(auth.uid(), p.workspace_id)
  ));

-- Step 4: Create new RADDO policy_rules table
CREATE TABLE policy_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  vertical_pack_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 1000,
  predicate jsonb NOT NULL,
  action_type text NOT NULL,
  action_channel text NOT NULL,
  template_id text,
  delay_minutes integer,
  delay_seconds integer,
  requires_approval boolean NOT NULL DEFAULT false,
  contact_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_policy_rules_workspace_enabled
  ON policy_rules(workspace_id) WHERE enabled = true;

ALTER TABLE policy_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view policy_rules"
  ON policy_rules FOR SELECT
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can manage policy_rules"
  ON policy_rules FOR ALL
  USING (is_workspace_member(auth.uid(), workspace_id));

-- Step 5: Attach update_updated_at trigger to new table
CREATE TRIGGER update_policy_rules_updated_at
  BEFORE UPDATE ON policy_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
