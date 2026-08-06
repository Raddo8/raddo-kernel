// supabase/functions/world-graph/search.ts
//
// WORLD SEARCH + the entity pop-out (knowledge-graph hop).
//
// Law:
//  · the cid is the principal's, derived server-side; never from the body
//  · nothing here writes
//  · public.world_search_v1 is service-role only; it is reached with the admin
//    client inside this function and is never callable from the browser role
//  · sensitivity filtering applies to every entity row returned
//  · MEANING TIER: when the words find little, the query is embedded and the
//    same function is asked again with a vector. No provider, no vectors, or a
//    failed call all degrade silently back to the word result.

import { embedOne, toVectorLiteral } from "../_shared/embed.ts";

type Admin = any;

const WEAK_RESULT = 5;

export const laneSlugOf = (name: string): string =>
  String(name ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export interface SearchHit {
  register: string;
  rid: string;
  lane: string | null;
  slug: string | null;
  title: string | null;
  snippet: string | null;
  rank: number | null;
}

const shape = (data: any[]): SearchHit[] =>
  (data ?? []).map((r: any) => ({
    register: String(r.register ?? ""),
    rid: String(r.rid ?? ""),
    lane: r.lane ?? null,
    slug: r.lane ? laneSlugOf(String(r.lane)) : null,
    title: r.title ?? null,
    snippet: r.snippet ?? null,
    rank: typeof r.rank === "number" ? r.rank : null,
  }));

export async function actionSearch(admin: Admin, cid: string, q: string, limit: number) {
  const query = q.trim();
  if (query.length < 2) return { ok: true, action: "search", cid, q: query, rows: [] as SearchHit[] };

  const capped = Math.min(Math.max(limit || 20, 1), 50);

  const { data, error } = await admin.rpc("world_search_v1", {
    _cid: cid,
    _q: query,
    _limit: capped,
    _qvec: null,
  });
  if (error) return { ok: false, error: "search_failed", detail: error.message };

  let rows = shape(data ?? []);
  let matched_on = "words";

  if (rows.length < WEAK_RESULT) {
    const vec = await embedOne(query);
    if (vec) {
      const second = await admin.rpc("world_search_v1", {
        _cid: cid,
        _q: query,
        _limit: capped,
        _qvec: toVectorLiteral(vec),
      });
      if (!second.error) {
        const blended = shape(second.data ?? []);
        if (blended.length > rows.length) {
          rows = blended;
          matched_on = "meaning";
        }
      }
    }
  }

  return { ok: true, action: "search", cid, q: query, rows, count: rows.length, matched_on };
}

/** The pop-out record for one entity: identity, claim count, a short lead. */
export async function actionEntityCard(
  admin: Admin,
  cid: string,
  entityId: string,
  sensitivities: string[],
) {
  const { data: ent } = await admin
    .from("world_entities")
    .select("id, etype, name, tag, status, sensitivity")
    .eq("cid", cid)
    .eq("id", entityId)
    .in("sensitivity", sensitivities)
    .maybeSingle();
  if (!ent) return { ok: false, error: "entity_not_found" };

  const { data: claims } = await admin
    .from("world_claims")
    .select("id, predicate, value_text, grade, observed_at")
    .eq("cid", cid)
    .eq("subject_id", entityId)
    .in("sensitivity", sensitivities)
    .neq("status", "void")
    .order("observed_at", { ascending: false })
    .limit(200);

  const list = claims ?? [];
  const lead = list
    .map((c: any) => String(c.value_text ?? "").trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");

  return {
    ok: true,
    action: "entity_card",
    cid,
    entity: ent,
    claim_count: list.length,
    lead: lead || null,
  };
}

/** Everywhere the entity surfaces: the cross-lane hop, one row per place. */
export async function actionEntityWhere(
  admin: Admin,
  cid: string,
  entityId: string,
  sensitivities: string[],
) {
  const { data: ent } = await admin
    .from("world_entities")
    .select("id, name")
    .eq("cid", cid)
    .eq("id", entityId)
    .in("sensitivity", sensitivities)
    .maybeSingle();
  if (!ent) return { ok: false, error: "entity_not_found" };

  const found = await actionSearch(admin, cid, String(ent.name ?? ""), 40);
  if (!found.ok) return found;

  return {
    ok: true,
    action: "entity_where",
    cid,
    entity_id: entityId,
    name: ent.name,
    rows: (found as any).rows as SearchHit[],
  };
}
