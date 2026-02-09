/**
 * Single entry point for all outbound effects (execution boundary).
 *
 * UI components must NEVER execute actions directly. All execution
 * flows through executeAction().
 */

import { supabase } from "@/integrations/supabase/client";
import { renderTemplate, type TemplateContext } from "@/lib/render-template";
import { writeTimelineEvent } from "@/lib/timeline-events";

// Terminal statuses — execution is permanently denied.
const TERMINAL_STATUSES = ["completed", "failed", "canceled"];

/**
 * NOTE: 'scheduled' temporarily serves double duty as both
 * auto-scheduled and human-approved until Step 3 adds the
 * 'approved' enum value. Once 'approved' exists, this array
 * will become ["scheduled", "approved"].
 */
const EXECUTABLE_STATUSES = ["scheduled"];

export interface ExecuteActionParams {
  actionId: string;
  actorUserId?: string;
  source?: string; // "ui" | "system"
}

export interface ExecuteActionResult {
  success: boolean;
  error?: string;
}

export async function executeAction(params: ExecuteActionParams): Promise<ExecuteActionResult> {
  const { actionId, actorUserId, source = "system" } = params;

  // --- Load action with joins ---
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

  // --- Conditional update for concurrency guard ---
  // Only claim the action if it's still in an executable status.
  const { data: claimed, error: claimError } = await supabase
    .from("actions")
    .update({ status: "running" as any })
    .eq("id", actionId)
    .in("status", EXECUTABLE_STATUSES as any)
    .select("id");

  if (claimError || !claimed || claimed.length === 0) {
    return { success: false, error: "Action already claimed by another process or status changed" };
  }

  // --- Load template if referenced ---
  const item = action.items as any;
  const account = item?.accounts as any;
  const payload = (action.payload_json || {}) as Record<string, unknown>;

  let renderedSubject = "";
  let renderedBody = `Action executed: ${action.type}`;
  let renderErrors: string[] = [];

  if (payload.template_id) {
    const { data: template } = await supabase
      .from("templates")
      .select("subject, body")
      .eq("id", payload.template_id as string)
      .maybeSingle();

    if (template) {
      // Load primary contact for the account
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

  // --- Mock execution (Step 4 replaces with real Resend call) ---
  try {
    await new Promise((r) => setTimeout(r, 500));

    // --- Mark completed ---
    // renderErrors are ALWAYS persisted to result_json, even on success (constraint 4).
    const resultJson = {
      mock: true,
      message: "Simulated execution",
      rendered_subject: renderedSubject,
      render_errors: renderErrors,
      actor_user_id: actorUserId ?? null,
      source,
    };

    await supabase
      .from("actions")
      .update({
        status: "completed" as any,
        executed_at: new Date().toISOString(),
        result_json: resultJson,
      })
      .eq("id", actionId);

    // --- Write outbound timeline event via centralized helper (constraint 2) ---
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

    // renderErrors are ALWAYS persisted, even on failure (constraint 4).
    const resultJson = {
      error: errorMessage,
      render_errors: renderErrors,
      actor_user_id: actorUserId ?? null,
      source,
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
