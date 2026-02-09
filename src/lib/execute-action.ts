/**
 * Single entry point for all outbound effects (execution boundary).
 *
 * UI components must NEVER execute actions directly. All execution
 * flows through executeAction().
 *
 * Routing:
 *   channel=email + type=send_message → edge function execute-action-email
 *   everything else                   → local mock execution
 */

import { supabase } from "@/integrations/supabase/client";
import { renderTemplate, type TemplateContext } from "@/lib/render-template";
import { writeTimelineEvent } from "@/lib/timeline-events";

// Terminal statuses — execution is permanently denied.
const TERMINAL_STATUSES = ["completed", "failed", "canceled"];

// Statuses eligible for execution.
const EXECUTABLE_STATUSES = ["scheduled", "approved"];

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
  const { actionId, actorUserId, source = "system", manualRetry = false } = params;

  // --- Load action (light read for routing decision) ---
  const { data: action, error: loadError } = await supabase
    .from("actions")
    .select("*, items(id, title, amount, due_date, account_id, workspace_id, accounts(id, name))")
    .eq("id", actionId)
    .maybeSingle();

  if (loadError || !action) {
    return { success: false, error: loadError?.message || "Action not found" };
  }

  // --- Status guard ---
  if (TERMINAL_STATUSES.includes(action.status)) {
    return { success: false, error: `Action is in terminal status: ${action.status}` };
  }

  if (!EXECUTABLE_STATUSES.includes(action.status)) {
    return { success: false, error: `Action status "${action.status}" is not executable` };
  }

  // --- Route: email+send_message → edge function ---
  if (action.channel === "email" && action.type === "send_message") {
    return executeViaEdgeFunction(actionId, manualRetry);
  }

  // --- Local mock path (non-email actions) ---
  return executeMock(action, actionId, actorUserId, source);
}

// ── Edge function delegation ──

async function executeViaEdgeFunction(
  actionId: string,
  manualRetry: boolean
): Promise<ExecuteActionResult> {
  const { data, error } = await supabase.functions.invoke("execute-action-email", {
    body: { actionId, manualRetry },
  });

  if (error) {
    return { success: false, error: error.message || "Edge function invocation failed" };
  }

  if (data && !data.success) {
    return { success: false, error: data.error || "Email execution failed" };
  }

  return { success: true };
}

// ── Local mock execution (non-email) ──

async function executeMock(
  action: any,
  actionId: string,
  actorUserId?: string,
  source?: string
): Promise<ExecuteActionResult> {
  // --- Conditional update for concurrency guard + execution ownership ---
  const { data: claimed, error: claimError } = await supabase
    .from("actions")
    .update({
      status: "running" as any,
      claimed_by: actorUserId ?? null,
      claimed_at: new Date().toISOString(),
      actor_user_id: actorUserId ?? null,
      source,
    } as any)
    .eq("id", actionId)
    .in("status", EXECUTABLE_STATUSES as any)
    .select("id");

  if (claimError || !claimed || claimed.length === 0) {
    return { success: false, error: "Action already claimed by another process or status changed" };
  }

  // --- Load template if referenced ---
  const item = action.items as any;
  const account = item?.accounts as any;
  const templateId = (action as any).template_id;

  let renderedSubject = "";
  let renderedBody = `Action executed: ${action.type}`;
  let renderErrors: string[] = [];

  if (templateId) {
    const { data: template } = await supabase
      .from("templates")
      .select("subject, body")
      .eq("id", templateId)
      .maybeSingle();

    if (template) {
      let contact: { name?: string; email?: string | null; phone?: string | null } | undefined;
      if (item?.account_id) {
        const { data: contactData } = await supabase
          .from("contacts")
          .select("name, email, phone")
          .eq("account_id", item.account_id)
          .limit(1)
          .maybeSingle();
        if (contactData) contact = contactData;
      }

      const ctx: TemplateContext = {
        item: item ? { id: item.id, title: item.title, amount: item.amount, due_date: item.due_date } : undefined,
        account: account ? { name: account.name } : undefined,
        contact,
      };

      const result = renderTemplate(template.subject, template.body, ctx);
      renderedSubject = result.subject;
      renderedBody = result.body;
      renderErrors = result.renderErrors;
    }
  }

  // --- Mock execution ---
  try {
    await new Promise((r) => setTimeout(r, 500));

    const resultJson = {
      mock: true,
      message: "Simulated execution",
      rendered_subject: renderedSubject,
      render_errors: renderErrors,
    };

    await supabase
      .from("actions")
      .update({
        status: "completed" as any,
        executed_at: new Date().toISOString(),
        result_json: resultJson,
      })
      .eq("id", actionId);

    if (item?.account_id) {
      await writeTimelineEvent({
        accountId: item.account_id,
        itemId: action.item_id,
        direction: "outbound",
        channel: action.channel || "system",
        summary: `Action executed: ${action.type}`,
        body: renderedBody ? renderedBody.substring(0, 500) : undefined,
      });
    }

    return { success: true };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown execution error";

    const resultJson = {
      error: errorMessage,
      render_errors: renderErrors,
    };

    await supabase
      .from("actions")
      .update({
        status: "failed" as any,
        result_json: resultJson,
      })
      .eq("id", actionId);

    return { success: false, error: errorMessage };
  }
}
