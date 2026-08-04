CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE OR REPLACE FUNCTION public.world_resolve_entity_v1(
  p_cid text,
  p_etype text,
  p_name text,
  p_keys jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_name text := lower(btrim(coalesce(p_name, '')));
  v_keys jsonb := coalesce(p_keys, '[]'::jsonb);
BEGIN
  IF p_cid IS NULL OR btrim(p_cid) = '' THEN
    RETURN jsonb_build_object('mode', 'none', 'entity_id', NULL);
  END IF;

  -- (a1) deterministic attach on any overlapping resolution key
  IF jsonb_typeof(v_keys) = 'array' AND jsonb_array_length(v_keys) > 0 THEN
    SELECT e.id INTO v_id
    FROM public.world_entities e
    WHERE e.cid = p_cid
      AND e.status <> 'retired'
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_keys) k(v)
        WHERE e.resolution_keys ? k.v
      )
    ORDER BY e.created_at
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN jsonb_build_object('mode', 'key', 'entity_id', v_id);
    END IF;
  END IF;

  -- (a2) exact (etype, lower(name))
  SELECT e.id INTO v_id
  FROM public.world_entities e
  WHERE e.cid = p_cid
    AND e.etype = p_etype
    AND lower(btrim(e.name)) = v_name
    AND e.status <> 'retired'
  ORDER BY e.created_at
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('mode', 'exact', 'entity_id', v_id);
  END IF;

  -- (b) trigram near-match within cid
  SELECT e.id INTO v_id
  FROM public.world_entities e
  WHERE e.cid = p_cid
    AND e.status <> 'retired'
    AND similarity(lower(btrim(e.name)), v_name) >= 0.6
  ORDER BY similarity(lower(btrim(e.name)), v_name) DESC, e.created_at
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('mode', 'fuzzy', 'entity_id', v_id);
  END IF;

  RETURN jsonb_build_object('mode', 'none', 'entity_id', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.world_resolve_entity_v1(text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.world_resolve_entity_v1(text, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.world_resolve_entity_v1(text, text, text, jsonb) FROM authenticated;
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.world_resolve_entity_v1(text, text, text, jsonb) FROM sandbox_exec';
  END IF;
END
$do$;
GRANT EXECUTE ON FUNCTION public.world_resolve_entity_v1(text, text, text, jsonb) TO service_role;