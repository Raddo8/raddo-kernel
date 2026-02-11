import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { writeTimeline } from "../_shared/write-timeline.ts";
import { executeActionCore } from "../_shared/execute-action-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Constants ──

const PG_UNIQUE_VIOLATION = "23505";
const DEFAULT_RATE_LIMIT = 10; // per hour per item+channel

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

    // ── Execute mode (delegates to shared core) ──
    const actionId = body.actionId;
    const manualRetry = body.manualRetry;
    if (!actionId) return jsonError("actionId is required", 400);

    // UI mode: workspace membership check is done inside core after loading action
    // But we do it here for the UI path to fail fast
    if (authResult.mode === "ui" && userId) {
      const { data: action } = await supabase
        .from("actions")
        .select("workspace_id")
        .eq("id", actionId)
        .maybeSingle();

      if (action) {
        const { data: isMember } = await supabase.rpc("is_workspace_member", {
          _user_id: userId,
          _workspace_id: action.workspace_id,
        });
        if (!isMember) return jsonError("Not a workspace member", 403);
      }
    }

    const result = await executeActionCore(supabase, actionId, {
      userId,
      source,
      manualRetry,
    });

    if (result.recovered) {
      return jsonOk({ success: true, recovered: true, failed: result.failed });
    }
    if (!result.success) {
      const status = result.error?.includes("not found") ? 404
        : result.error?.includes("claimed") ? 409 : 500;
      return jsonError(result.error || "Execution failed", status);
    }
    return jsonOk({
      success: true,
      provider_message_id: result.provider_message_id,
    });
  } catch (err) {
    console.error("[execute-action-server] Unhandled:", err);
    return jsonError(err instanceof Error ? err.message : "Internal error", 500);
  }
});

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
