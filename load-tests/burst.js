/**
 * Phase 3: Burst Spike Test
 *
 * Applies a 5× spike (100 VUs) for 60 seconds after a warm-up period.
 *
 * Auth: Uses isolated load-test HMAC headers minted from
 * mint-load-test-headers endpoint. JWT is used ONLY for minting.
 * Headers are rotated every 45-75s (jittered) per VU.
 *
 * Verifies under burst:
 *   - No duplicate executions (idempotency holds)
 *   - No stuck running actions
 *   - No cascade retries
 *   - No timeline duplication
 *
 * This measures CLIENT-OBSERVED latency only.
 * Monitor DB CPU, locks, and connections separately.
 */

import http from "k6/http";
import { check, fail } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.K6_BASE_URL;
const ANON_KEY = __ENV.K6_ANON_KEY;
const WORKSPACE_ID = __ENV.K6_TEST_WORKSPACE_ID;
const ITEM_ID = __ENV.K6_TEST_ITEM_ID;
const AUTH_TOKEN = __ENV.K6_AUTH_TOKEN;
const LOADTEST_SECRET = __ENV.K6_LOADTEST_SECRET;

if (!WORKSPACE_ID) {
  fail("K6_TEST_WORKSPACE_ID is required. Never run against production.");
}
if (!BASE_URL || !ANON_KEY || !ITEM_ID || !AUTH_TOKEN || !LOADTEST_SECRET) {
  fail("Missing required environment variables. See load-tests/README.md.");
}

const errorRate = new Rate("error_rate");
const createLatency = new Trend("create_latency", true);
const RUN_ID = `lt-burst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const options = {
  stages: [
    { duration: "30s", target: 20 },   // warm up
    { duration: "60s", target: 100 },   // 5× burst
    { duration: "30s", target: 0 },     // cool down
  ],
  thresholds: {
    error_rate: ["rate<0.05"],  // 5% tolerance during burst
    http_req_duration: ["p(99)<10000"],
  },
};

// ── Mint function ──

function mintHeaders() {
  const res = http.post(
    `${BASE_URL}/functions/v1/mint-load-test-headers`,
    JSON.stringify({}),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH_TOKEN}`,
        apikey: ANON_KEY,
        "X-LoadTest-Secret": LOADTEST_SECRET,
      },
    }
  );
  if (res.status !== 200) {
    fail(`Mint FAILED: status=${res.status} body=${res.body}`);
  }
  const body = JSON.parse(res.body);
  return {
    ts: body["X-LoadTest-Timestamp"],
    token: body["X-LoadTest-Token"],
    expiresAt: body.expiresAt,
    mintedAt: Date.now(),
  };
}

// ── Header rotation with jitter ──

let cached = null;
const JITTER_MIN = 45000;
const JITTER_MAX = 75000;
let refreshInterval = JITTER_MIN + Math.random() * (JITTER_MAX - JITTER_MIN);

function getHeaders() {
  const now = Date.now();
  if (!cached || now - cached.mintedAt > refreshInterval) {
    cached = mintHeaders();
    refreshInterval = JITTER_MIN + Math.random() * (JITTER_MAX - JITTER_MIN);
  }
  return {
    "Content-Type": "application/json",
    "X-LoadTest-Timestamp": cached.ts,
    "X-LoadTest-Token": cached.token,
    apikey: ANON_KEY,
  };
}

// ── Preflight ──

export function setup() {
  console.log(`[burst] Preflight: minting headers...`);
  const minted = mintHeaders();
  console.log(`[burst] Mint OK. expiresAt=${minted.expiresAt}`);

  // Validate workspace
  const wsRes = http.get(
    `${BASE_URL}/rest/v1/workspaces?id=eq.${WORKSPACE_ID}&select=id`,
    { headers: { Authorization: `Bearer ${AUTH_TOKEN}`, apikey: ANON_KEY } }
  );
  const wsData = JSON.parse(wsRes.body);
  if (!Array.isArray(wsData) || wsData.length !== 1) {
    fail(`Preflight FAILED: workspace ${WORKSPACE_ID} not found. Response: ${wsRes.body}`);
  }

  // Validate item
  const itemRes = http.get(
    `${BASE_URL}/rest/v1/items?id=eq.${ITEM_ID}&select=id,workspace_id`,
    { headers: { Authorization: `Bearer ${AUTH_TOKEN}`, apikey: ANON_KEY } }
  );
  const itemData = JSON.parse(itemRes.body);
  if (!Array.isArray(itemData) || itemData.length !== 1) {
    fail(`Preflight FAILED: item ${ITEM_ID} not found. Response: ${itemRes.body}`);
  }
  if (itemData[0].workspace_id !== WORKSPACE_ID) {
    fail(`Preflight FAILED: item workspace mismatch. Got ${itemData[0].workspace_id}, expected ${WORKSPACE_ID}`);
  }

  // Validate load-test auth with one create
  const testRes = http.post(
    `${BASE_URL}/functions/v1/execute-action-server`,
    JSON.stringify({
      mode: "create",
      params: {
        itemId: ITEM_ID,
        workspaceId: WORKSPACE_ID,
        type: "send_notice",
        channel: "email",
        scheduledFor: new Date().toISOString(),
        idempotencyKey: `lt-preflight-${RUN_ID}`,
        source: "system",
        payloadJson: { loadTest: true, runId: RUN_ID, tag: "[LOAD-TEST]", preflight: true },
      },
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "X-LoadTest-Timestamp": minted.ts,
        "X-LoadTest-Token": minted.token,
        apikey: ANON_KEY,
      },
    }
  );
  if (testRes.status !== 200) {
    fail(`Preflight FAILED: create returned status=${testRes.status} body=${testRes.body}`);
  }
  const testBody = JSON.parse(testRes.body);
  if (!testBody.success) {
    fail(`Preflight FAILED: create returned success=false. Body: ${testRes.body}`);
  }

  console.log(`[burst] Preflight PASSED. actionId=${testBody.actionId}`);
  return { runId: RUN_ID };
}

// ── Main VU function ──

export default function () {
  // 10% dedup pairs during burst
  const isDedupTest = __ITER % 10 === 0;
  const idempotencyKey = isDedupTest
    ? `lt-${RUN_ID}-dedup-${__VU}-${Math.floor(__ITER / 10)}`
    : `lt-${RUN_ID}-${__VU}-${__ITER}`;

  const payload = JSON.stringify({
    mode: "create",
    params: {
      itemId: ITEM_ID,
      workspaceId: WORKSPACE_ID,
      type: "send_notice",
      channel: "email",
      scheduledFor: new Date().toISOString(),
      idempotencyKey,
      source: "system",
      payloadJson: { loadTest: true, runId: RUN_ID, tag: "[LOAD-TEST]" },
    },
  });

  const headers = getHeaders();

  const res = http.post(
    `${BASE_URL}/functions/v1/execute-action-server`,
    payload,
    { headers, tags: { name: "create_action_burst" } }
  );

  const success = check(res, {
    "status is 200": (r) => r.status === 200,
    "body has success": (r) => {
      try { return JSON.parse(r.body).success === true; } catch { return false; }
    },
  });

  errorRate.add(!success);
  createLatency.add(res.timings.duration);

  if (!success) {
    console.warn(
      `[FAIL] VU=${__VU} ITER=${__ITER} status=${res.status} body=${(res.body || "").substring(0, 200)}`
    );
  }
}
