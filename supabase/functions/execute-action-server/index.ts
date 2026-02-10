import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { writeTimeline } from "../_shared/write-timeline.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Constants ──

const TERMINAL_STATUSES = ["completed", "failed", "canceled"];
const EXECUTABLE_STATUSES = ["scheduled", "approved"];
const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const PG_UNIQUE_VIOLATION = "23505";
const DEFAULT_RATE_LIMIT = 10; // per hour per item+channel

// ── Template rendering (allow-listed, mirrored from src/lib/render-template.ts) ──

const ALLOWED_VARIABLES = new Set([
  "item.title",
  "item.amount",
  "item.due_date",
  "item.id",
  "account.name",
  "contact.name",
  "contact.email",
  "contact.phone",
]);

interface TemplateContext {
  item?: Record<string, unknown>;
  account?: Record<string, unknown>;
  contact?: Record<string, unknown>;
}

function resolve(path: string, ctx: TemplateContext): string | undefined {
  const [root, key] = path.split(".");
  const obj = ctx[root as keyof TemplateContext];
  if (!obj || !(key in obj)) return undefined;
  const val = obj[key];
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
  supabase: ReturnType<typeof createClient>,
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

// ── Auth helpers ──

interface AuthResult {
  mode: "scheduler" | "ui";
  supabase: ReturnType<typeof createClient>;
  userId: string | null;
  source: string;
}

async function authenticate(req: Request, requestMode: string): Promise<AuthResult | Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("CRON_SECRET");

  // Check X-CRON-SECRET header first
  const reqCronSecret = req.headers.get("X-CRON-SECRET") || req.headers.get("x-cron-secret");
  if (reqCronSecret && cronSecret && reqCronSecret === cronSecret) {
    // Cron secret is strictly scoped to create mode only
    if (requestMode === "execute") {
      return jsonError("Cron secret not allowed for execute mode", 403);
    }
    const client = createClient(supabaseUrl, serviceRoleKey);
    return { mode: "scheduler", supabase: client, userId: null, source: "scheduler" };
  }

  // Fall back to user JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonError("Unauthorized", 401);
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) {
    return jsonError("Invalid token", 401);
  }

  return { mode: "ui", supabase: client, userId: user.id, source: "ui" };
}

// ── Rate-limit check (server-side) ──

async function getRateLimit(
  supabase: ReturnType<typeof createClient>,
  itemId: string,
  channel: string
): Promise<number> {
  const { data: item } = await supabase
    .from("items")
    .select("policy_id")
    .eq("id", itemId)
    .maybeSingle();

  if (!item?.policy_id) return DEFAULT_RATE_LIMIT;

  const { data: rules } = await supabase
    .from("policy_rate_rules")
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

// ── Create mode handler ──

async function handleCreate(
  supabase: ReturnType<typeof createClient>,
  authResult: AuthResult,
  params: Record<string, unknown>
): Promise<Response> {
  const {
    itemId,
    type,
    channel,
    scheduledFor,
    payloadJson = {},
    requiresApproval = false,
    idempotencyKey,
    actorUserId,
    source,
    templateId,
    playbookStepId,
    triggerState,
    contactId,
  } = params;

  // Validate required params
  if (!itemId || !type || !channel) {
    return jsonError("itemId, type, and channel are required", 400);
  }

  // Fetch item row to get account_id and workspace_id (always server-derived)
  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id, account_id, workspace_id")
    .eq("id", itemId as string)
    .maybeSingle();

  if (itemErr || !item) {
    return jsonError("Item not found", 404);
  }

  const workspaceId = item.workspace_id;
  const accountId = item.account_id;

  // UI mode: verify workspace membership
  if (authResult.mode === "ui" && authResult.userId) {
    const { data: isMember } = await supabase.rpc("is_workspace_member", {
      _user_id: authResult.userId,
      _workspace_id: workspaceId,
    });
    if (!isMember) return jsonError("Not a workspace member", 403);
  }

  // Rate-limit check
  const limit = await getRateLimit(supabase, itemId as string, channel as string);
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();

  const { count } = await supabase
    .from("actions")
    .select("id", { count: "exact", head: true })
    .eq("item_id", itemId as string)
    .eq("channel", channel as string)
    .gte("created_at", oneHourAgo)
    .not("status", "eq", "canceled" as any);

  if ((count ?? 0) >= limit) {
    console.warn(
      `[execute-action-server] Rate limit hit: ${count}/${limit} for item=${itemId} channel=${channel}`
    );
    return jsonOk({
      success: true,
      skipped: true,
      reason: "rate_limited",
    });
  }

  // Insert action row
  const status = requiresApproval ? "pending_approval" : "scheduled";
  const effectiveScheduledFor = (scheduledFor as string) || new Date().toISOString();
  const effectiveSource = (source as string) || (authResult.mode === "ui" ? "ui" : "system");

  const { data: inserted, error: insertErr } = await supabase
    .from("actions")
    .insert({
      item_id: itemId as string,
      workspace_id: workspaceId,
      type: type as string,
      channel: channel as string,
      status: status as any,
      scheduled_for: effectiveScheduledFor,
      payload_json: payloadJson,
      idempotency_key: (idempotencyKey as string) ?? null,
      template_id: (templateId as string) ?? null,
      requires_approval: requiresApproval as boolean,
      actor_user_id: (actorUserId as string) || authResult.userId || null,
      source: effectiveSource,
      trigger_state: (triggerState as string) ?? null,
      playbook_step_id: (playbookStepId as string) ?? null,
      contact_id: (contactId as string) ?? null,
    } as any)
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code === PG_UNIQUE_VIOLATION && idempotencyKey) {
      console.info(`[execute-action-server] Idempotency skip: key=${idempotencyKey}`);
      return jsonOk({ success: true, skipped: true, reason: "duplicate" });
    }
    console.error("[execute-action-server] Insert failed:", insertErr.message);
    return jsonError(insertErr.message, 500);
  }

  // Write queue-stage timeline event
  await writeTimeline(supabase, {
    accountId,
    itemId: itemId as string,
    direction: "system",
    channel: "system",
    summary: `Action queued: ${type} via ${channel}`,
  });

  return jsonOk({
    success: true,
    actionId: inserted.id,
    skipped: false,
    rateLimited: false,
  });
}

// ── Main handler ──

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Parse body ──
    const body = await req.json();

    // Determine mode: explicit mode field, or legacy (actionId present → execute)
    const mode: string = body.mode || (body.actionId ? "execute" : "");
    if (!mode) {
      return jsonError("mode is required (create or execute)", 400);
    }

    // ── Auth (pass mode so cron secret can be scoped) ──
    const authResult = await authenticate(req, mode);
    if (authResult instanceof Response) return authResult;

    const { supabase, userId, source } = authResult;

    // ── Create mode ──
    if (mode === "create") {
      const params = body.params || {};
      return await handleCreate(supabase, authResult, params);
    }

    // ── Execute mode ──
    const actionId = body.actionId;
    const manualRetry = body.manualRetry;
    if (!actionId) return jsonError("actionId is required", 400);

    // ── Load action with joins ──
    const { data: action, error: loadErr } = await supabase
      .from("actions")
      .select("*, items(id, title, amount, due_date, account_id, workspace_id, accounts(id, name))")
      .eq("id", actionId)
      .maybeSingle();

    if (loadErr || !action) {
      return jsonError(loadErr?.message || "Action not found", 404);
    }

    const item = action.items as Record<string, unknown>;
    const account = (item as any)?.accounts as Record<string, unknown> | undefined;

    // ── Workspace membership check (UI mode only) ──
    if (authResult.mode === "ui" && userId) {
      const { data: isMember } = await supabase.rpc("is_workspace_member", {
        _user_id: userId,
        _workspace_id: action.workspace_id,
      });
      if (!isMember) return jsonError("Not a workspace member", 403);
    }

    // ── Stuck-running recovery ──
    if (action.status === "running") {
      const claimedAt = action.claimed_at ? new Date(action.claimed_at).getTime() : 0;
      const age = Date.now() - claimedAt;

      if (age > STUCK_THRESHOLD_MS) {
        const resultJson = action.result_json as Record<string, unknown> | null;

        if (resultJson?.provider_not_configured === true) {
          await supabase
            .from("actions")
            .update({
              status: "scheduled" as any,
              claimed_by: null,
              claimed_at: null,
            } as any)
            .eq("id", actionId);

          return jsonOk({ success: true, recovered: true, reset_to: "scheduled" });
        } else {
          await supabase
            .from("actions")
            .update({
              status: "failed" as any,
              result_json: { error: "Execution timeout: stuck in running for >10 minutes" },
            })
            .eq("id", actionId);

          return jsonOk({ success: true, recovered: true, failed: true });
        }
      }

      return jsonError("Action is currently running", 409);
    }

    // ── Status guard ──
    if (TERMINAL_STATUSES.includes(action.status)) {
      return jsonError(`Action is in terminal status: ${action.status}`, 409);
    }
    if (!EXECUTABLE_STATUSES.includes(action.status)) {
      return jsonError(`Action status "${action.status}" is not executable`, 409);
    }

    // ── Provider idempotency guard ──
    const existingResult = action.result_json as Record<string, unknown> | null;
    if (existingResult?.provider_message_id && manualRetry !== true) {
      return jsonError("Already sent (provider_message_id exists). Set manualRetry=true to resend.", 409);
    }

    // ── Save prior status, then atomic claim ──
    const priorStatus = action.status;
    const claimerId = userId || null;

    const { data: claimed, error: claimErr } = await supabase
      .from("actions")
      .update({
        status: "running" as any,
        claimed_by: claimerId,
        claimed_at: new Date().toISOString(),
        actor_user_id: userId || null,
        source,
      } as any)
      .eq("id", actionId)
      .in("status", EXECUTABLE_STATUSES as any)
      .select("id");

    if (claimErr) {
      console.error("[execute-action-server] Claim DB error:", JSON.stringify(claimErr));
      return jsonError(`Claim failed: ${claimErr.message}`, 409);
    }
    if (!claimed || claimed.length === 0) {
      console.error("[execute-action-server] Claim returned 0 rows. actionId:", actionId, "status was:", priorStatus);
      return jsonError("Action already claimed by another process", 409);
    }

    // ── Load & render template ──
    let renderedSubject = "";
    let renderedBody = `Action executed: ${action.type}`;
    const renderErrors: string[] = [];

    let contact: { id: string; name: string; email: string; phone: string | null } | null = null;

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

    // ── Channel routing ──
    if (action.channel === "email" && action.type === "send_message") {
      return await executeEmail(
        supabase, action, actionId, item, account, contact, priorStatus,
        renderedSubject, renderedBody, renderErrors
      );
    } else {
      return await executeMock(
        supabase, action, actionId, item, renderedSubject, renderedBody, renderErrors
      );
    }
  } catch (err) {
    console.error("[execute-action-server] Unhandled:", err);
    return jsonError(err instanceof Error ? err.message : "Internal error", 500);
  }
});

// ── Email execution path ──

async function executeEmail(
  supabase: ReturnType<typeof createClient>,
  action: any,
  actionId: string,
  item: Record<string, unknown>,
  account: Record<string, unknown> | undefined,
  existingContact: { id: string; name: string; email: string; phone: string | null } | null,
  priorStatus: string,
  renderedSubject: string,
  renderedBody: string,
  renderErrors: string[]
): Promise<Response> {
  let contact = existingContact;
  if (!contact) {
    const resolved = await resolveRecipient(supabase, action, item);
    contact = resolved.contact;
    if (!contact) {
      await failAction(supabase, actionId, resolved.error || "No recipient", renderErrors);
      return jsonError(resolved.error || "No recipient contact found", 422);
    }
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    await supabase
      .from("actions")
      .update({
        status: priorStatus as any,
        claimed_by: null,
        claimed_at: null,
        result_json: {
          provider_not_configured: true,
          error: "RESEND_API_KEY not configured",
          render_errors: renderErrors,
        },
      } as any)
      .eq("id", actionId);

    return jsonError("RESEND_API_KEY is not configured. Add the secret to activate live email.", 503);
  }

  let fromEmail = "noreply@example.com";
  let fromName = "Casey";
  const { data: connector } = await supabase
    .from("connectors")
    .select("config")
    .eq("type", "email" as any)
    .eq("workspace_id", action.workspace_id as any)
    .maybeSingle();

  if (connector?.config) {
    const cfg = connector.config as Record<string, string>;
    if (cfg.from_email) fromEmail = cfg.from_email;
    if (cfg.from_name) fromName = cfg.from_name;
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
    return jsonError(`Email send failed: ${errMsg}`, 502);
  }

  const resultJson = {
    provider: "resend",
    provider_message_id: resendResult.id,
    rendered_subject: renderedSubject,
    render_errors: renderErrors,
    recipient_email: contact.email,
    recipient_contact_id: contact.id,
  };

  await supabase
    .from("actions")
    .update({
      status: "completed" as any,
      executed_at: new Date().toISOString(),
      result_json: resultJson,
    })
    .eq("id", actionId);

  await writeTimeline(supabase, {
    accountId: item.account_id as string,
    itemId: action.item_id,
    contactId: contact.id,
    direction: "outbound",
    channel: "email",
    summary: `Email sent: ${renderedSubject || action.type}`,
    body: renderedBody?.substring(0, 500) || null,
  });

  return jsonOk({ success: true, provider_message_id: resendResult.id });
}

// ── Mock execution path (non-email) ──

async function executeMock(
  supabase: ReturnType<typeof createClient>,
  action: any,
  actionId: string,
  item: Record<string, unknown>,
  renderedSubject: string,
  renderedBody: string,
  renderErrors: string[]
): Promise<Response> {
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

    const accountId = item?.account_id as string;
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

    return jsonOk({ success: true });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown execution error";
    await failAction(supabase, actionId, errorMessage, renderErrors);
    return jsonError(errorMessage, 500);
  }
}

// ── Response helpers ──

function jsonOk(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function failAction(
  supabase: ReturnType<typeof createClient>,
  actionId: string,
  error: string,
  renderErrors: string[]
) {
  await supabase
    .from("actions")
    .update({
      status: "failed" as any,
      result_json: { error, render_errors: renderErrors },
    })
    .eq("id", actionId);
}
