import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

function renderString(
  template: string,
  ctx: TemplateContext,
  errors: string[]
): string {
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
// Priority: action.contact_id → account.primary_contact_id → most recent contact for account → error

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

  // 3. Most recent contact for this account (by created_at DESC)
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

// ── Main handler ──

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonError("Unauthorized", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonError("Invalid token", 401);
    }
    const userId = user.id;

    // ── Parse body ──
    const { actionId, manualRetry } = await req.json();
    if (!actionId) return jsonError("actionId is required", 400);

    // ── Load action with joins ──
    const { data: action, error: loadErr } = await supabase
      .from("actions")
      .select(
        "*, items(id, title, amount, due_date, account_id, workspace_id, accounts(id, name))"
      )
      .eq("id", actionId)
      .maybeSingle();

    if (loadErr || !action) {
      return jsonError(loadErr?.message || "Action not found", 404);
    }

    const item = action.items as Record<string, unknown>;
    const account = (item as any)?.accounts as Record<string, unknown> | undefined;

    // ── Workspace membership (enforced by RLS on the SELECT above) ──
    // If the action loaded successfully, the user is a workspace member.
    // Double-check explicitly for safety:
    const { data: isMember } = await supabase.rpc("is_workspace_member", {
      _user_id: userId,
      _workspace_id: action.workspace_id,
    });
    if (!isMember) return jsonError("Not a workspace member", 403);

    // ── Provider idempotency guard ──
    const existingResult = action.result_json as Record<string, unknown> | null;
    if (existingResult?.provider_message_id && manualRetry !== true) {
      return jsonError(
        "Already sent (provider_message_id exists). Set manualRetry=true to resend.",
        409
      );
    }

    // ── Status guard ──
    const TERMINAL = ["completed", "failed", "canceled"];
    const EXECUTABLE = ["scheduled", "approved"];

    if (TERMINAL.includes(action.status)) {
      return jsonError(`Action is in terminal status: ${action.status}`, 409);
    }
    if (!EXECUTABLE.includes(action.status)) {
      return jsonError(`Action status "${action.status}" is not executable`, 409);
    }

    // ── Atomic claim (concurrency guard) ──
    // Only proceed if we successfully claim. This IS the idempotency gate for
    // concurrent duplicate sends — second caller gets 0 rows and aborts.
    // Save original status before claiming so we can revert if needed.
    const priorStatus = action.status;
    const { data: claimed, error: claimErr } = await supabase
      .from("actions")
      .update({
        status: "running" as any,
        claimed_by: userId,
        claimed_at: new Date().toISOString(),
        actor_user_id: userId,
        source: "ui",
      } as any)
      .eq("id", actionId)
      .in("status", EXECUTABLE as any)
      .select("id");

    if (claimErr || !claimed || claimed.length === 0) {
      return jsonError("Action already claimed by another process", 409);
    }

    // ── Resolve recipient contact ──
    const { contact, error: recipientErr } = await resolveRecipient(
      supabase,
      action,
      item
    );
    if (!contact) {
      await failAction(supabase, actionId, recipientErr || "No recipient", []);
      return jsonError(recipientErr || "No recipient contact found", 422);
    }

    // ── Load & render template ──
    let renderedSubject = "";
    let renderedBody = `Action executed: ${action.type}`;
    const renderErrors: string[] = [];

    if (action.template_id) {
      const { data: template } = await supabase
        .from("templates")
        .select("subject, body")
        .eq("id", action.template_id)
        .maybeSingle();

      if (template) {
        const ctx: TemplateContext = {
          item: item
            ? { id: item.id, title: item.title, amount: item.amount, due_date: item.due_date }
            : undefined,
          account: account ? { name: account.name } : undefined,
          contact: { name: contact.name, email: contact.email, phone: contact.phone },
        };
        renderedSubject = renderString(template.subject || "", ctx, renderErrors);
        renderedBody = renderString(template.body, ctx, renderErrors);
      }
    }

    // ── Check RESEND_API_KEY ──
    // If not configured, revert claim (restore prior executable status) — do NOT fail the action.
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      // Revert to prior status so action remains executable when key is added later.
      // We stored the prior status before claiming — it was one of EXECUTABLE.
      await supabase
        .from("actions")
        .update({
          status: action.status as any, // restore original executable status
          claimed_by: null,
          claimed_at: null,
          result_json: {
            provider_not_configured: true,
            error: "RESEND_API_KEY not configured",
            render_errors: renderErrors,
          },
        } as any)
        .eq("id", actionId);

      return jsonError(
        "RESEND_API_KEY is not configured. Add the secret to activate live email.",
        503
      );
    }

    // ── Load connector config for from address ──
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

    // ── Send via Resend API ──
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

    // ── Success: update action ──
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

    // ── Write outbound timeline event (with allow-list validation) ──
    const accountId = item.account_id as string;
    if (accountId) {
      const VALID_DIRECTIONS = new Set(["inbound", "outbound", "system"]);
      const VALID_CHANNELS = new Set(["email", "sms", "phone", "system", "portal"]);

      const direction = "outbound";
      const channel = "email";

      if (!VALID_DIRECTIONS.has(direction) || !VALID_CHANNELS.has(channel)) {
        console.error(`[execute-action-email] Invalid timeline params: direction=${direction}, channel=${channel}`);
      } else {
        await supabase.from("timeline_events").insert({
          account_id: accountId,
          item_id: action.item_id,
          contact_id: contact.id,
          direction: direction as any,
          channel,
          summary: `Email sent: ${renderedSubject || action.type}`,
          body: renderedBody?.substring(0, 500) || null,
          occurred_at: new Date().toISOString(),
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, provider_message_id: resendResult.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[execute-action-email] Unhandled:", err);
    return jsonError(err instanceof Error ? err.message : "Internal error", 500);
  }
});

// ── Helpers ──

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
