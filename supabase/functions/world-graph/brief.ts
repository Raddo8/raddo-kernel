// supabase/functions/world-graph/brief.ts
//
// THE BRIEF · a full page on one subject (person, company, case, property).
//
// Law:
//  · the cid is the principal's, derived server-side; never from the body
//  · nothing here writes
//  · nothing is invented: the written read is authored and stored, and when it
//    is absent the surface says so plainly
import { laneSlug, parseRead } from "./lanes.ts";

type Admin = any;

const LIVE_MEMORY = ["active", "review"];

/** One subject, everything on record about them, plus every folder they show up in. */
export async function actionBrief(admin: Admin, cid: string, entityId: string, sensitivities: string[]) {
  const { data: entity } = await admin
    .from("world_entities")
    .select("id, etype, name, tag, status, sensitivity, created_at, updated_at")
    .eq("cid", cid)
    .eq("id", entityId)
    .in("sensitivity", sensitivities)
    .maybeSingle();
  if (!entity) return { ok: false, error: "entity_not_found" };

  const [claimsRes, edgesRes, memRes, storyRes, readRes] = await Promise.all([
    admin
      .from("world_claims")
      .select("id, predicate, value_text, grade, observed_at, status, source_id")
      .eq("cid", cid)
      .eq("subject_id", entity.id)
      .in("status", ["staged", "confirmed"])
      .in("sensitivity", sensitivities)
      .order("observed_at", { ascending: false })
      .limit(500),
    admin
      .from("world_edges")
      .select("id, etype, src_id, dst_id")
      .eq("cid", cid)
      .or(`src_id.eq.${entity.id},dst_id.eq.${entity.id}`)
      .limit(200),
    admin
      .from("memory_entries")
      .select("id, title, body_md, lane, category, status, created_by, created_at, updated_at")
      .eq("cid", cid)
      .in("status", LIVE_MEMORY)
      .order("created_at", { ascending: false })
      .limit(1000),
    admin
      .from("storyline")
      .select("id, title, body_md, kind, created_at")
      .eq("cid", cid)
      .eq("kind", "lane-narrative"),
    admin
      .from("storyline")
      .select("id, title, body_md, kind, created_at")
      .eq("cid", cid)
      .eq("kind", "subject-judgments")
      .order("created_at", { ascending: false }),
  ]);

  const claims = claimsRes.data ?? [];
  const edges = edgesRes.data ?? [];
  const memories = memRes.data ?? [];
  const narratives = storyRes.data ?? [];
  const reads = readRes.data ?? [];

  const needle = String(entity.name ?? "").toLowerCase();

  // Folders this subject shows up in, counted from the lane's own material.
  const buckets = new Map<string, number>();
  for (const m of memories) {
    const lane = typeof m.lane === "string" ? m.lane.trim() : "";
    if (!lane) continue;
    const hay = `${m.title ?? ""} ${m.body_md ?? ""}`.toLowerCase();
    if (needle.length > 2 && hay.includes(needle)) buckets.set(lane, (buckets.get(lane) ?? 0) + 1);
  }
  for (const n of narratives) {
    const lane = String(n.title ?? "").trim();
    if (!lane) continue;
    const hay = String(n.body_md ?? "").toLowerCase();
    if (needle.length > 2 && hay.includes(needle)) buckets.set(lane, buckets.get(lane) ?? 0);
  }

  const folders = Array.from(buckets.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([lane, count]) => ({ lane, slug: laneSlug(lane), fact_count: count }));

  // Names on the other end of each relationship, so the box reads in English.
  const otherIds = Array.from(
    new Set(edges.map((e: any) => (e.src_id === entity.id ? e.dst_id : e.src_id)).filter(Boolean)),
  );
  let others: any[] = [];
  if (otherIds.length) {
    const { data } = await admin
      .from("world_entities")
      .select("id, name, etype")
      .eq("cid", cid)
      .in("id", otherIds)
      .in("sensitivity", sensitivities);
    others = data ?? [];
  }
  const nameOf = new Map(others.map((o: any) => [o.id, o]));

  const connections = edges
    .map((e: any) => {
      const otherId = e.src_id === entity.id ? e.dst_id : e.src_id;
      const other = nameOf.get(otherId);
      if (!other) return null;
      return {
        id: e.id,
        relation: String(e.etype ?? "connected to"),
        direction: e.src_id === entity.id ? "out" : "in",
        entity_id: other.id,
        name: other.name,
        etype: other.etype,
      };
    })
    .filter(Boolean);

  const authored = reads.find((r: any) => String(r.title ?? "").trim().toLowerCase() === needle) ?? null;

  const mentions = memories.filter((m: any) => {
    const hay = `${m.title ?? ""} ${m.body_md ?? ""}`.toLowerCase();
    return needle.length > 2 && hay.includes(needle);
  });

  return {
    ok: true,
    action: "brief",
    cid,
    entity,
    read: parseRead(authored),
    claims,
    connections,
    folders,
    mentions: mentions.slice(0, 200),
    counts: {
      claims: claims.length,
      folders: folders.length,
      facts: claims.length + mentions.length,
    },
  };
}
