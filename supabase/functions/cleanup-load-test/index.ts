import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-timestamp, x-cron-token",
};

const DEFAULT_PREFIXES = ["burst-", "direct-test", "lt-", "st-"];
const FIXTURE_PATTERNS = ["%[LOAD-TEST]%", "%[STRESS-TEST]%"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── Auth: HMAC cron token only ──
    const timestamp =
      req.headers.get("X-Cron-Timestamp") || req.headers.get("x-cron-timestamp");
    const token =
      req.headers.get("X-Cron-Token") || req.headers.get("x-cron-token");

    if (!timestamp || !token) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const { data: isValid } = await supabase.rpc("verify_cron_token", {
      p_timestamp: timestamp,
      p_token: token,
    });

    if (!isValid) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    // ── Parse and validate body ──
    const body = await req.json().catch(() => ({}));

    if (body.confirm !== true) {
      return json(
        { success: false, error: "Explicit confirm:true required" },
        400
      );
    }

    const workspaceId = body.workspaceId as string | undefined;
    if (!workspaceId || typeof workspaceId !== "string") {
      return json(
        { success: false, error: "workspaceId (UUID) is required" },
        400
      );
    }

    // Validate UUID format
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(workspaceId)) {
      return json(
        { success: false, error: "workspaceId must be a valid UUID" },
        400
      );
    }

    const prefixes: string[] = Array.isArray(body.prefixes)
      ? body.prefixes
      : DEFAULT_PREFIXES;
    const includeFixtures: boolean = body.includeFixtures === true;

    // Build prefix OR conditions for idempotency_key
    const prefixConditions = prefixes
      .map((p: string) => `idempotency_key LIKE '${p.replace(/'/g, "''")}%'`)
      .join(" OR ");

    const deleted: Record<string, number> = {};

    // Get action IDs matching prefixes in this workspace
    const { data: matchingActions } = await supabase
      .from("actions")
      .select("id")
      .eq("workspace_id", workspaceId)
      .or(prefixes.map((p) => `idempotency_key.like.${p}%`).join(","));

    const actionIds = (matchingActions || []).map((a: { id: string }) => a.id);

    // 1. usage_events (FK: action_id -> actions)
    if (actionIds.length > 0) {
      const { data: ueDeleted } = await supabase
        .from("usage_events")
        .delete()
        .in("action_id", actionIds)
        .select("id");
      deleted.usage_events = ueDeleted?.length ?? 0;
    } else {
      deleted.usage_events = 0;
    }

    // 2. timeline_events (no direct FK to actions; scope by item_id in workspace)
    // Find items in this workspace with test names
    const { data: testItems } = await supabase
      .from("items")
      .select("id, account_id")
      .eq("workspace_id", workspaceId);

    const testItemIds = (testItems || []).map((i: { id: string }) => i.id);
    const testAccountIds = [
      ...new Set(
        (testItems || []).map((i: { account_id: string }) => i.account_id)
      ),
    ];

    if (testAccountIds.length > 0) {
      // Delete timeline_events matching test summaries in these accounts
      const { data: teDeleted } = await supabase
        .from("timeline_events")
        .delete()
        .in("account_id", testAccountIds as string[])
        .or(
          FIXTURE_PATTERNS.map((p) => `summary.ilike.${p}`).join(",") +
            "," +
            prefixes.map((p) => `summary.ilike.%${p}%`).join(",")
        )
        .select("id");
      deleted.timeline_events = teDeleted?.length ?? 0;
    } else {
      deleted.timeline_events = 0;
    }

    // 3. actions
    if (actionIds.length > 0) {
      const { data: actDeleted } = await supabase
        .from("actions")
        .delete()
        .in("id", actionIds)
        .select("id");
      deleted.actions = actDeleted?.length ?? 0;
    } else {
      deleted.actions = 0;
    }

    // 4-8. Fixtures (only if includeFixtures is true)
    deleted.items = 0;
    deleted.contacts = 0;
    deleted.accounts = 0;
    deleted.workspace_members = 0;
    deleted.workspaces = 0;

    if (includeFixtures) {
      // Items with test names
      if (testItemIds.length > 0) {
        const { data: itemsDel } = await supabase
          .from("items")
          .delete()
          .eq("workspace_id", workspaceId)
          .or(FIXTURE_PATTERNS.map((p) => `title.ilike.${p}`).join(","))
          .select("id");
        deleted.items = itemsDel?.length ?? 0;
      }

      // Contacts in test accounts
      if (testAccountIds.length > 0) {
        const { data: contactsDel } = await supabase
          .from("contacts")
          .delete()
          .in("account_id", testAccountIds as string[])
          .select("id");
        deleted.contacts = contactsDel?.length ?? 0;
      }

      // Accounts with test names
      const { data: acctsDel } = await supabase
        .from("accounts")
        .delete()
        .eq("workspace_id", workspaceId)
        .or(FIXTURE_PATTERNS.map((p) => `name.ilike.${p}`).join(","))
        .select("id");
      deleted.accounts = acctsDel?.length ?? 0;

      // Workspace members for this workspace
      const { data: wmDel } = await supabase
        .from("workspace_members")
        .delete()
        .eq("workspace_id", workspaceId)
        .select("id");
      deleted.workspace_members = wmDel?.length ?? 0;

      // Workspace itself (only if name matches test pattern)
      const { data: wsDel } = await supabase
        .from("workspaces")
        .delete()
        .eq("id", workspaceId)
        .or(FIXTURE_PATTERNS.map((p) => `name.ilike.${p}`).join(","))
        .select("id");
      deleted.workspaces = wsDel?.length ?? 0;
    }

    const totalDeleted = Object.values(deleted).reduce((a, b) => a + b, 0);
    console.log(
      `[cleanup-load-test] Workspace ${workspaceId}: deleted ${totalDeleted} rows`,
      JSON.stringify(deleted)
    );

    return json({ success: true, deleted, workspaceId });
  } catch (err) {
    console.error("[cleanup-load-test] Unhandled:", err);
    return json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal error",
      },
      500
    );
  }
});
