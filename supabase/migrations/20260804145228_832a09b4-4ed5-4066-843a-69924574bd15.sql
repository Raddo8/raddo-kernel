
CREATE OR REPLACE FUNCTION public.memory_signal(p_tenant text, p_entity_id uuid, p_change text, p_summary text, p_actor text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_change text; v_actor text; v_summary text;
BEGIN
  v_change := CASE WHEN p_change IN ('created','edited') THEN p_change ELSE 'status' END;
  v_actor  := CASE WHEN lower(coalesce(p_actor,'')) IN ('client','cob','hq') THEN lower(p_actor) ELSE 'cob' END;
  v_summary := CASE WHEN v_change = 'status' THEN p_change || ' :: ' ELSE '' END
             || coalesce(p_summary,'')
             || CASE WHEN p_actor IS NOT NULL AND lower(p_actor) NOT IN ('client','cob','hq')
                     THEN ' [by ' || p_actor || ']' ELSE '' END;
  INSERT INTO public.change_log (tenant_id, entity, entity_id, change, summary, actor)
  VALUES (p_tenant, 'memory', p_entity_id, v_change, left(v_summary, 500), v_actor)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.memory_signal(text,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.memory_signal(text,uuid,text,text,text) TO service_role;
