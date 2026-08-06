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
  /** How much attention this folder deserves. Absent when nothing scored it. */
  heat?: number | null;
  heat_why?: string | null;
  subject_count?: number | null;
}

/** A person, company, case or place that shows up inside a folder. */
export interface LaneSubject {
  id: string;
  name: string;
  etype: string;
  tag: string | null;
  heat: number | null;
  why: string | null;
  hub_folders: number | null;
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
  subjects?: LaneSubject[];
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

/** The COB's written read on a folder or a subject. Authored, never computed. */
export interface CobRead {
  id: string;
  written_at: string | null;
  synopsis: string | null;
  judgments: Array<{
    claim: string;
    reasoning: string;
    confidence: "high" | "medium" | "low" | null;
    sources: string[];
  }>;
  actions: Array<{ text: string; blocker: string | null }>;
}

export interface BriefPayload {
  entity: {
    id: string;
    etype: string;
    name: string;
    tag: string | null;
    status: string | null;
    sensitivity: string | null;
    created_at: string | null;
    updated_at: string | null;
  };
  read: CobRead | null;
  claims: Array<{
    id: string;
    predicate: string | null;
    value_text: string | null;
    grade: string | null;
    observed_at: string | null;
    status: string | null;
  }>;
  connections: Array<{
    id: string;
    relation: string;
    /** True when the link names a real relationship, not just a mention. */
    typed: boolean;
    /** The link said in plain English: "runs", "represented by". */
    phrase: string;
    direction: "in" | "out";
    entity_id: string;
    name: string;
    etype: string;
    /** The sentence that justified the link, when one was saved. */
    evidence: string | null;
    from_claim: string | null;
    hub_folders: number | null;
  }>;
  /** Dated events this subject took part in. */
  events: Array<{ id: string; date: string | null; what: string; evidence: string | null }>;
  hub: { folders: number; folder_list: string[] } | null;
  folders: Array<{ lane: string; slug: string; fact_count: number }>;
  mentions: Array<{
    id: string;
    title: string;
    body_md: string;
    lane: string | null;
    category: string | null;
    created_by: string | null;
    created_at: string | null;
    updated_at: string | null;
  }>;
  counts: { claims: number; folders: number; facts: number; links?: number; events?: number };
}

/** Plain-English kind for a subject, for the brief kicker. */
export function subjectKind(etype: string): string {
  const e = String(etype ?? "").toLowerCase();
  if (/person|people|contact|human/.test(e)) return "person";
  if (/org|company|business|vendor|firm/.test(e)) return "company";
  if (/case|matter|deal|pursuit/.test(e)) return "case";
  if (/property|asset|site|building/.test(e)) return "property";
  return e || "subject";
}

/** Plain-English line for where a fact came from. */
export function sourceLine(grade: string | null | undefined, who?: string | null): string {
  const g = String(grade ?? "").toLowerCase();
  if (["seen", "own-probe", "document", "system-of-record", "verified"].includes(g)) {
    return "your COB checked this itself";
  }
  if (who) return `someone told your COB this \u00b7 ${who}`;
  return "someone told your COB this";
}
