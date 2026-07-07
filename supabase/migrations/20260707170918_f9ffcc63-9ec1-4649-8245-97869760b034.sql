
-- 1. Category column on item_states.
ALTER TABLE public.item_states
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'pursuit';

-- 2. Remove Casey collections states from the BD workspace ONLY.
--    (No items in BD reference them; verified pre-migration.)
DELETE FROM public.item_states
WHERE workspace_id = 'b0c00b00-0000-4000-8000-000000000001'
  AND name IN (
    'new','reminder_sent','past_due','verification_requested',
    'disputed','payment_plan','credit_hold','escalated','paid','closed'
  );

-- 3. Rename parked → case_open and lost → case_closed in BD workspace.
UPDATE public.item_states
   SET name = 'case_open',
       label = 'Case Open · revisit',
       sort_order = 90
 WHERE workspace_id = 'b0c00b00-0000-4000-8000-000000000001'
   AND name = 'parked';

UPDATE public.item_states
   SET name = 'case_closed',
       label = 'Case Closed · do not contact',
       sort_order = 100
 WHERE workspace_id = 'b0c00b00-0000-4000-8000-000000000001'
   AND name = 'lost';

-- 4. Seed client_ops ladder for BD workspace.
INSERT INTO public.item_states (workspace_id, name, label, color, sort_order, category)
SELECT 'b0c00b00-0000-4000-8000-000000000001', v.name, v.label, v.color, v.sort_order, 'client_ops'
FROM (VALUES
  ('client_onboarding', 'Onboarding',      '#EF9F27', 200),
  ('client_active',     'Active',          '#22C55E', 210),
  ('client_attention',  'Needs Attention', '#EAB308', 220),
  ('client_payment',    'Payment Issue',   '#EF4444', 230),
  ('client_atrisk',     'At Risk',         '#F97316', 240),
  ('client_renewal',    'Renewal',         '#3B82F6', 250),
  ('client_offboarded', 'Offboarded',      '#6B7280', 260)
) AS v(name, label, color, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.item_states s
  WHERE s.workspace_id = 'b0c00b00-0000-4000-8000-000000000001'
    AND s.name = v.name
);
