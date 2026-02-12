import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { writeTimeline } from "./write-timeline.ts";

// ── Constants ──

const TERMINAL_STATUSES = ["completed", "failed", "canceled"];
const EXECUTABLE_STATUSES = ["scheduled", "approved"];
const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

const ALLOWED_VARIABLES = new Set([
  "item.title",
  "item.amount",
  "item.due_date",
  "item.id",
  "account.name",
  "contact.name",
  "contact.email",
  "contact.phone",
  "response_url",
]);

// ── Types ──

interface TemplateContext {
  item?: Record<string, unknown>;
  account?: Record<string, unknown>;
  contact?: Record<string, unknown>;
  response_url?: string;
}

export interface ExecuteActionCoreResult {
  success: boolean;
  error?: string;
  recovered?: boolean;
  reset_to?: string;
  failed?: boolean;
  skipped?: boolean;
  provider_message_id?: string;
}

type SupabaseClient = ReturnType<typeof createClient>;

// ── Template rendering ──

function resolve(path: string, ctx: TemplateContext): string | undefined {
  // Handle top-level variables like response_url (no dot)
  if (!path.includes(".")) {
    const val = ctx[path as keyof TemplateContext];
    if (val === null || val === undefined) return undefined;
    return String(val);
  }
  const [root, key] = path.split(".");
  const obj = ctx[root as keyof TemplateContext];
  if (!obj || typeof obj !== "object" || !(key in (obj as Record<string, unknown>))) return undefined;
  const val = (obj as Record<string, unknown>)[key];
  if (val === null || val === undefined) return "";
  return String(val);
}

function renderString(template: string, ctx: TemplateContext, errors: string[]): string {
  return template.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (_match, raw: string) => {
    const variable = raw.trim();
    if (!ALLOWED_VARIABLES.has(variable)) {
      errors.push(`Unknown variable: ${variable}`);
      return `[unknown: ${variable}]`;
    }
    const value = resolve(variable, ctx);
    if (value === undefined) {
      errors.push(`Variable "${variable}" could not be resolved from context`);
      return "";
    }
    return value;
  });
}

// ── Recipient resolution ──

async function resolveRecipient(
  supabase: SupabaseClient,
  action: Record<string, unknown>,
  item: Record<string, unknown>
): Promise<{
  contact: { id: string; name: string; email: string; phone: string | null } | null;
  error?: string;
}> {
  const accountId = item.account_id as string;

  // 1. Explicit contact_id on the action
  if (action.contact_id) {
    const { data } = await supabase
      .from("contacts")
      .select("id, name, email, phone")
      .eq("id", action.contact_id)
      .maybeSingle();
    if (data?.email) return { contact: data };
  }

  // 2. Account primary_contact_id
  const { data: account } = await supabase
    .from("accounts")
    .select("primary_contact_id")
    .eq("id", accountId)
    .maybeSingle();

  if (account?.primary_contact_id) {
    const { data } = await supabase
      .from("contacts")
      .select("id, name, email, phone")
      .eq("id", account.primary_contact_id)
      .maybeSingle();
    if (data?.email) return { contact: data };
  }

  // 3. Most recent contact for this account
  const { data: recentContact } = await supabase
    .from("contacts")
    .select("id, name, email, phone")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentContact?.email) return { contact: recentContact };

  return { contact: null, error: "No contact with email found for this account" };
}

// ── Fail helper ──

async function failAction(
  supabase: SupabaseClient,
  actionId: string,
  error: string,
  renderErrors: string[],
  extra?: Record<string, unknown>
) {
  await supabase
    .from("actions")
    .update({
      status: "failed" as any,
      result_json: { error, render_errors: renderErrors, ...extra },
    })
    .eq("id", actionId);
}

// ── Main execution core ──

export async function executeActionCore(
  supabase: SupabaseClient,
  actionId: string,
  opts: {
    userId?: string | null;
    source: string;
    manualRetry?: boolean;
  }
): Promise<ExecuteActionCoreResult> {
  const { userId = null, source, manualRetry = false } = opts;

  // ── 1. Load action with joins ──
  const { data: action, error: loadErr } = await supabase
    .from("actions")
    .select("*, items(id, title, amount, due_date, account_id, workspace_id, accounts(id, name))")
    .eq("id", actionId)
    .maybeSingle();

  if (loadErr || !action) {
    return { success: false, error: loadErr?.message || "Action not found" };
  }

  const item = action.items as Record<string, unknown>;
  const account = (item as any)?.accounts as Record<string, unknown> | undefined;
  const accountId = item?.account_id as string;

  // ── 2. Stuck-running recovery ──
  if (action.status === "running") {
    const claimedAt = action.claimed_at ? new Date(action.claimed_at).getTime() : 0;
    const isStuck = !action.claimed_at || (Date.now() - claimedAt > STUCK_THRESHOLD_MS);

    if (isStuck) {
      // Terminal failure for stuck actions
      await failAction(supabase, actionId, "Execution timeout: stuck in running for >10 minutes", []);

      if (accountId) {
        await writeTimeline(supabase, {
          accountId,
          itemId: action.item_id,
          direction: "system",
          channel: "system",
          summary: `Action failed: execution timeout (${action.type})`,
        });
      }

      return { success: true, recovered: true, failed: true };
    }

    return { success: false, error: "Action is currently running" };
  }

  // ── 3. Status guard ──
  if (TERMINAL_STATUSES.includes(action.status)) {
    return { success: false, error: `Action is in terminal status: ${action.status}` };
  }
  if (!EXECUTABLE_STATUSES.includes(action.status)) {
    return { success: false, error: `Action status "${action.status}" is not executable` };
  }

  // ── 4. Provider idempotency guard ──
  const existingResult = action.result_json as Record<string, unknown> | null;
  if (existingResult?.provider_message_id && !manualRetry) {
    return { success: false, error: "Already sent (provider_message_id exists). Set manualRetry=true to resend." };
  }

  // ── 5. Atomic claim ──
  const { data: claimed, error: claimErr } = await supabase
    .from("actions")
    .update({
      status: "running" as any,
      claimed_by: userId || null,
      claimed_at: new Date().toISOString(),
      actor_user_id: userId || null,
      source,
    } as any)
    .eq("id", actionId)
    .in("status", EXECUTABLE_STATUSES as any)
    .select("id");

  if (claimErr) {
    console.error("[execute-action-core] Claim DB error:", JSON.stringify(claimErr));
    return { success: false, error: `Claim failed: ${claimErr.message}` };
  }
  if (!claimed || claimed.length === 0) {
    return { success: false, error: "Action already claimed by another process" };
  }

  // ── 6. Write execution-start timeline ──
  if (accountId) {
    await writeTimeline(supabase, {
      accountId,
      itemId: action.item_id,
      direction: "system",
      channel: "system",
      summary: `Action execution started: ${action.type} via ${action.channel || "system"}`,
    });
  }

  // ── 6b. present_options fail-fast checks ──
  if (action.type === "present_options") {
    const siteUrl = Deno.env.get("SITE_URL");
    if (!siteUrl) {
      await failAction(supabase, actionId, "SITE_URL required for present_options", []);
      if (accountId) {
        await writeTimeline(supabase, {
          accountId, itemId: action.item_id, direction: "system", channel: "system",
          summary: "Action failed: SITE_URL not configured (present_options)",
        });
      }
      return { success: false, error: "SITE_URL required for present_options" };
    }
    if (!action.template_id) {
      await failAction(supabase, actionId, "present_options requires a template", []);
      if (accountId) {
        await writeTimeline(supabase, {
          accountId, itemId: action.item_id, direction: "system", channel: "system",
          summary: "Action failed: present_options requires a template",
        });
      }
      return { success: false, error: "present_options requires a template" };
    }
  }

  // ── 7. Load & render template ──
  let renderedSubject = "";
  let renderedBody = `Action executed: ${action.type}`;
  const renderErrors: string[] = [];
  let contact: { id: string; name: string; email: string; phone: string | null } | null = null;

  try {
    if (action.template_id) {
      const { data: template } = await supabase
        .from("templates")
        .select("subject, body")
        .eq("id", action.template_id)
        .maybeSingle();

      if (template) {
        if (item?.account_id) {
          const resolved = await resolveRecipient(supabase, action as any, item);
          contact = resolved.contact;
        }

        const ctx: TemplateContext = {
          item: item
            ? { id: item.id, title: item.title, amount: item.amount, due_date: item.due_date }
            : undefined,
          account: account ? { name: account.name } : undefined,
          contact: contact
            ? { name: contact.name, email: contact.email, phone: contact.phone }
            : undefined,
        };
        renderedSubject = renderString(template.subject || "", ctx, renderErrors);
        renderedBody = renderString(template.body, ctx, renderErrors);
      }
    }
  } catch (renderErr) {
    const errMsg = renderErr instanceof Error ? renderErr.message : "Template render error";
    await failAction(supabase, actionId, errMsg, renderErrors);

    if (accountId) {
      await writeTimeline(supabase, {
        accountId,
        itemId: action.item_id,
        direction: "system",
        channel: "system",
        summary: `Action failed: template render error (${action.type})`,
      });
    }

    return { success: false, error: errMsg };
  }

  // ── 8a. Token generation for present_options (before email send) ──
  let responseUrl: string | undefined;
  if (action.type === "present_options") {
    // Non-retryable: check for existing response row
    const { data: existingResp } = await supabase
      .from("action_responses")
      .select("id")
      .eq("action_id", actionId)
      .maybeSingle();

    if (existingResp) {
      await failAction(supabase, actionId, "present_options cannot be retried after token issuance", renderErrors);
      if (accountId) {
        await writeTimeline(supabase, {
          accountId, itemId: action.item_id, direction: "system", channel: "system",
          summary: "Action failed: token already issued, cannot retry (present_options)",
        });
      }
      return { success: false, error: "present_options cannot be retried after token issuance" };
    }

    // Generate 32-byte token
    const { encode: base64urlEncode } = await import("https://deno.land/std@0.224.0/encoding/base64url.ts");
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = base64urlEncode(tokenBytes);

    // SHA-256 hash for storage
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, "0")).join("");

    const payload = action.payload_json as Record<string, unknown> | null;
    const DEFAULT_OPTIONS = [
      { key: "pay_full", label: "Pay in Full" },
      { key: "request_extension", label: "Request Extension" },
      { key: "payment_plan", label: "Propose Payment Plan" },
      { key: "dispute", label: "Dispute" },
    ];
    const options = (payload?.options as Array<{ key: string; label: string }>) ?? DEFAULT_OPTIONS;
    const expiresInDays = (payload?.expires_in_days as number) ?? 7;
    const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();
    const itemRef = (item.id as string).slice(-6);

    const { error: insertErr } = await supabase.from("action_responses").insert({
      action_id: actionId,
      workspace_id: action.workspace_id,
      token_hash: tokenHash,
      options,
      expires_at: expiresAt,
      item_ref: itemRef,
    });

    if (insertErr) {
      await failAction(supabase, actionId, `Response row creation failed: ${insertErr.message}`, renderErrors);
      if (accountId) {
        await writeTimeline(supabase, {
          accountId, itemId: action.item_id, direction: "system", channel: "system",
          summary: "Action failed: could not create response row (present_options)",
        });
      }
      return { success: false, error: insertErr.message };
    }

    const siteUrl = Deno.env.get("SITE_URL")!;
    responseUrl = `${siteUrl}/respond/${token}`;

    // Re-render template with response_url injected
    if (action.template_id) {
      const ctx: TemplateContext = {
        item: item ? { id: item.id, title: item.title, amount: item.amount, due_date: item.due_date } : undefined,
        account: account ? { name: account.name } : undefined,
        contact: contact ? { name: contact.name, email: contact.email, phone: contact.phone } : undefined,
        response_url: responseUrl,
      };
      const { data: tmpl } = await supabase.from("templates").select("subject, body").eq("id", action.template_id).maybeSingle();
      if (tmpl) {
        renderErrors.length = 0;
        renderedSubject = renderString(tmpl.subject || "", ctx, renderErrors);
        renderedBody = renderString(tmpl.body, ctx, renderErrors);
      }
    }
  }

  // ── 8b. Channel routing ──
  if (action.channel === "email" && (action.type === "send_message" || action.type === "present_options")) {
    const result = await executeEmail(
      supabase, action, actionId, item, account, contact,
      renderedSubject, renderedBody, renderErrors
    );

    // Non-retryable: if email failed after token issuance for present_options
    if (!result.success && action.type === "present_options") {
      // Action already failed inside executeEmail, but ensure it's terminal
      if (accountId) {
        await writeTimeline(supabase, {
          accountId, itemId: action.item_id, direction: "system", channel: "system",
          summary: "Action failed: email send failed after token issuance. Manual requeue required.",
        });
      }
    }

    return result;
  } else {
    return await executeMock(
      supabase, action, actionId, item,
      renderedSubject, renderedBody, renderErrors
    );
  }
}

// ── Email execution ──

async function executeEmail(
  supabase: SupabaseClient,
  action: any,
  actionId: string,
  item: Record<string, unknown>,
  account: Record<string, unknown> | undefined,
  existingContact: { id: string; name: string; email: string; phone: string | null } | null,
  renderedSubject: string,
  renderedBody: string,
  renderErrors: string[]
): Promise<ExecuteActionCoreResult> {
  const accountId = item?.account_id as string;

  let contact = existingContact;
  if (!contact) {
    const resolved = await resolveRecipient(supabase, action, item);
    contact = resolved.contact;
    if (!contact) {
      const errMsg = resolved.error || "No recipient contact found";
      await failAction(supabase, actionId, errMsg, renderErrors);

      if (accountId) {
        await writeTimeline(supabase, {
          accountId,
          itemId: action.item_id,
          direction: "system",
          channel: "system",
          summary: `Action failed: ${errMsg} (${action.type})`,
        });
      }

      return { success: false, error: errMsg };
    }
  }

  // ── Provider check: missing key = terminal failure ──
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    await failAction(supabase, actionId, "RESEND_API_KEY not configured", renderErrors, {
      error_code: "provider_not_configured",
    });

    if (accountId) {
      await writeTimeline(supabase, {
        accountId,
        itemId: action.item_id,
        direction: "system",
        channel: "system",
        summary: `Action failed: email provider not configured (${action.type})`,
      });
    }

    return { success: false, error: "provider_not_configured" };
  }

  // ── Resolve from address from workspace connector ──
  const { data: connector } = await supabase
    .from("connectors")
    .select("config")
    .eq("type", "email" as any)
    .eq("workspace_id", action.workspace_id as any)
    .maybeSingle();

  const cfg = connector?.config as Record<string, string> | undefined;
  const fromEmail = cfg?.from_email;
  const fromName = cfg?.from_name;

  if (!fromEmail || !fromName) {
    const errMsg = "from_address_not_configured: set from_email and from_name in the email connector config";
    await failAction(supabase, actionId, errMsg, renderErrors, {
      error_code: "from_address_not_configured",
    });
    if (accountId) {
      await writeTimeline(supabase, {
        accountId,
        itemId: action.item_id,
        direction: "system",
        channel: "system",
        summary: `Action failed: email connector missing from_email/from_name (${action.type})`,
      });
    }
    return { success: false, error: "from_address_not_configured" };
  }

  // ── Suppression check ──
  const { data: suppressed } = await supabase
    .from("suppression_list")
    .select("id, reason")
    .eq("workspace_id", action.workspace_id)
    .eq("email", contact.email.toLowerCase())
    .maybeSingle();

  if (suppressed) {
    const errMsg = `Recipient suppressed (${suppressed.reason})`;
    await failAction(supabase, actionId, errMsg, renderErrors, {
      error_code: "suppressed_recipient",
      suppression_reason: suppressed.reason,
    });

    if (accountId) {
      await writeTimeline(supabase, {
        accountId,
        itemId: action.item_id,
        direction: "system",
        channel: "email",
        summary: `Action failed: recipient suppressed – ${suppressed.reason} (${action.type})`,
      });
    }

    return { success: false, error: errMsg };
  }

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [contact.email],
      subject: renderedSubject || `Action: ${action.type}`,
      html: renderedBody,
    }),
  });

  const resendResult = await resendResponse.json();

  if (!resendResponse.ok) {
    const errMsg = resendResult?.message || resendResult?.error || "Resend API error";
    await failAction(supabase, actionId, errMsg, renderErrors);

    if (accountId) {
      await writeTimeline(supabase, {
        accountId,
        itemId: action.item_id,
        direction: "system",
        channel: "email",
        summary: `Action failed: email send error (${action.type})`,
      });
    }

    return { success: false, error: `Email send failed: ${errMsg}` };
  }

  // ── Success ──
  const resultJson = {
    provider: "resend",
    provider_message_id: resendResult.id,
    rendered_subject: renderedSubject,
    render_errors: renderErrors,
    recipient_email: contact.email,
    recipient_contact_id: contact.id,
  };

  const { data: updated, error: updateErr } = await supabase
    .from("actions")
    .update({
      status: "completed" as any,
      executed_at: new Date().toISOString(),
      result_json: resultJson,
      provider: "resend",
      provider_message_id: resendResult.id,
    } as any)
    .eq("id", actionId)
    .select("id, status, provider, provider_message_id")
    .single();

  if (updateErr) {
    console.error("[executeEmail] Success update failed:", JSON.stringify(updateErr));
  }

  // Verify provider columns actually persisted (also fallback if update returned null/error)
  const needsFallback = updateErr || !updated || !updated.provider || !updated.provider_message_id;
  if (needsFallback) {
    console.error("[executeEmail] Provider fields missing after update. Attempting fallback.", {
      actionId, provider_message_id: resendResult.id,
    });

    const { error: fallbackErr } = await supabase
      .from("actions")
      .update({
        provider: "resend",
        provider_message_id: resendResult.id,
      } as any)
      .eq("id", actionId);

    if (fallbackErr) {
      console.error("[executeEmail] Fallback also failed:", JSON.stringify(fallbackErr));

      // Write persistence warning into result_json + timeline
      await supabase.from("actions").update({
        result_json: { ...resultJson, persistence_warning: "provider_columns_failed" },
      } as any).eq("id", actionId);

      if (accountId) {
        await writeTimeline(supabase, {
          accountId,
          itemId: action.item_id,
          direction: "system",
          channel: "email",
          summary: `Warning: email sent but provider columns failed to persist (${action.type})`,
        });
      }
    }
  }

  // Timeline: email sent
  await writeTimeline(supabase, {
    accountId,
    itemId: action.item_id,
    contactId: contact.id,
    direction: "outbound",
    channel: "email",
    summary: `Email sent: ${renderedSubject || action.type}`,
    body: renderedBody?.substring(0, 500) || null,
  });

  return { success: true, provider_message_id: resendResult.id };
}

// ── Mock execution ──

async function executeMock(
  supabase: SupabaseClient,
  action: any,
  actionId: string,
  item: Record<string, unknown>,
  renderedSubject: string,
  renderedBody: string,
  renderErrors: string[]
): Promise<ExecuteActionCoreResult> {
  const accountId = item?.account_id as string;

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

    if (accountId) {
      await writeTimeline(supabase, {
        accountId,
        itemId: action.item_id,
        direction: "outbound",
        channel: action.channel || "system",
        summary: `Action executed: ${action.type}`,
        body: renderedBody ? renderedBody.substring(0, 500) : null,
      });
    }

    return { success: true };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown execution error";
    await failAction(supabase, actionId, errorMessage, renderErrors);

    if (accountId) {
      await writeTimeline(supabase, {
        accountId,
        itemId: action.item_id,
        direction: "system",
        channel: "system",
        summary: `Action failed: ${errorMessage} (${action.type})`,
      });
    }

    return { success: false, error: errorMessage };
  }
}
