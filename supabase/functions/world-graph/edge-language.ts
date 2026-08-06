// supabase/functions/world-graph/edge-language.ts
//
// THE GRAPH IN PLAIN ENGLISH.
//
// world_edges carries a closed vocabulary of typed links. This module turns one
// link into a sentence a reader understands, from whichever end they are
// standing on. Nothing is invented: a verb with no phrasing on file falls back
// to the verb itself, spelled out.

export type Dir = "out" | "in";

/** out = this subject is the source. in = this subject is the target. */
const PHRASES: Record<string, { out: string; in: string }> = {
  runs: { out: "runs", in: "is run by" },
  works_for: { out: "works for", in: "has working for them" },
  owns: { out: "owns", in: "is owned by" },
  co_owns: { out: "co-owns", in: "is co-owned by" },
  represents: { out: "represents", in: "is represented by" },
  advises: { out: "advises", in: "is advised by" },
  drafted: { out: "drafted", in: "was drafted by" },
  engaged: { out: "hired", in: "was hired by" },
  client_of: { out: "is a client of", in: "has as a client" },
  vendor_of: { out: "is a vendor to", in: "buys from" },
  partner_of: { out: "is a partner of", in: "is a partner of" },
  opposes: { out: "is up against", in: "is opposed by" },
  owes: { out: "owes", in: "is owed by" },
  married_to: { out: "is married to", in: "is married to" },
  parent_of: { out: "is a parent of", in: "is a child of" },
  sibling_of: { out: "is a sibling of", in: "is a sibling of" },
  located_at: { out: "is located at", in: "is the location of" },
  part_of: { out: "is part of", in: "includes" },
  founded: { out: "founded", in: "was founded by" },
  acquired: { out: "bought", in: "was bought by" },
  succeeded_by: { out: "was followed by", in: "took over from" },
  scheduled_with: { out: "has something scheduled with", in: "has something scheduled with" },
  reports_to: { out: "reports to", in: "has reporting to them" },
  involves: { out: "involves", in: "is involved in" },
  mentions: { out: "also appears with", in: "also appears with" },
  relatedTo: { out: "is connected to", in: "is connected to" },
};

/** Verbs that carry no meaning of their own: shown after the typed links. */
export const LOOSE = new Set(["mentions", "relatedTo", "related_to"]);

export function phraseFor(etype: string, dir: Dir): string {
  const key = String(etype ?? "").trim();
  const hit = PHRASES[key];
  if (hit) return hit[dir];
  return key.replace(/_/g, " ") || "is connected to";
}

export const isTyped = (etype: string): boolean => !LOOSE.has(String(etype ?? "").trim());
