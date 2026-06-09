// Phase-1 agent registry. Bundled. Promotes to a Supabase table with
// entitlements in Phase 3.

import { getLegalSeat } from "../tenants.ts";

export type AgentKind = "council" | "single";

export interface AgentEntry {
  id: string;
  name: string;
  lens: string;
  tier_min: string;
  enabled: boolean;
  kind: AgentKind;
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
      id: "lexi",
      name: "LEXI",
      lens: "Legal & compliance advisory",
      tier_min: "any",
      enabled: true,
      kind: "single",
    },
    {
      id: "knox",
      name: "KNOX",
      lens: "Legal & compliance intelligence",
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
      id: "iroh",
      name: "Iroh",
      lens: "People & principal elevation counsel",
      tier_min: "any",
      enabled: true,
      kind: "single",
    },
  ],
};

const LEGAL_IDS = new Set(["lexi", "knox"]);

export function findEnabledAgent(id: string): AgentEntry | null {
  const a = AGENT_MANIFEST.agents.find((x) => x.id === id);
  if (!a || !a.enabled) return null;
  return a;
}

export function listEnabledAgentsPublic(): Array<{ id: string; name: string; lens: string }> {
  return AGENT_MANIFEST.agents
    .filter((a) => a.enabled)
    .map((a) => ({ id: a.id, name: a.name, lens: a.lens }));
}

// Public roster filtered to one legal seat per tenant. Tenant MUST come from
// the verified identity (see index.ts), never from client input.
export function listSeatedAgentsPublic(
  tenant: string,
): Array<{ id: string; name: string; lens: string }> {
  const seat = getLegalSeat(tenant);
  return AGENT_MANIFEST.agents
    .filter((a) => a.enabled)
    .filter((a) => !LEGAL_IDS.has(a.id) || a.id === seat)
    .map((a) => ({ id: a.id, name: a.name, lens: a.lens }));
}
