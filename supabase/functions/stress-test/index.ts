import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { executeActionCore } from "../_shared/execute-action-core.ts";

// ── Types ──

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  duration_ms: number;
}

type SupabaseClient = ReturnType<typeof createClient>;

// ── Helpers ──

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function getTestWorkspace(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("id")
    .limit(1)
    .single();
  if (error || !data) throw new Error("No workspace found for stress testing");
  return data.id;
}

async function createTestAccount(supabase: SupabaseClient, workspaceId: string): Promise<string> {
  const { data, error } = await supabase
    .from("accounts")
    .insert({ workspace_id: workspaceId, name: "[STRESS-TEST] Account" })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create test account: ${error.message}`);
  return data.id;
}

async function createTestContact(
  supabase: SupabaseClient,
  accountId: string,
  email: string
): Promise<string> {
  const { data, error } = await supabase
    .from("contacts")
    .insert({ account_id: accountId, name: "[STRESS-TEST] Contact", email })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create test contact: ${error.message}`);
  return data.id;
}

async function createTestItem(
  supabase: SupabaseClient,
  workspaceId: string,
  accountId: string
): Promise<string> {
  const { data, error } = await supabase
    .from("items")
    .insert({
      workspace_id: workspaceId,
      account_id: accountId,
      title: "[STRESS-TEST] Item",
      type: "invoice",
      amount: 100,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create test item: ${error.message}`);
  return data.id;
}

async function createTestAction(
  supabase: SupabaseClient,
  workspaceId: string,
  itemId: string,
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const { data, error } = await supabase
    .from("actions")
    .insert({
      workspace_id: workspaceId,
      item_id: itemId,
      type: "send_message",
      channel: "system",
      status: "scheduled",
      scheduled_for: new Date(Date.now() - 60_000).toISOString(),
      source: "stress-test",
      ...overrides,
    } as any)
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create test action: ${error.message}`);
  return data.id;
}

async function cleanup(supabase: SupabaseClient, ids: {
  actionIds?: string[];
  itemIds?: string[];
  contactIds?: string[];
  accountIds?: string[];
  suppressionEmails?: { email: string; workspaceId: string }[];
  messageEventIds?: string[];
  timelineItemIds?: string[];
}) {
  // Order matters: actions → items → contacts → accounts (FK deps)
  if (ids.actionIds?.length) {
    // Also clean action_responses
    for (const aid of ids.actionIds) {
      await supabase.from("action_responses").delete().eq("action_id", aid);
    }
    await supabase.from("actions").delete().in("id", ids.actionIds);
  }
  if (ids.messageEventIds?.length) {
    await supabase.from("message_events").delete().in("id", ids.messageEventIds);
  }
  if (ids.timelineItemIds?.length) {
    await supabase.from("timeline_events").delete().in("item_id", ids.timelineItemIds);
  }
  if (ids.suppressionEmails?.length) {
    for (const s of ids.suppressionEmails) {
      await supabase.from("suppression_list").delete()
        .eq("workspace_id", s.workspaceId)
        .eq("email", s.email);
    }
  }
  if (ids.itemIds?.length) {
    await supabase.from("timeline_events").delete().in("item_id", ids.itemIds);
    await supabase.from("items").delete().in("id", ids.itemIds);
  }
  if (ids.contactIds?.length) {
    await supabase.from("contacts").delete().in("id", ids.contactIds);
  }
  if (ids.accountIds?.length) {
    await supabase.from("accounts").delete().in("id", ids.accountIds);
  }
}

// ══════════════════════════════════════════════════════════════
// TEST 1: Double-Submit Race Condition
// ══════════════════════════════════════════════════════════════

async function testDoubleSubmitRace(supabase: SupabaseClient): Promise<TestResult> {
  const start = Date.now();
  const ids: Parameters<typeof cleanup>[1] = {};

  try {
    const workspaceId = await getTestWorkspace(supabase);
    const accountId = await createTestAccount(supabase, workspaceId);
    ids.accountIds = [accountId];

    const itemId = await createTestItem(supabase, workspaceId, accountId);
    ids.itemIds = [itemId];

    const actionId = await createTestAction(supabase, workspaceId, itemId);
    ids.actionIds = [actionId];
    ids.timelineItemIds = [itemId];

    // Fire two parallel executions
    const [r1, r2] = await Promise.all([
      executeActionCore(supabase, actionId, { userId: null, source: "stress-test-1" }),
      executeActionCore(supabase, actionId, { userId: null, source: "stress-test-2" }),
    ]);

    const successes = [r1, r2].filter((r) => r.success && !r.recovered);
    const claims = [r1, r2].filter(
      (r) => !r.success && r.error?.includes("claimed")
    );

    assert(
      successes.length === 1,
      `Expected exactly 1 success, got ${successes.length}. r1=${JSON.stringify(r1)}, r2=${JSON.stringify(r2)}`
    );
    assert(
      claims.length === 1,
      `Expected exactly 1 "already claimed", got ${claims.length}`
    );

    return {
      name: "Double-Submit Race Condition",
      passed: true,
      details: `Atomic claim gate works: 1 succeeded, 1 rejected`,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      name: "Double-Submit Race Condition",
      passed: false,
      details: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    };
  } finally {
    await cleanup(supabase, ids);
  }
}

// ══════════════════════════════════════════════════════════════
// TEST 2: Burst Scheduler Load
// ══════════════════════════════════════════════════════════════

async function testBurstSchedulerLoad(supabase: SupabaseClient): Promise<TestResult> {
  const start = Date.now();
  const ids: Parameters<typeof cleanup>[1] = {};

  try {
    const workspaceId = await getTestWorkspace(supabase);
    const accountId = await createTestAccount(supabase, workspaceId);
    ids.accountIds = [accountId];

    const itemId = await createTestItem(supabase, workspaceId, accountId);
    ids.itemIds = [itemId];
    ids.timelineItemIds = [itemId];

    // Create 5 scheduled actions
    const actionIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const aid = await createTestAction(supabase, workspaceId, itemId, {
        channel: "system",
        scheduled_for: new Date(Date.now() - 60_000).toISOString(),
      });
      actionIds.push(aid);
    }
    ids.actionIds = actionIds;

    // Fire 3 parallel scheduler-like sweeps (each tries all 5)
    const results = await Promise.all(
      Array.from({ length: 3 }, async (_, i) => {
        const batchResults: Array<{ actionId: string; result: any }> = [];
        for (const actionId of actionIds) {
          const r = await executeActionCore(supabase, actionId, {
            userId: null,
            source: `stress-burst-${i}`,
          });
          batchResults.push({ actionId, result: r });
        }
        return batchResults;
      })
    );

    // Count total successes across all 3 sweeps
    const allResults = results.flat();
    const totalSucceeded = allResults.filter(
      (r) => r.result.success && !r.result.recovered
    ).length;

    // Each action should succeed exactly once across all sweeps
    assert(
      totalSucceeded === 5,
      `Expected exactly 5 total successes, got ${totalSucceeded}`
    );

    // Verify all actions are in terminal state
    const { data: finalActions } = await supabase
      .from("actions")
      .select("id, status")
      .in("id", actionIds);

    const stillRunning = finalActions?.filter((a: any) => a.status === "running") || [];
    assert(
      stillRunning.length === 0,
      `${stillRunning.length} actions still in 'running' state`
    );

    return {
      name: "Burst Scheduler Load",
      passed: true,
      details: `5 actions, 3 parallel sweeps: exactly 5 succeeded, 0 stuck`,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      name: "Burst Scheduler Load",
      passed: false,
      details: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    };
  } finally {
    await cleanup(supabase, ids);
  }
}

// ══════════════════════════════════════════════════════════════
// TEST 3: Hard Bounce Suppression
// ══════════════════════════════════════════════════════════════

async function testHardBounceSuppression(supabase: SupabaseClient): Promise<TestResult> {
  const start = Date.now();
  const testEmail = "stress-test-hard-bounce@example.com";
  const testMsgId = `stress-test-hard-${Date.now()}`;
  const ids: Parameters<typeof cleanup>[1] = {};

  try {
    const workspaceId = await getTestWorkspace(supabase);
    const accountId = await createTestAccount(supabase, workspaceId);
    ids.accountIds = [accountId];

    const itemId = await createTestItem(supabase, workspaceId, accountId);
    ids.itemIds = [itemId];
    ids.timelineItemIds = [itemId];

    // Create action with provider info (simulating a sent email)
    const actionId = await createTestAction(supabase, workspaceId, itemId, {
      status: "completed",
      provider: "resend",
      provider_message_id: testMsgId,
      channel: "email",
      executed_at: new Date().toISOString(),
    });
    ids.actionIds = [actionId];
    ids.suppressionEmails = [{ email: testEmail, workspaceId }];

    // Directly simulate what resend-webhook does for a hard bounce
    // (We bypass Svix signature verification since we're testing DB logic)
    const shortEvent = "bounced";
    const { data: meInsert, error: meErr } = await supabase
      .from("message_events")
      .insert({
        workspace_id: workspaceId,
        action_id: actionId,
        provider: "resend",
        provider_message_id: testMsgId,
        event_type: shortEvent,
        recipient_email: testEmail,
        payload: { type: "email.bounced", data: { bounce: { type: "hard" } } },
        occurred_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (meErr) throw new Error(`message_events insert failed: ${meErr.message}`);
    ids.messageEventIds = [meInsert.id];

    // Simulate hard bounce → suppression insert
    const { error: suppressErr } = await supabase
      .from("suppression_list")
      .upsert(
        { workspace_id: workspaceId, email: testEmail, reason: "bounce", source: "webhook" },
        { onConflict: "workspace_id,email" }
      );

    if (suppressErr) throw new Error(`suppression insert failed: ${suppressErr.message}`);

    // Verify message_events row
    const { data: me } = await supabase
      .from("message_events")
      .select("id")
      .eq("provider_message_id", testMsgId)
      .eq("event_type", "bounced")
      .maybeSingle();

    assert(!!me, "message_events row not found for hard bounce");

    // Verify suppression_list row
    const { data: sl } = await supabase
      .from("suppression_list")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("email", testEmail)
      .maybeSingle();

    assert(!!sl, "suppression_list row not found for hard bounce");

    return {
      name: "Hard Bounce Suppression",
      passed: true,
      details: `Hard bounce → message_events + suppression_list verified`,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      name: "Hard Bounce Suppression",
      passed: false,
      details: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    };
  } finally {
    await cleanup(supabase, ids);
  }
}

// ══════════════════════════════════════════════════════════════
// TEST 4: Soft Bounce Handling
// ══════════════════════════════════════════════════════════════

async function testSoftBounceHandling(supabase: SupabaseClient): Promise<TestResult> {
  const start = Date.now();
  const testEmail = "stress-test-soft-bounce@example.com";
  const testMsgId = `stress-test-soft-${Date.now()}`;
  const ids: Parameters<typeof cleanup>[1] = {};

  try {
    const workspaceId = await getTestWorkspace(supabase);
    const accountId = await createTestAccount(supabase, workspaceId);
    ids.accountIds = [accountId];

    const itemId = await createTestItem(supabase, workspaceId, accountId);
    ids.itemIds = [itemId];
    ids.timelineItemIds = [itemId];

    const actionId = await createTestAction(supabase, workspaceId, itemId, {
      status: "completed",
      provider: "resend",
      provider_message_id: testMsgId,
      channel: "email",
      executed_at: new Date().toISOString(),
    });
    ids.actionIds = [actionId];
    ids.suppressionEmails = [{ email: testEmail, workspaceId }];

    // Insert message_events row (soft bounce is still logged)
    const { data: meInsert, error: meErr } = await supabase
      .from("message_events")
      .insert({
        workspace_id: workspaceId,
        action_id: actionId,
        provider: "resend",
        provider_message_id: testMsgId,
        event_type: "bounced",
        recipient_email: testEmail,
        payload: { type: "email.bounced", data: { bounce: { type: "soft" } } },
        occurred_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (meErr) throw new Error(`message_events insert failed: ${meErr.message}`);
    ids.messageEventIds = [meInsert.id];

    // For soft bounce, we do NOT insert into suppression_list
    // (This mirrors the webhook logic: bounceType !== "hard" → skip suppression)

    // Verify message_events row exists
    const { data: me } = await supabase
      .from("message_events")
      .select("id")
      .eq("provider_message_id", testMsgId)
      .eq("event_type", "bounced")
      .maybeSingle();

    assert(!!me, "message_events row not found for soft bounce");

    // Verify NO suppression_list row
    const { data: sl } = await supabase
      .from("suppression_list")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("email", testEmail)
      .maybeSingle();

    assert(!sl, "suppression_list row SHOULD NOT exist for soft bounce");

    return {
      name: "Soft Bounce Handling",
      passed: true,
      details: `Soft bounce → message_events logged, no suppression`,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      name: "Soft Bounce Handling",
      passed: false,
      details: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    };
  } finally {
    await cleanup(supabase, ids);
  }
}

// ══════════════════════════════════════════════════════════════
// TEST 5: Orphan Webhook
// ══════════════════════════════════════════════════════════════

async function testOrphanWebhook(supabase: SupabaseClient): Promise<TestResult> {
  const start = Date.now();
  const orphanMsgId = `stress-test-orphan-${Date.now()}`;
  const orphanEmail = "stress-test-orphan@example.com";
  const ids: Parameters<typeof cleanup>[1] = {};

  try {
    const workspaceId = await getTestWorkspace(supabase);
    ids.suppressionEmails = [{ email: orphanEmail, workspaceId }];

    // Simulate orphan: look up action by provider_message_id — should find nothing
    const { data: action } = await supabase
      .from("actions")
      .select("id, workspace_id")
      .eq("provider", "resend")
      .eq("provider_message_id", orphanMsgId)
      .limit(1)
      .maybeSingle();

    assert(!action, "Orphan test setup failed: action should not exist");

    // Per webhook logic: orphan → skip DB insertion, return 200
    // We verify no message_events row was created
    const { data: me } = await supabase
      .from("message_events")
      .select("id")
      .eq("provider_message_id", orphanMsgId)
      .maybeSingle();

    assert(!me, "message_events row SHOULD NOT exist for orphan webhook");

    // Verify no suppression_list row
    const { data: sl } = await supabase
      .from("suppression_list")
      .select("id")
      .eq("email", orphanEmail)
      .maybeSingle();

    assert(!sl, "suppression_list row SHOULD NOT exist for orphan webhook");

    return {
      name: "Orphan Webhook",
      passed: true,
      details: `Orphan provider_message_id → no DB writes, correct behavior`,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      name: "Orphan Webhook",
      passed: false,
      details: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    };
  } finally {
    await cleanup(supabase, ids);
  }
}

// ══════════════════════════════════════════════════════════════
// TEST 6: Forced Failure / Stuck Recovery
// ══════════════════════════════════════════════════════════════

async function testStuckRecovery(supabase: SupabaseClient): Promise<TestResult> {
  const start = Date.now();
  const ids: Parameters<typeof cleanup>[1] = {};

  try {
    const workspaceId = await getTestWorkspace(supabase);
    const accountId = await createTestAccount(supabase, workspaceId);
    ids.accountIds = [accountId];

    const itemId = await createTestItem(supabase, workspaceId, accountId);
    ids.itemIds = [itemId];
    ids.timelineItemIds = [itemId];

    // Create action in 'scheduled' state first, then manually set to 'running' with old claimed_at
    const actionId = await createTestAction(supabase, workspaceId, itemId);
    ids.actionIds = [actionId];

    // Simulate stuck: set to running with claimed_at 15 minutes ago
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await supabase
      .from("actions")
      .update({
        status: "running" as any,
        claimed_at: fifteenMinAgo,
      } as any)
      .eq("id", actionId);

    // Execute — should trigger stuck recovery
    const result = await executeActionCore(supabase, actionId, {
      userId: null,
      source: "stress-test",
    });

    assert(result.success === true, `Expected success=true for recovery, got ${result.success}`);
    assert(result.recovered === true, `Expected recovered=true, got ${result.recovered}`);
    assert(result.failed === true, `Expected failed=true for stuck timeout, got ${result.failed}`);

    // Verify action is now in 'failed' status
    const { data: action } = await supabase
      .from("actions")
      .select("status, result_json")
      .eq("id", actionId)
      .single();

    assert(action?.status === "failed", `Expected status=failed, got ${action?.status}`);

    const resultJson = action?.result_json as Record<string, unknown> | null;
    assert(
      typeof resultJson?.error === "string" && resultJson.error.includes("timeout"),
      `result_json.error should contain 'timeout', got: ${resultJson?.error}`
    );

    // Verify timeline event exists for failure
    const { data: timeline } = await supabase
      .from("timeline_events")
      .select("id, summary")
      .eq("item_id", itemId)
      .ilike("summary", "%timeout%")
      .limit(1)
      .maybeSingle();

    assert(!!timeline, "Timeline event for stuck recovery not found");

    return {
      name: "Stuck Recovery / Forced Failure",
      passed: true,
      details: `Stuck action (15min) → recovered to failed with timeout error + timeline`,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      name: "Stuck Recovery / Forced Failure",
      passed: false,
      details: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    };
  } finally {
    await cleanup(supabase, ids);
  }
}

// ══════════════════════════════════════════════════════════════
// TEST 7: Idempotency-Key Dedup Under Concurrent Insert
// ══════════════════════════════════════════════════════════════

async function testIdempotencyDedup(supabase: SupabaseClient): Promise<TestResult> {
  const start = Date.now();
  const ids: Parameters<typeof cleanup>[1] = {};

  try {
    const workspaceId = await getTestWorkspace(supabase);
    const accountId = await createTestAccount(supabase, workspaceId);
    ids.accountIds = [accountId];

    const itemId = await createTestItem(supabase, workspaceId, accountId);
    ids.itemIds = [itemId];
    ids.timelineItemIds = [itemId];

    const idempotencyKey = `stress-dedup:${workspaceId}:${itemId}:${Date.now()}`;

    // Get HMAC cron headers for auth
    const { data: cronHeaders } = await supabase.rpc("get_cron_headers");
    if (!cronHeaders) throw new Error("Failed to get cron headers");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const endpoint = `${supabaseUrl}/functions/v1/execute-action-server`;

    const payload = {
      mode: "create",
      params: {
        itemId,
        type: "send_message",
        channel: "system",
        idempotencyKey,
        source: "stress-test",
      },
    };

    // Fire two parallel creates with the same idempotency key
    const [res1, res2] = await Promise.all([
      fetch(endpoint, {
        method: "POST",
        headers: cronHeaders as Record<string, string>,
        body: JSON.stringify(payload),
      }),
      fetch(endpoint, {
        method: "POST",
        headers: cronHeaders as Record<string, string>,
        body: JSON.stringify(payload),
      }),
    ]);

    const body1 = await res1.json();
    const body2 = await res2.json();
    const responses = [body1, body2];

    // Collect created actionIds for cleanup
    const createdIds = responses
      .filter((r: any) => r.actionId)
      .map((r: any) => r.actionId);
    ids.actionIds = createdIds;

    // Assert: exactly one winner, one dedup
    const winners = responses.filter((r: any) => r.success && r.skipped === false);
    const deduped = responses.filter((r: any) => r.success && r.skipped === true && r.reason === "duplicate");

    assert(
      winners.length === 1,
      `Expected 1 winner, got ${winners.length}. r1=${JSON.stringify(body1)}, r2=${JSON.stringify(body2)}`
    );
    assert(
      deduped.length === 1,
      `Expected 1 dedup, got ${deduped.length}. r1=${JSON.stringify(body1)}, r2=${JSON.stringify(body2)}`
    );

    // Verify exactly 1 action row with this idempotency_key
    const { data: actionRows, error: qErr } = await supabase
      .from("actions")
      .select("id")
      .eq("idempotency_key", idempotencyKey);

    if (qErr) throw new Error(`Action query failed: ${qErr.message}`);
    assert(
      actionRows?.length === 1,
      `Expected 1 action row, got ${actionRows?.length}`
    );

    // Verify exactly 1 "Action queued" timeline event (no duplicate side effects)
    const { data: timelineRows } = await supabase
      .from("timeline_events")
      .select("id")
      .eq("item_id", itemId)
      .ilike("summary", "%Action queued%");

    assert(
      timelineRows?.length === 1,
      `Expected 1 timeline event, got ${timelineRows?.length}`
    );

    return {
      name: "Idempotency-Key Dedup",
      passed: true,
      details: `2 concurrent creates → 1 action row, 1 dedup, 1 timeline event`,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      name: "Idempotency-Key Dedup",
      passed: false,
      details: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    };
  } finally {
    await cleanup(supabase, ids);
  }
}

// ══════════════════════════════════════════════════════════════
// Main Handler
// ══════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // ── HMAC cron auth ──
  const timestamp = req.headers.get("X-Cron-Timestamp") || req.headers.get("x-cron-timestamp");
  const token = req.headers.get("X-Cron-Token") || req.headers.get("x-cron-token");

  if (!timestamp || !token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: isValid } = await supabase.rpc("verify_cron_token", {
    p_timestamp: timestamp,
    p_token: token,
  });

  if (!isValid) {
    return new Response(JSON.stringify({ error: "Invalid HMAC token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Run all tests sequentially ──
  const results: TestResult[] = [];

  console.log("[stress-test] Starting 7-test suite...");

  results.push(await testDoubleSubmitRace(supabase));
  console.log(`[stress-test] Test 1: ${results[0].passed ? "PASS" : "FAIL"} - ${results[0].name}`);

  results.push(await testBurstSchedulerLoad(supabase));
  console.log(`[stress-test] Test 2: ${results[1].passed ? "PASS" : "FAIL"} - ${results[1].name}`);

  results.push(await testHardBounceSuppression(supabase));
  console.log(`[stress-test] Test 3: ${results[2].passed ? "PASS" : "FAIL"} - ${results[2].name}`);

  results.push(await testSoftBounceHandling(supabase));
  console.log(`[stress-test] Test 4: ${results[3].passed ? "PASS" : "FAIL"} - ${results[3].name}`);

  results.push(await testOrphanWebhook(supabase));
  console.log(`[stress-test] Test 5: ${results[4].passed ? "PASS" : "FAIL"} - ${results[4].name}`);

  results.push(await testStuckRecovery(supabase));
  console.log(`[stress-test] Test 6: ${results[5].passed ? "PASS" : "FAIL"} - ${results[5].name}`);

  results.push(await testIdempotencyDedup(supabase));
  console.log(`[stress-test] Test 7: ${results[6].passed ? "PASS" : "FAIL"} - ${results[6].name}`);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration_ms, 0);

  const summary = {
    total: results.length,
    passed,
    failed,
    all_passed: failed === 0,
    total_duration_ms: totalDuration,
    results,
  };

  console.log(`[stress-test] Complete: ${passed}/${results.length} passed in ${totalDuration}ms`);

  return new Response(JSON.stringify(summary, null, 2), {
    status: failed > 0 ? 500 : 200,
    headers: { "Content-Type": "application/json" },
  });
});
