/**
 * Shared pursuit-ladder gate + next-state action map.
 *
 * Every state-change path (board drag, slide-out button, ItemDetail select,
 * cob-operator API) MUST run through changeItemState() so gates, disposition
 * side-effects, and the client-ops mirror are enforced in one place.
 * The API mirror lives in supabase/functions/cob-operator/index.ts.
 */
import { supabase } from "@/integrations/supabase/client";
import { writeTimelineEvent } from "@/lib/timeline-events";
import { queueAction } from "@/lib/queue-actions";

/** State names that require a decision-maker contact with an email. */
export const GATED_STATES = new Set([
  "qualified", "deepdive", "asset_built", "meeting_set",
  "build_shown", "proposal", "agreement", "onboarding", "client",
]);

/** Disposition state names on the pursuit ladder. */
export const DISPOSITION_STATES = new Set(["case_open", "case_closed"]);

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

export interface DispositionArgs {
  /** ISO date (YYYY-MM-DD) — required when moving to case_open. */
  followUpDate?: string;
  /** Free-text one-liner reason. */
  reason?: string;
}

export interface ChangeStateArgs {
  item: { id: string; account_id: string; workspace_id?: string };
  targetStateId: string;
  states: { id: string; name: string; label: string }[];
  disposition?: DispositionArgs;
}

export interface ChangeStateResult {
  ok: boolean;
  error?: string;
  state?: { id: string; name: string; label: string };
}

/** Single write path for state changes. Enforces gate + writes timeline + disposition side-effects. */
export async function changeItemState(args: ChangeStateArgs): Promise<ChangeStateResult> {
  const target = args.states.find(s => s.id === args.targetStateId);
  if (!target) return { ok: false, error: "Unknown state" };

  // Qualified gate.
  const gate = await assertQualifiedGate(args.item.account_id, target.name);
  if (!gate.ok) return { ok: false, error: (gate as GateFail).reason };

  // case_open requires a follow_up_date. Enforced at the write path so no
  // caller can bypass by omitting the dialog.
  if (target.name === "case_open" && !args.disposition?.followUpDate) {
    return { ok: false, error: "Follow-up date required for Case Open · revisit." };
  }

  // Read current item metadata so we can merge disposition fields.
  const { data: current } = await supabase
    .from("items")
    .select("metadata, workspace_id, title")
    .eq("id", args.item.id)
    .maybeSingle();
  const currentMeta = (current as any)?.metadata || {};
  const workspaceId = args.item.workspace_id || (current as any)?.workspace_id;

  const nextMeta: any = { ...currentMeta };
  if (target.name === "case_open") {
    nextMeta.follow_up_date = args.disposition!.followUpDate;
    nextMeta.disposition_reason = (args.disposition?.reason || "").slice(0, 500);
  }

  const { error } = await supabase
    .from("items")
    .update({ state_id: target.id, metadata: nextMeta })
    .eq("id", args.item.id);
  if (error) return { ok: false, error: error.message };

  await writeTimelineEvent({
    accountId: args.item.account_id,
    itemId: args.item.id,
    direction: "system",
    channel: "system",
    summary: `State changed to ${target.label}`,
    rawJson: {
      to_state: target.name,
      ...(target.name === "case_open" ? {
        follow_up_date: args.disposition!.followUpDate,
        reason: args.disposition?.reason || null,
      } : {}),
    },
  });

  // Side-effects per disposition / transition.
  try {
    if (target.name === "case_closed") {
      // Set account do_not_contact=true; audit as timeline event.
      const { data: acct } = await supabase
        .from("accounts").select("metadata").eq("id", args.item.account_id).maybeSingle();
      const am = ((acct as any)?.metadata || {}) as any;
      am.do_not_contact = true;
      am.do_not_contact_reason = (args.disposition?.reason || currentMeta.disposition_reason || null);
      am.do_not_contact_set_at = new Date().toISOString();
      await supabase.from("accounts").update({ metadata: am }).eq("id", args.item.account_id);
      await writeTimelineEvent({
        accountId: args.item.account_id,
        itemId: args.item.id,
        direction: "system",
        channel: "system",
        summary: "Do-not-contact flag set on account",
      });
    }

    if (target.name === "case_open" && workspaceId) {
      // Queue a scheduled internal_task that surfaces on the follow-up date.
      await queueAction({
        itemId: args.item.id,
        type: "internal_task",
        channel: "system",
        source: "system",
        triggerState: target.name,
        scheduledFor: `${args.disposition!.followUpDate}T09:00:00Z`,
        payloadJson: {
          task: "revisit_pursuit",
          note: `Revisit ⟨${(current as any)?.title || "pursuit"}⟩ · ${args.disposition?.reason || ""}`.trim(),
        },
        idempotencyKey: `revisit:${args.item.id}:${args.disposition!.followUpDate}`,
      });
    }

    if (target.name === "client" && workspaceId) {
      await ensureClientOpsItem({
        workspaceId,
        accountId: args.item.account_id,
        sourcePursuitId: args.item.id,
        sourceTitle: (current as any)?.title,
      });
    }
  } catch (e) {
    console.warn("state-transitions side-effect failed", e);
  }

  return { ok: true, state: target };
}

/** Idempotent mirror: ensure a client_ops item exists for this account. */
export async function ensureClientOpsItem(args: {
  workspaceId: string;
  accountId: string;
  sourcePursuitId?: string;
  sourceTitle?: string;
}) {
  const { data: existing } = await supabase
    .from("items")
    .select("id")
    .eq("workspace_id", args.workspaceId)
    .eq("account_id", args.accountId)
    .eq("type", "client_ops")
    .maybeSingle();
  if (existing) return existing.id;

  const { data: onboarding } = await supabase
    .from("item_states")
    .select("id")
    .eq("workspace_id", args.workspaceId)
    .eq("name", "client_onboarding")
    .maybeSingle();
  if (!onboarding) return null;

  const { data: acct } = await supabase
    .from("accounts").select("name").eq("id", args.accountId).maybeSingle();

  const { data: inserted } = await supabase
    .from("items")
    .insert({
      workspace_id: args.workspaceId,
      account_id: args.accountId,
      type: "client_ops",
      title: (acct as any)?.name ? `${(acct as any).name} · client ops` : (args.sourceTitle || "client ops"),
      state_id: (onboarding as any).id,
      metadata: { source_pursuit_id: args.sourcePursuitId ?? null },
    } as any)
    .select("id")
    .maybeSingle();

  if (inserted) {
    await writeTimelineEvent({
      accountId: args.accountId,
      itemId: (inserted as any).id,
      direction: "system",
      channel: "system",
      summary: "Client ops record opened",
    });
  }
  return (inserted as any)?.id ?? null;
}

/** Returns whether the account has at least one decision-maker contact with an email. */
export async function accountHasDecisionMakerEmail(accountId: string): Promise<boolean> {
  const { data } = await supabase
    .from("contacts")
    .select("email, is_decision_maker" as any)
    .eq("account_id", accountId);
  return (data || []).some((c: any) => c.is_decision_maker && (c.email ?? "").trim());
}

/**
 * Move a client_ops item for the given account to a target state name.
 * Idempotent · used by revenue-schedule status changes (overdue → Payment Issue,
 * resolved → Active). Silently no-ops if no client_ops item exists.
 */
export async function moveClientOpsState(args: {
  workspaceId: string;
  accountId: string;
  targetStateName: string;
  reason?: string;
}) {
  const { data: item } = await supabase
    .from("items")
    .select("id, state_id, item_states(name)")
    .eq("workspace_id", args.workspaceId)
    .eq("account_id", args.accountId)
    .eq("type", "client_ops")
    .maybeSingle();
  if (!item) return { ok: false, reason: "no_client_ops" };
  const currentName = ((item as any).item_states?.name || "");
  if (currentName === args.targetStateName) return { ok: true, unchanged: true };

  const { data: target } = await supabase
    .from("item_states")
    .select("id, name, label")
    .eq("workspace_id", args.workspaceId)
    .eq("name", args.targetStateName)
    .maybeSingle();
  if (!target) return { ok: false, reason: "state_not_found" };

  const { error } = await supabase
    .from("items")
    .update({ state_id: (target as any).id })
    .eq("id", (item as any).id);
  if (error) return { ok: false, reason: error.message };

  await writeTimelineEvent({
    accountId: args.accountId,
    itemId: (item as any).id,
    direction: "system",
    channel: "system",
    summary: `Client ops state changed to ${(target as any).label}`,
    rawJson: { from: currentName, to: args.targetStateName, reason: args.reason || null },
  });

  if (args.targetStateName === "client_payment") {
    try {
      await queueAction({
        itemId: (item as any).id,
        type: "internal_task",
        channel: "system",
        source: "system",
        triggerState: "client_payment",
        payloadJson: { task: "payment_chase_draft", note: args.reason || "Payment overdue · draft chase." },
        idempotencyKey: `payment_chase:${(item as any).id}:${new Date().toISOString().slice(0,10)}`,
      });
    } catch (e) { console.warn("queue payment_chase_draft failed", e); }
  }

  return { ok: true };
}
