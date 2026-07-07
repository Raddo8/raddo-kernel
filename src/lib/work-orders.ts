/**
 * Work orders — dispatch envelopes for the external COB engine.
 *
 * The app never performs or simulates intelligence work. Intelligence-class
 * transitions (qualify / deep dive / build asset / prepare send) create a
 * WORK ORDER instead of advancing state. The engine picks it up via the
 * cob-operator API, does the work, and completes it with an approval_request
 * that flows through UX05 to advance state.
 */
import { supabase } from "@/integrations/supabase/client";

export type WorkOrderType =
  | "qualify_enrichment"
  | "deepdive"
  | "build_asset"
  | "prepare_send"
  | "draft_nudge"
  | "revisit";

export type WorkOrderStatus =
  | "queued" | "claimed" | "in_progress" | "done" | "failed" | "cancelled";

export type WorkOrderCreatedBy = "manual" | "autopilot" | "playbook";

export interface WorkOrder {
  id: string;
  workspace_id: string;
  item_id: string;
  order_type: WorkOrderType;
  params: Record<string, unknown>;
  status: WorkOrderStatus;
  created_by: WorkOrderCreatedBy;
  claimed_by: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  result_note: string | null;
  created_at: string;
  updated_at: string;
}

const ACTIVE_STATUSES: WorkOrderStatus[] = ["queued", "claimed", "in_progress"];

/** Return the active (queued/claimed/in-progress) work order for this item+type, if any. */
export async function findActiveWorkOrder(itemId: string, orderType: WorkOrderType) {
  const { data } = await (supabase as any)
    .from("work_orders")
    .select("*")
    .eq("item_id", itemId)
    .eq("order_type", orderType)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as WorkOrder) || null;
}

/** All active work orders for a set of items, grouped by item_id. */
export async function activeWorkOrdersByItem(itemIds: string[]) {
  if (itemIds.length === 0) return {} as Record<string, WorkOrder[]>;
  const { data } = await (supabase as any)
    .from("work_orders")
    .select("*")
    .in("item_id", itemIds)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false });
  const by: Record<string, WorkOrder[]> = {};
  for (const w of (data || []) as WorkOrder[]) (by[w.item_id] ||= []).push(w);
  return by;
}

/** Create a work order. Idempotent: no-op if an active order of the same type exists. */
export async function queueWorkOrder(args: {
  workspaceId: string;
  itemId: string;
  orderType: WorkOrderType;
  createdBy?: WorkOrderCreatedBy;
  params?: Record<string, unknown>;
}): Promise<{ created: boolean; workOrder: WorkOrder | null; error?: string }> {
  const existing = await findActiveWorkOrder(args.itemId, args.orderType);
  if (existing) return { created: false, workOrder: existing };
  const { data, error } = await (supabase as any).from("work_orders").insert({
    workspace_id: args.workspaceId,
    item_id: args.itemId,
    order_type: args.orderType,
    created_by: args.createdBy ?? "manual",
    params: args.params ?? {},
    status: "queued",
  }).select("*").single();
  if (error) return { created: false, workOrder: null, error: error.message };
  return { created: true, workOrder: data as WorkOrder };
}

export function orderTypeLabel(t: WorkOrderType): string {
  switch (t) {
    case "qualify_enrichment": return "qualify · enrichment";
    case "deepdive": return "deep dive";
    case "build_asset": return "build asset";
    case "prepare_send": return "prepare send";
    case "draft_nudge": return "draft nudge";
    case "revisit": return "revisit";
  }
}
