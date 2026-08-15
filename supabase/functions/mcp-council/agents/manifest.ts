// Phase-1 agent registry. Bundled. Promotes to a Supabase table with
// entitlements in Phase 3.
//
// Legal seat: single seat (Knox) for every tenant — LEXI removed
// 2026-06-09. No tier remap, no legal_seat field.
import { canSeat } from "./eval-gate.ts";

export type AgentKind = "council" | "single" | "deferred";


export interface AgentEntry {
  id: string;
  name: string;
  lens: string;
  tier_min: string;
  enabled: boolean;
  kind: AgentKind;
  // Bench tags for the router (queued task B). Felix is the standing growth
  // specialist · summonable via summon_best_advisor, not in the default
  // synchronous convene fan-out (which is now 6 chairs).
  tags?: string[];
  // Raise-the-Bar · platform eval pass-mark (vault-side, never client-visible).
  // Absent today (no harness yet); the eval-gate treats absence as
  // "unblocked" so behavior is unchanged. The stress-test/eval harness
  // (AGENT_SUITE_GAMEPLAN Phase 5) will write these once it ships.
  eval_score?: number;
  eval_scored_at?: string;
}


export const AGENT_MANIFEST: { agents: AgentEntry[] } = {
  agents: [
    {
      id: "council",
      name: "The Council",
      lens: "Multi-domain board deliberation",
      tier_min: "any",
      enabled: true,
      kind: "council",
    },
    {
      id: "knox",
      name: "Knox",
      lens: "Legal & risk intelligence",
      tier_min: "any",
      enabled: true,
      kind: "single",
    },
    {
      id: "lucius",
      name: "Lucius",
      lens: "Finance & buildability counsel",
      tier_min: "any",
      enabled: true,
      kind: "single",
    },
    {
      id: "leo",
      name: "Leo",
      lens: "Operations, sequencing & execution",
      tier_min: "any",
      enabled: true,
      kind: "single",
    },
    {
      id: "alfred",
      name: "Alfred",
      lens: "Continuity, trust & reputation counsel",
      tier_min: "any",
      enabled: true,
      kind: "single",
    },
    {
      id: "marcus",
      name: "Marcus",
      lens: "People & principal elevation counsel",
      tier_min: "any",
      enabled: true,
      kind: "single",
    },
    {
      id: "felix",
      name: "Felix",
      lens: "Growth & revenue architect",
      tier_min: "any",
      enabled: true,
      kind: "single",
      // Bench specialist · summonable via summon_best_advisor on growth /
      // pricing / loops / retention questions. Not in the default 6-chair
      // synchronous convene fan-out (Aims, Leo, Lucius, Knox, Marcus, Alfred).
      tags: ["growth"],
    },
    {
      id: "aims",
      name: "Aims",
      lens: "Vision & strategy advisor",
      tier_min: "any",
      enabled: true,
      kind: "single",
    },
    {
      // Claire · standing copy lens. Seated 2026-08-15 (operator-approved).
      // Owns language aimed at a reader; Felix keeps spend / channel /
      // acquisition economics. Tiebreak: language → Claire, number or plan
      // → Felix.
      id: "claire",
      name: "Claire",
      lens: "Copywriting & conversion craft",
      tier_min: "any",
      enabled: true,
      kind: "single",
      tags: ["copy", "marketing"],
    },
    {
      // Quant · sub-specialist under Finance. Seated 2026-08-15
      // (operator-approved). Receives the "the Quant" referrals that
      // lucius / felix / aims already emit. Tiebreak against Lucius: a
      // number, a range or a model → Quant; a judgment about the money
      // → Lucius.
      id: "quant",
      name: "Quant",
      lens: "Quantitative modeling & valuation",
      tier_min: "any",
      enabled: true,
      kind: "single",
      tags: ["modeling", "valuation"],
    },
    {

      // Abe is the deferred loyal-dissent pass reached only via
      // abe_weighing_in, never a synchronous chair. Kind "deferred" keeps
      // him out of summon_best_advisor and the convene fan-out (see
      // findEnabledAgent guard) while still surfacing him in the public
      // roster so principals discover the pass exists. Mirrors the note
      // above the CHAIRS array in index.ts.
      id: "abe",
      name: "Abe",
      lens: "Loyal dissent and falsification",
      tier_min: "any",
      enabled: true,
      kind: "deferred",
      tags: ["dissent"],
    },

  ],
};

export function findEnabledAgent(id: string): AgentEntry | null {
  const a = AGENT_MANIFEST.agents.find((x) => x.id === id);
  if (!a || !a.enabled) return null;
  // Deferred agents (e.g. Abe) are reachable only via their dedicated tool
  // path — never through synchronous routing (summon_best_advisor, convene).
  if (a.kind === "deferred") return null;
  if (!canSeat(a)) return null;
  return a;
}

export function listEnabledAgentsPublic(): Array<{ id: string; name: string; lens: string }> {
  return AGENT_MANIFEST.agents
    .filter((a) => a.enabled && canSeat(a))
    .map((a) => ({ id: a.id, name: a.name, lens: a.lens }));
}


// Public roster. Tenant arg retained for API stability; Knox is the single
// legal seat for every tenant.
export function listSeatedAgentsPublic(
  _tenant: string,
): Array<{ id: string; name: string; lens: string }> {
  return listEnabledAgentsPublic();
}
