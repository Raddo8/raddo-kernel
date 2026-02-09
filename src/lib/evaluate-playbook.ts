/**
 * Playbook evaluation engine.
 *
 * On state change, looks up matching playbook steps and queues actions
 * with deterministic idempotency keys to prevent duplicate execution.
 */

import { supabase } from "@/integrations/supabase/client";
import { queueAction } from "@/lib/queue-actions";

export interface EvaluatePlaybookParams {
  itemId: string;
  stateId: string;
  stateName: string;
  itemType: string;
  workspaceId: string;
  actorUserId?: string;
}

export async function evaluatePlaybook(params: EvaluatePlaybookParams): Promise<void> {
  const { itemId, stateName, itemType, workspaceId, actorUserId } = params;

  const { data: playbooks } = await supabase
    .from("playbooks")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("item_type", itemType);

  if (!playbooks || playbooks.length === 0) return;

  for (const pb of playbooks) {
    const { data: steps } = await supabase
      .from("playbook_steps")
      .select("*")
      .eq("playbook_id", pb.id)
      .eq("trigger_state", stateName)
      .order("step_order");

    if (!steps) continue;

    for (const step of steps) {
      const scheduledFor = new Date(
        Date.now() + (step.delay_minutes || 0) * 60_000
      ).toISOString();

      // Deterministic idempotency key prevents duplicate actions
      // for the same item + step + state + schedule window.
      const idempotencyKey = `${itemId}:${step.id}:${stateName}:${scheduledFor}`;

      await queueAction({
        itemId,
        type: step.action_type,
        channel: step.channel || "email",
        scheduledFor,
        requiresApproval: step.requires_approval ?? false,
        idempotencyKey,
        actorUserId,
        source: "playbook",
        payloadJson: {
          template_id: step.template_id,
          step_id: step.id,
          playbook_id: pb.id,
        },
      });
    }
  }
}
