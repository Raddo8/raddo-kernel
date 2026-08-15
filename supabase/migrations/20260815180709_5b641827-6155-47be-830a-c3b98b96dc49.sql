-- HARDEN-10 · K3(c) · the description on the manifest is generated, not typed.
CREATE OR REPLACE FUNCTION public.tool_manifest_descriptions()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT coalesce(jsonb_object_agg(t.tool_key, d.text), '{}'::jsonb)
    FROM tool_catalog t
    CROSS JOIN LATERAL (
      SELECT concat_ws(E'\n',
        nullif(btrim(coalesce(t.purpose, '')), ''),
        CASE WHEN coalesce(btrim(coalesce(t.reads,'')),'') <> ''
             THEN 'Reads: ' || t.reads END,
        CASE WHEN coalesce(btrim(coalesce(t.writes,'')),'') <> ''
             THEN 'Writes: ' || t.writes
             ELSE 'Writes: nothing.' END,
        nullif(btrim(coalesce(t.degraded_behavior, '')), '')
      ) AS text) d
   WHERE coalesce(btrim(concat(t.purpose, t.degraded_behavior, t.reads, t.writes)), '') <> '';
$$;
GRANT EXECUTE ON FUNCTION public.tool_manifest_descriptions() TO authenticated, service_role;