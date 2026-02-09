/**
 * Single entry point for all action creation (constraint 1).
 *
 * UI components must NEVER insert into the actions table directly.
 * All action creation flows through queueAction().
 */

import { supabase } from "@/integrations/supabase/client";

export interface QueueActionParams {
  itemId: string;
  type: string;
  channel: string;
  scheduledFor?: string;
  payloadJson?: Record<string, unknown>;
  requiresApproval?: boolean;
  idempotencyKey?: string;
  actorUserId?: string;
  source?: string; // "ui" | "playbook" | "system"
}

export interface QueueActionResult {
  skipped: boolean;
  rateLimited: boolean;
  actionId?: string;
  error?: string;
}

const DEFAULT_RATE_LIMIT = 10; // per hour per item+channel

/**
 * Look up rate-limit threshold from policy_rules for the item's policy.
 */
async function getRateLimit(itemId: string, channel: string): Promise<number> {
  const { data: item } = await supabase
    .from("items")
    .select("policy_id")
    .eq("id", itemId)
    .maybeSingle();

  if (!item?.policy_id) return DEFAULT_RATE_LIMIT;

  const { data: rules } = await supabase
    .from("policy_rules")
    .select("rule_json")
    .eq("policy_id", item.policy_id)
    .eq("rule_type", "rate_limit");

  if (!rules || rules.length === 0) return DEFAULT_RATE_LIMIT;

  for (const rule of rules) {
    const json = rule.rule_json as Record<string, unknown>;
    if (json.channel === channel && typeof json.max_per_hour === "number") {
      return json.max_per_hour;
    }
  }
  return DEFAULT_RATE_LIMIT;
}

export async function queueAction(params: QueueActionParams): Promise<QueueActionResult> {
  const {
    itemId, type, channel,
    scheduledFor = new Date().toISOString(),
    payloadJson = {},
    requiresApproval = false,
    idempotencyKey,
    actorUserId,
    source = "system",
  } = params;

  // --- Rate-limit check ---
  const limit = await getRateLimit(itemId, channel);
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();

  const { count } = await supabase
    .from("actions")
    .select("id", { count: "exact", head: true })
    .eq("item_id", itemId)
    .eq("channel", channel)
    .gte("created_at", oneHourAgo)
    .not("status", "eq", "canceled" as any);

  if ((count ?? 0) >= limit) {
    console.warn(`[queueAction] Rate limit hit: ${count}/${limit} for item=${itemId} channel=${channel}`);
    return { skipped: false, rateLimited: true, error: `Rate limit exceeded (${limit}/hour)` };
  }

  // --- Application-level idempotency check ---
  // Until Step 3 adds a DB-level unique constraint, we check for existing
  // actions with matching item_id + type + channel in a ±1 minute window
  // around scheduledFor.
  if (idempotencyKey) {
    const windowStart = new Date(new Date(scheduledFor).getTime() - 60_000).toISOString();
    const windowEnd = new Date(new Date(scheduledFor).getTime() + 60_000).toISOString();

    const { data: existing } = await supabase
      .from("actions")
      .select("id")
      .eq("item_id", itemId)
      .eq("type", type)
      .eq("channel", channel)
      .gte("scheduled_for", windowStart)
      .lte("scheduled_for", windowEnd)
      .limit(1);

    if (existing && existing.length > 0) {
      return { skipped: true, rateLimited: false, actionId: existing[0].id };
    }
  }

  // --- Insert action ---
  // Store idempotency metadata in payload_json until Step 3 adds dedicated columns.
  const enrichedPayload = {
    ...payloadJson,
    _idempotency_key: idempotencyKey ?? null,
    _actor_user_id: actorUserId ?? null,
    _source: source,
  };

  const status = requiresApproval ? "pending_approval" : "scheduled";

  const { data, error } = await supabase
    .from("actions")
    .insert({
      item_id: itemId,
      type,
      channel,
      status: status as any,
      scheduled_for: scheduledFor,
      payload_json: enrichedPayload,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[queueAction] Insert failed:", error.message);
    return { skipped: false, rateLimited: false, error: error.message };
  }

  return { skipped: false, rateLimited: false, actionId: data.id };
}
