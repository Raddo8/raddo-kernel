/**
 * Shared pursuit-ladder gate + next-state action map.
 *
 * Every state-change path (board drag, slide-out button, ItemDetail select,
 * cob-operator API) MUST run through assertQualifiedGate() so the qualified
 * gate is enforced in one place. The API mirror lives in
 * supabase/functions/cob-operator/index.ts.
 */
import { supabase } from "@/integrations/supabase/client";
import { writeTimelineEvent } from "@/lib/timeline-events";

/** State names that require a decision-maker contact with an email. */
export const GATED_STATES = new Set([
  "qualified", "deepdive", "asset_built", "meeting_set",
  "build_shown", "proposal", "agreement", "onboarding", "client",
]);

/** Concrete next-state action per current state (pursuit ladder). */
export const NEXT_STATE_ACTION: Record<string, { target: string; label: string }> = {
  signal:      { target: "qualified",   label: "Qualify (requires dossier + decision-maker email)" },
  qualified:   { target: "deepdive",    label: "Start deep dive" },
  deepdive:    { target: "asset_built", label: "Mark asset built" },
  asset_built: { target: "build_shown", label: "Mark contacted · build sent" },
  build_shown: { target: "meeting_set", label: "Log meeting set" },
  meeting_set: { target: "proposal",    label: "Move to proposal" },
  proposal:    { target: "agreement",   label: "Mark agreement" },
  agreement:   { target: "onboarding",  label: "Start onboarding" },
  onboarding:  { target: "client",      label: "Mark client" },
};

export interface GateOk { ok: true }
export interface GateFail { ok: false; reason: string }
export type GateResult = GateOk | GateFail;

/** Returns ok:false with a named reason when the qualified gate blocks the transition. */
export async function assertQualifiedGate(
  accountId: string,
  targetStateName: string,
): Promise<GateResult> {
  if (!GATED_STATES.has(targetStateName)) return { ok: true };
  const { data } = await supabase
    .from("contacts")
    .select("id, email, is_decision_maker" as any)
    .eq("account_id", accountId);
  const dm = (data || []).find((c: any) => c.is_decision_maker && (c.email ?? "").trim());
  if (!dm) {
    return {
      ok: false,
      reason:
        "Contact incomplete · a decision-maker contact with a non-empty email is required to reach " +
        `${targetStateName} or beyond.`,
    };
  }
  return { ok: true };
}

export interface ChangeStateArgs {
  item: { id: string; account_id: string };
  targetStateId: string;
  states: { id: string; name: string; label: string }[];
}

export interface ChangeStateResult {
  ok: boolean;
  error?: string;
  state?: { id: string; name: string; label: string };
}

/** Single write path for state changes. Enforces gate + writes timeline event. */
export async function changeItemState(args: ChangeStateArgs): Promise<ChangeStateResult> {
  const target = args.states.find(s => s.id === args.targetStateId);
  if (!target) return { ok: false, error: "Unknown state" };
  const gate = await assertQualifiedGate(args.item.account_id, target.name);
  if (!gate.ok) return { ok: false, error: (gate as GateFail).reason };
  const { error } = await supabase.from("items").update({ state_id: target.id }).eq("id", args.item.id);
  if (error) return { ok: false, error: error.message };
  await writeTimelineEvent({
    accountId: args.item.account_id,
    itemId: args.item.id,
    direction: "system",
    channel: "system",
    summary: `State changed to ${target.label}`,
  });
  return { ok: true, state: target };
}

/** Returns whether the account has at least one decision-maker contact with an email. */
export async function accountHasDecisionMakerEmail(accountId: string): Promise<boolean> {
  const { data } = await supabase
    .from("contacts")
    .select("email, is_decision_maker" as any)
    .eq("account_id", accountId);
  return (data || []).some((c: any) => c.is_decision_maker && (c.email ?? "").trim());
}
