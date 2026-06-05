// Phase-1 agent registry. Bundled. Promotes to a Supabase table with
// entitlements in Phase 3.

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
      id: "knox",
      name: "KNOX",
      lens: "Legal & compliance intelligence",
      tier_min: "any",
      enabled: true,
      kind: "single",
    },
  ],
};

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
