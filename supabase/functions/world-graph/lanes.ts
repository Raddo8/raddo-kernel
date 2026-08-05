// supabase/functions/world-graph/lanes.ts
//
// THE LANE DOSSIER CABINET · read-only projections.
//
// Law:
//  · the cid is the principal's, derived server-side; never from the body
//  · nothing here writes; there is no write branch in this module
//  · lane names are DERIVED (memory_entries.lane ∪ storyline lane-narrative
//    titles). No lane name is hardcoded anywhere.
//  · a count is only reported when it is genuinely derivable; otherwise the
//    field is null and the surface says so plainly.

type Admin = any;

const LIVE_MEMORY = ["active", "review"];

export const laneSlug = (name: string): string =>
  name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** First sentences of a narrative, up to ~260 chars, headings stripped. */
function preview(bodyMd: string): string {
  const plain = bodyMd
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= 260) return plain;
  const cut = plain.slice(0, 260);
  const stop = cut.lastIndexOf(". ");
  return (stop > 120 ? cut.slice(0, stop + 1) : cut) + "\u2026";
}

/** Open loops are matched to a lane by name containment. Reported as derived. */
function loopsForLane(loops: any[], lane: string): any[] {
  const needle = lane.toLowerCase();
  const short = needle.replace(/^the\s+/, "");
  return loops.filter((l) => {
    const hay = `${l.title ?? ""} ${l.trigger ?? ""} ${l.owner ?? ""}`.toLowerCase();
    return hay.includes(needle) || (short.length > 4 && hay.includes(short));
  });
}

async function readAll(admin: Admin, cid: string) {
  const [mem, story, judg, loops] = await Promise.all([
    admin
      .from("memory_entries")
      .select("id, title, body_md, lane, category, status, confidence, created_by, created_at, updated_at")
      .eq("cid", cid)
      .in("status", LIVE_MEMORY)
      .order("created_at", { ascending: false }),
    admin
      .from("storyline")
      .select("id, title, body_md, cites, grade, kind, created_at")
      .eq("cid", cid)
      .eq("kind", "lane-narrative")
      .order("created_at", { ascending: false }),
    admin
      .from("storyline")
      .select("id, title, body_md, cites, grade, kind, created_at")
      .eq("cid", cid)
      .eq("kind", "lane-judgments")
      .order("created_at", { ascending: false }),
    admin
      .from("open_loops")
      .select("id, title, trigger, owner, state, brief_status, updated_at")
      .eq("cid", cid)
      .eq("brief_status", "open"),
  ]);
  return {
    memories: (mem.data ?? []) as any[],
    narratives: (story.data ?? []) as any[],
    reads: (judg.data ?? []) as any[],
    loops: (loops.data ?? []) as any[],
  };
}

export async function actionLanes(admin: Admin, cid: string) {
  const { memories, narratives, loops } = await readAll(admin, cid);

  const names = new Set<string>();
  for (const m of memories) if (typeof m.lane === "string" && m.lane.trim()) names.add(m.lane.trim());
  for (const n of narratives) if (typeof n.title === "string" && n.title.trim()) names.add(n.title.trim());

  const rows = Array.from(names)
    .sort((a, b) => a.localeCompare(b))
    .map((lane) => {
      const mine = memories.filter((m) => m.lane === lane);
      const narrative = narratives.find((n) => n.title === lane) ?? null;
      const matched = loopsForLane(loops, lane);
      const stamps = [
        ...mine.map((m) => m.updated_at ?? m.created_at),
        narrative?.created_at ?? null,
      ].filter(Boolean) as string[];
      const freshest = stamps.sort().slice(-1)[0] ?? null;
      return {
        lane,
        slug: laneSlug(lane),
        label: lane,
        preview: narrative ? preview(String(narrative.body_md ?? "")) : null,
        entry_count: mine.length,
        open_thread_count: matched.length,
        open_threads_derived: true,
        updated_at: freshest,
        has_narrative: Boolean(narrative),
      };
    });

  // Newest material first, so a growing cabinet reads as a living one.
  rows.sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));

  return { ok: true, action: "lanes", cid, rows, count: rows.length };
}

/** Split a narrative into sections on markdown headings; no heading = one section. */
function sections(bodyMd: string): Array<{ heading: string; body: string }> {
  const text = String(bodyMd ?? "").trim();
  if (!text) return [];
  const lines = text.split("\n");
  const out: Array<{ heading: string; body: string }> = [];
  let heading = "";
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join("\n").trim();
    if (heading || body) out.push({ heading: heading || "The narrative", body });
    buf = [];
  };
  for (const line of lines) {
    const m = line.match(/^#{1,6}\s+(.*)$/);
    if (m) {
      flush();
      heading = m[1].trim();
    } else {
      buf.push(line);
    }
  }
  flush();
  return out.filter((s) => s.body || s.heading);
}

export async function actionLane(admin: Admin, cid: string, slug: string, sensitivities: string[]) {
  const { memories, narratives, reads, loops } = await readAll(admin, cid);

  const names = new Set<string>();
  for (const m of memories) if (typeof m.lane === "string" && m.lane.trim()) names.add(m.lane.trim());
  for (const n of narratives) if (typeof n.title === "string" && n.title.trim()) names.add(n.title.trim());

  // The slug never reaches a query: it selects from the derived lane set.
  const lane = Array.from(names).find((n) => laneSlug(n) === slug);
  if (!lane) return { ok: false, error: "lane_not_found" };

  const narrative = narratives.find((n) => n.title === lane) ?? null;
  const mine = memories.filter((m) => m.lane === lane);
  const threads = loopsForLane(loops, lane);

  // Entities are linkable when their name appears in this lane's material.
  const { data: entRows } = await admin
    .from("world_entities")
    .select("id, etype, name, tag, status, sensitivity, updated_at")
    .eq("cid", cid)
    .in("sensitivity", sensitivities)
    .neq("status", "merged");
  const haystack = [
    String(narrative?.body_md ?? ""),
    ...mine.map((m) => `${m.title} ${m.body_md}`),
  ]
    .join(" ")
    .toLowerCase();
  const entities = (entRows ?? []).filter(
    (e: any) => typeof e.name === "string" && e.name.length > 2 && haystack.includes(e.name.toLowerCase()),
  );

  const authored = reads.find((r) => String(r.title ?? "").trim() === lane) ?? null;

  return {
    ok: true,
    action: "lane",
    read: parseRead(authored),
    cid,
    lane,
    slug,
    narrative: narrative
      ? {
          id: narrative.id,
          title: narrative.title,
          grade: narrative.grade,
          cites: Array.isArray(narrative.cites) ? narrative.cites : [],
          created_at: narrative.created_at,
          sections: sections(String(narrative.body_md ?? "")),
        }
      : null,
    memories: mine,
    threads,
    threads_derived: true,
    entities,
  };
}

/** The COB's written read on a folder. Authored and stored, never computed here.
 *  Anything malformed is treated as absent: the surface then says plainly that
 *  no read has been written yet. */
export function parseRead(row: any): any {
  if (!row) return null;
  let parsed: any = null;
  const raw = String(row.body_md ?? "").trim();
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const judgments = Array.isArray(parsed.judgments)
    ? parsed.judgments
        .map((j: any) => ({
          claim: String(j?.claim ?? "").trim(),
          reasoning: String(j?.reasoning ?? "").trim(),
          confidence: ["high", "medium", "low"].includes(String(j?.confidence ?? "").toLowerCase())
            ? String(j.confidence).toLowerCase()
            : null,
          sources: Array.isArray(j?.sources) ? j.sources.map((s: any) => String(s)).filter(Boolean) : [],
        }))
        .filter((j: any) => j.claim)
    : [];
  const actions = Array.isArray(parsed.actions)
    ? parsed.actions
        .map((a: any) =>
          typeof a === "string"
            ? { text: a.trim(), blocker: null }
            : { text: String(a?.text ?? "").trim(), blocker: a?.blocker ? String(a.blocker) : null },
        )
        .filter((a: any) => a.text)
    : [];
  const synopsis = String(parsed.synopsis ?? "").trim();
  if (!synopsis && !judgments.length && !actions.length) return null;
  return {
    id: row.id,
    written_at: row.created_at ?? null,
    synopsis: synopsis || null,
    judgments,
    actions,
  };
}
