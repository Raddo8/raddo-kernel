/**
 * Single entry point for all action creation (constraint 1).
 *
 * UI components must NEVER insert into the actions table directly.
 * All action creation flows through queueAction() → execute-action-server.
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
  templateId?: string;
  playbookStepId?: string;
  triggerState?: string;
  contactId?: string;
}

export interface QueueActionResult {
  skipped: boolean;
  rateLimited: boolean;
  actionId?: string;
  error?: string;
}

export async function queueAction(params: QueueActionParams): Promise<QueueActionResult> {
  const { data, error } = await supabase.functions.invoke("execute-action-server", {
    body: { mode: "create", params },
  });

  if (error) {
    return { skipped: false, rateLimited: false, error: error.message };
  }

  return {
    skipped: data.skipped ?? false,
    rateLimited: data.reason === "rate_limited",
    actionId: data.actionId,
    error: data.error,
  };
}
