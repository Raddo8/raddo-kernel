import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { writeTimeline } from "../_shared/write-timeline.ts";
import { executeActionCore } from "../_shared/execute-action-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-timestamp, x-cron-token, x-loadtest-timestamp, x-loadtest-token, x-loadtest-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Constants ──

const PG_UNIQUE_VIOLATION = "23505";
const DEFAULT_RATE_LIMIT = 10; // per hour per item+channel

// ── Auth helpers ──

interface AuthResult {
  mode: "scheduler" | "ui" | "load-test";
  supabase: ReturnType<typeof createClient>;
  userId: string | null;
  source: string;
}

async function authenticate(req: Request, requestMode: string): Promise<AuthResult | Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Path 1: HMAC cron token ──
  const cronTimestamp = req.headers.get("X-Cron-Timestamp") || req.headers.get("x-cron-timestamp");
  const cronToken = req.headers.get("X-Cron-Token") || req.headers.get("x-cron-token");
  if (cronTimestamp && cronToken) {
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: isValid } = await serviceClient.rpc("verify_cron_token", {
      p_timestamp: cronTimestamp,
      p_token: cronToken,
    });
    if (!isValid) {
      return jsonError("Unauthorized", 401);
    }
    if (requestMode === "execute") {
      return jsonError("Cron auth not allowed for execute mode", 403);
    }
    return { mode: "scheduler", supabase: serviceClient, userId: null, source: "scheduler" };
  }

  // ── Path 2: Load-test HMAC token ──
  const ltTimestamp = req.headers.get("X-LoadTest-Timestamp") || req.headers.get("x-loadtest-timestamp");
  const ltToken = req.headers.get("X-LoadTest-Token") || req.headers.get("x-loadtest-token");
  if (ltTimestamp && ltToken) {
    // Environment gate (hardcoded — set to false to disable load-test path)
    const LOAD_TEST_ENABLED = true;
    if (!LOAD_TEST_ENABLED) {
      return jsonError("Load test auth is not enabled", 403);
    }
    // Mode restriction
    if (requestMode !== "create") {
      return jsonError("Load test auth only allowed for create mode", 403);
    }
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: isValid } = await serviceClient.rpc("verify_load_test_token", {
      p_timestamp: ltTimestamp,
      p_token: ltToken,
    });
    if (!isValid) {
      return jsonError("Invalid load test token", 401);
    }
    return { mode: "load-test", supabase: serviceClient, userId: null, source: "load-test" };
  }

  // ── Path 3: User JWT ──
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
  const requestWorkspaceId = params.workspaceId as string | undefined;

  let itemQuery = supabase
    .from("items")
    .select("account_id, workspace_id")
    .eq("id", itemId as string);

  // LT mode: scope query by workspace so 404 = definitive "wrong ID or wrong workspace"
  if (authResult.mode === "load-test") {
    // requestWorkspaceId is guaranteed non-null here (LT-GUARD fires earlier in create path)
    itemQuery = itemQuery.eq("workspace_id", requestWorkspaceId!);
  }

  const { data: item, error: itemErr } = await itemQuery.maybeSingle();

  // Branch 1: DB-level error (timeout, connection drop)
  if (itemErr) {
    if (authResult.mode === "load-test") {
      console.error(
        `[execute-action-server] LT-DB-ERROR: itemId=${itemId} workspaceId=${requestWorkspaceId} ` +
        `idempotencyKey=${params.idempotencyKey || "none"} reason=db_error err=${itemErr.message}`
      );
    }
    return jsonError("Item lookup failed", 500);
  }

  // Branch 2: 0 rows returned
  if (!item) {
    if (authResult.mode === "load-test") {
      console.error(
        `[execute-action-server] LT-404: itemId=${itemId} workspaceId=${requestWorkspaceId} ` +
        `idempotencyKey=${params.idempotencyKey || "none"} reason=item_not_found`
      );
    }
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

  // Usage soft limit check
  const billingServiceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const currentPeriod = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  const { data: billing } = await billingServiceClient
    .from("workspace_billing")
    .select("plan, monthly_action_limit")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (billing) {
    const periodStart = currentPeriod + "-01T00:00:00Z";
    const { count: periodUsage } = await billingServiceClient
      .from("actions")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", periodStart)
      .neq("status", "canceled");

    if ((periodUsage ?? 0) >= billing.monthly_action_limit && billing.plan === "free") {
      return jsonOk({
        success: false,
        reason: "usage_limit_reached",
        limit: billing.monthly_action_limit,
        used: periodUsage,
      });
    }
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

      // Load-test auth: enforce additional guards
      if (authResult.mode === "load-test") {
        // Guard: explicit workspaceId required
        if (!params.workspaceId) {
          console.error(
            `[execute-action-server] LT-GUARD: idempotencyKey=${params.idempotencyKey || "none"} reason=missing_workspaceId`
          );
          return jsonError("workspaceId is required for load-test auth", 400);
        }
        // Guard: idempotency prefix
        if (!params.idempotencyKey || !String(params.idempotencyKey).startsWith("lt-")) {
          return jsonError("idempotencyKey must start with 'lt-' for load-test auth", 400);
        }
        // Guard: edge rate limiter (500 req / 10s per workspace)
        const { data: edgeRate } = await supabase.rpc("check_rate_limit", {
          p_key: `lt-edge:${params.workspaceId}`,
          p_max_requests: 500,
          p_window_ms: 10000,
        });
        if (edgeRate && !edgeRate.allowed) {
          return new Response(
            JSON.stringify({ success: false, error: "Load test rate limit exceeded" }),
            {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(edgeRate.retry_after || 5) },
            }
          );
        }
      }

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

    // Use service-role client for execution core (needs to insert into
    // action_responses which has no user-facing INSERT RLS policy).
    // Auth + membership already verified above.
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const result = await executeActionCore(serviceClient, actionId, {
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
