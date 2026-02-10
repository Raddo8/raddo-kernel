/**
 * Single entry point for all outbound effects (execution boundary).
 *
 * UI components must NEVER execute actions directly. All execution
 * flows through executeAction(), which delegates to the server-side
 * edge function execute-action-server.
 *
 * The server function handles:
 *   - Status guards and stuck-running recovery
 *   - Atomic claim (concurrency gate)
 *   - Template rendering
 *   - Channel routing (email→Resend, else→mock)
 *   - Timeline writes
 */

import { supabase } from "@/integrations/supabase/client";

export interface ExecuteActionParams {
  actionId: string;
  actorUserId?: string;
  source?: string; // "ui" | "system"
  manualRetry?: boolean;
}

export interface ExecuteActionResult {
  success: boolean;
  error?: string;
}

export async function executeAction(params: ExecuteActionParams): Promise<ExecuteActionResult> {
  const { actionId, manualRetry = false } = params;

  const { data, error } = await supabase.functions.invoke("execute-action-server", {
    body: { actionId, manualRetry },
  });

  if (error) {
    return { success: false, error: error.message || "Edge function invocation failed" };
  }

  if (data && !data.success) {
    return { success: false, error: data.error || "Execution failed" };
  }

  return { success: true };
}
