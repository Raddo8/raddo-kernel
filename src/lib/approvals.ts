/**
 * Approvals — pending approval requests for the workspace.
 * Approve state_move → runs through changeItemState (respects qualified gate).
 * Approve send_email → flips status, queues internal_task "send approved — fire from cob@".
 * Reject → requires a note.
 */
import { supabase } from "@/integrations/supabase/client";
import { changeItemState } from "@/lib/state-transitions";
import { writeTimelineEvent } from "@/lib/timeline-events";
import { queueAction } from "@/lib/queue-actions";

export type ApprovalKind = "state_move" | "send_email" | "other";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalRequest {
  id: string;
  workspace_id: string;
  item_id: string;
  kind: ApprovalKind;
  payload: Record<string, any>;
  status: ApprovalStatus;
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export async function listApprovals(workspaceId: string, status: ApprovalStatus | "all" = "pending") {
  let q = (supabase as any).from("approval_requests")
    .select("*, items(id, title, account_id, workspace_id, accounts(name)), profiles:requested_by(email, full_name)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as any[];
}

export async function pendingApprovalCount(workspaceId: string): Promise<number> {
  const { count } = await (supabase as any).from("approval_requests")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "pending");
  return count || 0;
}

export async function createApproval(args: {
  workspaceId: string;
  itemId: string;
  kind: ApprovalKind;
  payload: Record<string, any>;
  note?: string;
}) {
  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await (supabase as any).from("approval_requests").insert({
    workspace_id: args.workspaceId,
    item_id: args.itemId,
    kind: args.kind,
    payload: args.payload,
    requested_by: user?.user?.id ?? null,
    note: args.note ?? null,
  }).select("*").single();
  if (error) throw error;
  return data;
}

export async function approveRequest(req: any, actorEmail?: string | null): Promise<{ ok: boolean; error?: string }> {
  const item = req.items;
  if (!item) return { ok: false, error: "Item not found" };

  if (req.kind === "state_move") {
    const targetName = req.payload?.to_state;
    if (!targetName) return { ok: false, error: "Missing to_state" };
    const { data: states } = await supabase.from("item_states")
      .select("id, name, label")
      .eq("workspace_id", item.workspace_id);
    const target = (states || []).find((s: any) => s.name === targetName);
    if (!target) return { ok: false, error: "Unknown target state" };
    const res = await changeItemState({
      item: { id: item.id, account_id: item.account_id, workspace_id: item.workspace_id },
      targetStateId: (target as any).id,
      states: states as any,
    });
    if (!res.ok) return { ok: false, error: res.error };
  } else if (req.kind === "send_email") {
    // Do NOT send — queue an internal_task for the principal to fire the send.
    await queueAction({
      itemId: item.id,
      type: "internal_task",
      channel: "system",
      source: "system",
      payloadJson: {
        task: "send_approved_email",
        note: `Send approved · fire from cob@ · ${req.payload?.email_subject || ""}`.trim(),
        recipient: req.payload?.recipient ?? null,
        subject: req.payload?.email_subject ?? null,
        draft_ref: req.payload?.draft_ref ?? null,
      },
      idempotencyKey: `approval_send:${req.id}`,
    });
  }

  const { data: user } = await supabase.auth.getUser();
  const { error } = await (supabase as any).from("approval_requests")
    .update({ status: "approved", decided_by: user?.user?.id ?? null, decided_at: new Date().toISOString() })
    .eq("id", req.id);
  if (error) return { ok: false, error: error.message };

  await writeTimelineEvent({
    accountId: item.account_id,
    itemId: item.id,
    direction: "system",
    channel: "system",
    summary: `Approval granted · ${req.kind}${actorEmail ? ` by ${actorEmail}` : ""}`,
    rawJson: { approval_id: req.id, payload: req.payload },
  });
  return { ok: true };
}

export async function rejectRequest(req: any, note: string, actorEmail?: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!note.trim()) return { ok: false, error: "Reject note required" };
  const { data: user } = await supabase.auth.getUser();
  const { error } = await (supabase as any).from("approval_requests")
    .update({
      status: "rejected",
      note: note.trim(),
      decided_by: user?.user?.id ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", req.id);
  if (error) return { ok: false, error: error.message };
  const item = req.items;
  if (item) {
    await writeTimelineEvent({
      accountId: item.account_id,
      itemId: item.id,
      direction: "system",
      channel: "system",
      summary: `Approval rejected · ${req.kind}${actorEmail ? ` by ${actorEmail}` : ""}`,
      body: note.trim(),
      rawJson: { approval_id: req.id, payload: req.payload },
    });
  }
  return { ok: true };
}
