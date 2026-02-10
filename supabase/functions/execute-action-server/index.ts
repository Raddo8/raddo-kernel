import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Constants ──

const TERMINAL_STATUSES = ["completed", "failed", "canceled"];
const EXECUTABLE_STATUSES = ["scheduled", "approved"];
const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

const VALID_DIRECTIONS = new Set(["inbound", "outbound", "system"]);
const VALID_CHANNELS = new Set(["email", "sms", "phone", "system", "portal"]);

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

async function authenticate(req: Request): Promise<AuthResult | Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("CRON_SECRET");

  // Check X-CRON-SECRET header first
  const reqCronSecret = req.headers.get("X-CRON-SECRET");
  if (reqCronSecret && cronSecret && reqCronSecret === cronSecret) {
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

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims) {
    return jsonError("Invalid token", 401);
  }

  return { mode: "ui", supabase: client, userId: data.claims.sub as string, source: "ui" };
}

// ── Main handler ──

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth ──
    const authResult = await authenticate(req);
    if (authResult instanceof Response) return authResult;

    const { mode, supabase, userId, source } = authResult;

    // ── Parse body ──
    const { actionId, manualRetry } = await req.json();
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
    if (mode === "ui" && userId) {
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
          // Provider was not configured — reset to scheduled so it can retry later
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
          // True deadlock — fail with timeout
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

      // Running but not yet stuck — don't interfere
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
    const claimerId = userId || "scheduler";

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

    if (claimErr || !claimed || claimed.length === 0) {
      return jsonError("Action already claimed by another process", 409);
    }

    // ── Load & render template ──
    let renderedSubject = "";
    let renderedBody = `Action executed: ${action.type}`;
    const renderErrors: string[] = [];

    // Resolve contact for template context (needed for both email and non-email)
    let contact: { id: string; name: string; email: string; phone: string | null } | null = null;

    if (action.template_id) {
      const { data: template } = await supabase
        .from("templates")
        .select("subject, body")
        .eq("id", action.template_id)
        .maybeSingle();

      if (template) {
        // Resolve contact for template variables
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
  // Resolve recipient if not already resolved during template rendering
  let contact = existingContact;
  if (!contact) {
    const resolved = await resolveRecipient(supabase, action, item);
    contact = resolved.contact;
    if (!contact) {
      await failAction(supabase, actionId, resolved.error || "No recipient", renderErrors);
      return jsonError(resolved.error || "No recipient contact found", 422);
    }
  }

  // Check RESEND_API_KEY — if missing, revert to prior status (do NOT fail)
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

  // Load connector config for from address
  let fromEmail = "noreply@example.com";
  let fromName = "Casey";
  const { data: connector } = await supabase
    .from("connectors")
    .select("config")
    .eq("type", "resend" as any)
    .eq("workspace_id", action.workspace_id as any)
    .maybeSingle();

  if (connector?.config) {
    const cfg = connector.config as Record<string, string>;
    if (cfg.from_email) fromEmail = cfg.from_email;
    if (cfg.from_name) fromName = cfg.from_name;
  }

  // Send via Resend API
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

  // Success
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

  // Timeline event
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

    // Timeline event
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

// ── Timeline write helper ──

async function writeTimeline(
  supabase: ReturnType<typeof createClient>,
  params: {
    accountId: string;
    itemId?: string;
    contactId?: string;
    direction: string;
    channel: string;
    summary: string;
    body?: string | null;
  }
) {
  if (!VALID_DIRECTIONS.has(params.direction) || !VALID_CHANNELS.has(params.channel)) {
    console.error(`[execute-action-server] Invalid timeline params: direction=${params.direction}, channel=${params.channel}`);
    return;
  }

  await supabase.from("timeline_events").insert({
    account_id: params.accountId,
    item_id: params.itemId || null,
    contact_id: params.contactId || null,
    direction: params.direction as any,
    channel: params.channel,
    summary: params.summary,
    body: params.body || null,
    occurred_at: new Date().toISOString(),
  });
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
