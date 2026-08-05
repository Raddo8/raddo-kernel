/** Read-only client for the lane cabinet and lane dossiers.
 *
 * The cid is never sent: the edge function derives it from the verified
 * principal. Nothing in this module writes.
 */
import { supabase } from "@/integrations/supabase/client";

export interface LaneRow {
  lane: string;
  slug: string;
  label: string;
  preview: string | null;
  entry_count: number;
  open_thread_count: number | null;
  open_threads_derived: boolean;
  updated_at: string | null;
  has_narrative: boolean;
}

export interface NarrativeSection {
  heading: string;
  body: string;
}

export interface LaneMemory {
  id: string;
  title: string;
  body_md: string;
  category: string | null;
  status: string | null;
  confidence: number | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface LaneThread {
  id: string;
  title: string;
  trigger: string | null;
  owner: string | null;
  state: string | null;
  brief_status: string | null;
  updated_at: string | null;
}

export interface LaneEntity {
  id: string;
  etype: string;
  name: string;
  tag: string | null;
  status: string | null;
  sensitivity: string | null;
}

export interface LaneDossierPayload {
  lane: string;
  slug: string;
  narrative: {
    id: string;
    title: string;
    grade: string | null;
    cites: unknown[];
    created_at: string | null;
    sections: NarrativeSection[];
  } | null;
  memories: LaneMemory[];
  threads: LaneThread[];
  threads_derived: boolean;
  entities: LaneEntity[];
}

export interface SearchHit {
  register: string;
  rid: string;
  lane: string | null;
  slug: string | null;
  title: string | null;
  snippet: string | null;
  rank: number | null;
}

export interface EntityCard {
  entity: { id: string; etype: string; name: string; tag: string | null; status: string | null; sensitivity: string | null };
  claim_count: number;
  lead: string | null;
}

export async function callWorld<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("world-graph", { body: { ...body, action } });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(String(data?.error ?? "world_graph_error"));
  return data as T;
}

/** Which TOC section a search hit belongs to, so a result can open in place. */
export function sectionForRegister(register: string): string {
  const r = register.toLowerCase();
  if (r.includes("story") || r.includes("narrative")) return "storyline";
  if (r.includes("memory") || r.includes("record")) return "records";
  if (r.includes("thread") || r.includes("loop")) return "threads";
  if (r.includes("claim") || r.includes("entit")) return "entities";
  return "records";
}


/** Compose the precise message the client hands to their COB. The page never writes. */
export function composeChangeRequest(args: {
  lane: string;
  section: string;
  recordIds: string[];
}): string {
  const ids = args.recordIds.filter(Boolean);
  return [
    `Change request for the ${args.lane} lane.`,
    `Section: ${args.section}.`,
    ids.length ? `Records concerned: ${ids.join(", ")}.` : "No record ids attached to this section.",
    "What should change:",
  ].join("\n");
}
