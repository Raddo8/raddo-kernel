CREATE OR REPLACE FUNCTION public.scheduled_action_receipt(
  p_row public.scheduled_actions, p_phase text, p_detail jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into change_ledger (cid, tenancy, table_name, row_pk, pk_col, op, after_row, actor, actor_role, reason)
  values (p_row.cid, coalesce(p_row.tenancy,'TENANT'::tenancy_t), 'scheduled_actions', p_row.id::text, 'id',
          'UPDATE',
          jsonb_build_object('title', p_row.title, 'run_at', p_row.run_at,
                             'attempt', p_row.attempts, 'phase', p_phase) || coalesce(p_detail,'{}'::jsonb),
          'scheduled_actions_runner', 'runner',
          'runner:'||p_phase||coalesce(' · '||(p_detail->>'reason'), ''));
end $function$;