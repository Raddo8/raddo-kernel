// supabase/functions/world-graph/brief.ts
//
// THE BRIEF · a full page on one subject (person, company, case, property).
//
// Law:
//  · the cid is the principal's, derived server-side; never from the body
//  · nothing here writes
//  · nothing is invented: the written read is authored and stored, and when it
//    is absent the surface says so plainly
//  · the graph is rendered, not summarised: typed links come back phrased in
//    plain English with the sentence that justified them
import { laneSlug, parseRead } from "./lanes.ts";
import { isTyped, phraseFor } from "./edge-language.ts";
import { hubsByName } from "./heat.ts";

type Admin = any;

const LIVE_MEMORY = ["active", "review"];

/** One subject, everything on record about them, plus every folder they show up in. */
export async function actionBrief(admin: Admin, cid: string, entityId: string, sensitivities: string[]) {
  const { data: entity } = await admin
    .from("world_entities")
    .select("id, etype, name, tag, status, sensitivity, meta, created_at, updated_at")
    .eq("cid", cid)
    .eq("id", entityId)
    .in("sensitivity", sensitivities)
    .maybeSingle();
  if (!entity) return { ok: false, error: "entity_not_found" };

  const [claimsRes, edgesRes, memRes, storyRes, readRes, hubs] = await Promise.all([
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
      .select("id, etype, src_id, dst_id, meta")
      .eq("cid", cid)
      .or(`src_id.eq.${entity.id},dst_id.eq.${entity.id}`)
      .limit(500),
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
    hubsByName(admin, cid),
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
      .select("id, name, etype, meta")
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
      if (String(other.etype ?? "") === "Event") return null; // events are the timeline
      const direction = e.src_id === entity.id ? "out" : "in";
      const verb = String(e.etype ?? "relatedTo");
      const hub = hubs.get(String(other.name ?? "").toLowerCase()) ?? null;
      return {
        id: e.id,
        relation: verb,
        typed: isTyped(verb),
        phrase: phraseFor(verb, direction as "out" | "in"),
        direction,
        entity_id: other.id,
        name: other.name,
        etype: other.etype,
        evidence: typeof e.meta?.evidence === "string" ? e.meta.evidence : null,
        from_claim: typeof e.meta?.from_claim === "string" ? e.meta.from_claim : null,
        hub_folders: hub ? hub.folders : null,
      };
    })
    .filter(Boolean);

  // THE TIMELINE · dated events linked to this subject by an "involves" link.
  const eventRows = edges
    .filter((e: any) => String(e.etype ?? "") === "involves")
    .map((e: any) => {
      const otherId = e.src_id === entity.id ? e.dst_id : e.src_id;
      const other = nameOf.get(otherId);
      if (!other || String(other.etype ?? "") !== "Event") return null;
      const raw = String(other.name ?? "");
      const date = typeof other.meta?.date === "string" ? other.meta.date : null;
      // Event names are written "Jun 14, 2026 · what happened".
      const split = raw.split("\u00b7");
      const what = (split.length > 1 ? split.slice(1).join("\u00b7") : raw).trim();
      return { id: other.id, date, what, evidence: typeof e.meta?.evidence === "string" ? e.meta.evidence : null };
    })
    .filter(Boolean) as Array<{ id: string; date: string | null; what: string; evidence: string | null }>;

  const seenEvent = new Set<string>();
  const events = eventRows
    .filter((e) => (seenEvent.has(e.id) ? false : (seenEvent.add(e.id), true)))
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

  const authored = reads.find((r: any) => String(r.title ?? "").trim().toLowerCase() === needle) ?? null;

  const mentions = memories.filter((m: any) => {
    const hay = `${m.title ?? ""} ${m.body_md ?? ""}`.toLowerCase();
    return needle.length > 2 && hay.includes(needle);
  });

  const selfHub = hubs.get(needle) ?? null;

  return {
    ok: true,
    action: "brief",
    cid,
    entity,
    read: parseRead(authored),
    claims,
    connections,
    events,
    folders,
    hub: selfHub ? { folders: selfHub.folders, folder_list: selfHub.folder_list } : null,
    mentions: mentions.slice(0, 200),
    counts: {
      claims: claims.length,
      folders: folders.length,
      facts: claims.length + mentions.length,
      links: connections.length,
      events: events.length,
    },
  };
}
