-- 1. FOLDER HEAT · attention score per folder, read-only, cid-scoped.
CREATE OR REPLACE FUNCTION public.world_lane_heat_v1(_cid text)
RETURNS TABLE(lane text, entries integer, subjects integer, open_items integer, last_touch date, heat integer, why text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','pg_temp'
AS $$
  WITH m AS (
    SELECT btrim(me.lane) AS lane, count(*)::int AS n,
           max(COALESCE(me.updated_at, me.created_at))::date AS lt
    FROM public.memory_entries me
    WHERE me.cid = _cid AND me.lane IS NOT NULL AND btrim(me.lane) <> ''
      AND me.status IN ('active','review')
    GROUP BY 1
  ),
  s AS (
    SELECT btrim(me.lane) AS lane, count(DISTINCT e.id)::int AS subs
    FROM public.memory_entries me
    JOIN public.world_entities e
      ON e.cid = _cid AND e.merged_into IS NULL AND e.etype <> 'Event' AND length(e.name) > 3
     AND (me.body_md ILIKE '%'||e.name||'%' OR me.title ILIKE '%'||e.name||'%')
    WHERE me.cid = _cid AND me.lane IS NOT NULL AND btrim(me.lane) <> ''
    GROUP BY 1
  ),
  o AS (
    SELECT n.lane, count(*)::int AS owed
    FROM (SELECT DISTINCT btrim(me.lane) AS lane FROM public.memory_entries me
          WHERE me.cid = _cid AND me.lane IS NOT NULL AND btrim(me.lane) <> '') n
    JOIN public.open_loops l
      ON l.cid = _cid AND l.brief_status = 'open'
     AND (l.title ILIKE '%'||n.lane||'%' OR COALESCE(l."trigger",'') ILIKE '%'||n.lane||'%')
    GROUP BY 1
  )
  SELECT m.lane, m.n, COALESCE(s.subs,0), COALESCE(o.owed,0), m.lt,
    LEAST(100, (
        LEAST(40, m.n * 3)
      + LEAST(20, COALESCE(s.subs,0) * 2)
      + LEAST(20, COALESCE(o.owed,0) * 10)
      + CASE WHEN m.lt >= current_date - 3 THEN 20
             WHEN m.lt >= current_date - 14 THEN 12
             WHEN m.lt >= current_date - 45 THEN 5 ELSE 0 END
    ))::int,
    concat_ws(' · ',
      m.n || ' notes',
      CASE WHEN COALESCE(s.subs,0) > 0 THEN COALESCE(s.subs,0) || ' people and companies' END,
      CASE WHEN COALESCE(o.owed,0) > 0 THEN COALESCE(o.owed,0) || ' still waiting' END,
      CASE WHEN m.lt >= current_date - 14 THEN 'touched recently' END)
  FROM m LEFT JOIN s ON s.lane = m.lane LEFT JOIN o ON o.lane = m.lane
  ORDER BY 6 DESC, 2 DESC;
$$;

REVOKE ALL ON FUNCTION public.world_lane_heat_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.world_lane_heat_v1(text) TO service_role;

-- 2. MEANING SEARCH · third tier on top of the existing word search.
DROP FUNCTION IF EXISTS public.world_search_v1(text, text, integer);

CREATE OR REPLACE FUNCTION public.world_search_v1(
  _cid text, _q text, _limit integer DEFAULT 40, _qvec text DEFAULT NULL
)
RETURNS TABLE(register text, rid text, lane text, title text, snippet text, rank real)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','pg_temp'
AS $function$
DECLARE
  tsq tsquery;
  relaxed tsquery;
  qv public.vector(1536);
BEGIN
  tsq := websearch_to_tsquery('english', _q);
  SELECT to_tsquery('english', string_agg(lexeme, ' | ')) INTO relaxed
  FROM unnest(tsvector_to_array(to_tsvector('english', _q))) AS lexeme;

  -- A bad or absent vector is simply no vector: search degrades to words only.
  IF _qvec IS NOT NULL AND btrim(_qvec) <> '' THEN
    BEGIN
      qv := _qvec::public.vector(1536);
    EXCEPTION WHEN OTHERS THEN
      qv := NULL;
    END;
  END IF;

  RETURN QUERY
  WITH hits AS (
    SELECT 'storyline' reg, s.id::text, s.title AS ln, s.title AS t, s.body_md AS body,
           to_tsvector('english', s.title || ' ' || s.body_md) AS vec, s.embedding AS emb
    FROM public.storyline s WHERE s.cid = _cid
    UNION ALL
    SELECT 'memory', m.id::text, m.lane, m.title, m.body_md,
           to_tsvector('english', m.title || ' ' || m.body_md), m.embedding
    FROM public.memory_entries m WHERE m.cid = _cid AND m.status = 'active'
    UNION ALL
    SELECT 'world_claim', w.id::text, NULL, w.predicate, COALESCE(w.value_text,''),
           to_tsvector('english', w.predicate || ' ' || COALESCE(w.value_text,'')), w.embedding
    FROM public.world_claims w WHERE w.cid = _cid
    UNION ALL
    SELECT 'open_loop', o.id::text, NULL, o.title, COALESCE(o."trigger",''),
           to_tsvector('english', o.title || ' ' || COALESCE(o."trigger",'')), NULL
    FROM public.open_loops o WHERE o.cid = _cid AND o.state IN ('open','blocked','waiting')
  ),
  strict_hits AS (
    SELECT h.reg, h.id, h.ln, h.t, h.body, ts_rank(h.vec, tsq)::real r
    FROM hits h WHERE tsq IS NOT NULL AND h.vec @@ tsq
  ),
  relaxed_hits AS (
    SELECT h.reg, h.id, h.ln, h.t, h.body, (ts_rank(h.vec, relaxed) * 0.5)::real r
    FROM hits h WHERE relaxed IS NOT NULL AND h.vec @@ relaxed
      AND NOT EXISTS (SELECT 1 FROM strict_hits sh WHERE sh.id = h.id AND sh.reg = h.reg)
  ),
  word_hits AS (
    SELECT * FROM strict_hits UNION ALL SELECT * FROM relaxed_hits
  ),
  -- Third tier: closest by meaning. Only consulted when the words found little,
  -- and only when this tenant actually has vectors on file.
  meaning_hits AS (
    SELECT h.reg, h.id, h.ln, h.t, h.body,
           (GREATEST(0, 1 - (h.emb <=> qv)) * 0.4)::real r
    FROM hits h
    WHERE qv IS NOT NULL AND h.emb IS NOT NULL
      AND (SELECT count(*) FROM word_hits) < 5
      AND NOT EXISTS (SELECT 1 FROM word_hits wh WHERE wh.id = h.id AND wh.reg = h.reg)
    ORDER BY h.emb <=> qv
    LIMIT GREATEST(1, LEAST(_limit, 100))
  ),
  unioned AS (
    SELECT * FROM word_hits UNION ALL SELECT * FROM meaning_hits
  )
  SELECT u.reg, u.id, u.ln, u.t,
         CASE WHEN tsq IS NULL AND relaxed IS NULL
              THEN left(u.body, 220)
              ELSE ts_headline('english', left(u.body, 2000), COALESCE(tsq, relaxed),
                     'MaxWords=28, MinWords=12, StartSel=**, StopSel=**') END,
         u.r
  FROM unioned u
  ORDER BY u.r DESC
  LIMIT GREATEST(1, LEAST(_limit, 100));
END; $function$;

REVOKE ALL ON FUNCTION public.world_search_v1(text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.world_search_v1(text, text, integer, text) TO service_role;