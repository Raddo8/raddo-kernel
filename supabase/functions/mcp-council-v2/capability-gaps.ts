// supabase/functions/mcp-council/capability-gaps.ts
//
// Deterministic capability-gap signal · feeds the Capability Gap Ledger.
// The persona prose (boundary clause · disclosure rider) stays unchanged
// for the human-facing answer; this module guarantees the structured
// machine signal regardless of whether the LLM remembered to emit it.
//
// Hygiene: no raw client text. Question hashes only. Increment recurrence
// in downstream ledger aggregation (each row = one occurrence).

// Currently seated specialist roster (per tenant).
// As specialists are added (e.g. seat Quant), extend this map and the
// matching sub-domains stop logging as gaps · the ledger self-heals.
//
// Today only the function heads + dissent + legal are seated, so every
// sub-domain in the controlled vocabulary is "unseated" by definition.
const SEATED_SUBDOMAINS_BY_TENANT: Record<string, Set<string>> = {
  // example: "acme": new Set(["quant-modeling", "tax"]),
};

export function rosterHasSeatedSpecialist(
  subdomain: string,
  tenant: string,
): boolean {
  const sub = subdomain.trim().toLowerCase();
  if (!sub) return false;
  const seated = SEATED_SUBDOMAINS_BY_TENANT[tenant];
  if (!seated) return false;
  return seated.has(sub);
}

export type CapabilityGap = {
  subdomain: string;
  tenant: string;
  question_hash: string;
  mode: "solo" | "panel" | "council";
  epsilon: number;
};

// Structured log line · machine-grep friendly. The routing/gap ledger
// pipeline already consumes "convene_metrics" lines; this is its peer.
export function logCapabilityGap(g: CapabilityGap): void {
  console.log("capability_gap", JSON.stringify({
    subdomain: g.subdomain,
    tenant: g.tenant,
    question_hash: g.question_hash,
    mode: g.mode,
    epsilon: g.epsilon,
    ts: new Date().toISOString(),
  }));
}
