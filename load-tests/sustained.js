/**
 * Phase 2: Sustained Load Test
 *
 * Holds at a steady VU count for 15 minutes to detect:
 *   - Latency drift (creeping p99)
 *   - Connection pool saturation
 *   - Memory growth
 *   - Rate-limit behavior
 *   - Retry amplification
 *
 * Run at 80% of the safe RPS ceiling found by ramp.js.
 * Default: 30 VUs for 15 minutes.
 *
 * Auth: Uses isolated load-test HMAC headers minted from
 * mint-load-test-headers endpoint. JWT is used ONLY for minting.
 * Headers are rotated every 45-75s (jittered) per VU.
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
const RUN_ID = `lt-sus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const options = {
  stages: [
    { duration: "30s", target: 30 },   // ramp up
    { duration: "15m", target: 30 },    // sustained
    { duration: "30s", target: 0 },     // ramp down
  ],
  thresholds: {
    error_rate: [{ threshold: "rate<0.01", abortOnFail: false }],
    http_req_duration: ["p(95)<3000", "p(99)<5000"],
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

// ── Header rotation with jitter (per-VU state) ──

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

// ── Preflight: validate fixtures using load-test auth ──

export function setup() {
  console.log(`[sustained] Preflight: minting headers...`);
  const minted = mintHeaders();
  console.log(`[sustained] Mint OK. expiresAt=${minted.expiresAt}`);

  // Validate workspace via REST (JWT auth — reads RLS-gated data)
  const wsRes = http.get(
    `${BASE_URL}/rest/v1/workspaces?id=eq.${WORKSPACE_ID}&select=id`,
    {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        apikey: ANON_KEY,
      },
    }
  );
  const wsData = JSON.parse(wsRes.body);
  if (!Array.isArray(wsData) || wsData.length !== 1) {
    fail(`Preflight FAILED: workspace ${WORKSPACE_ID} not found or not accessible. Response: ${wsRes.body}`);
  }

  // Validate item exists and belongs to workspace
  const itemRes = http.get(
    `${BASE_URL}/rest/v1/items?id=eq.${ITEM_ID}&select=id,workspace_id`,
    {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        apikey: ANON_KEY,
      },
    }
  );
  const itemData = JSON.parse(itemRes.body);
  if (!Array.isArray(itemData) || itemData.length !== 1) {
    fail(`Preflight FAILED: item ${ITEM_ID} not found. Response: ${itemRes.body}`);
  }
  if (itemData[0].workspace_id !== WORKSPACE_ID) {
    fail(`Preflight FAILED: item workspace_id=${itemData[0].workspace_id} does not match K6_TEST_WORKSPACE_ID=${WORKSPACE_ID}`);
  }

  // Validate load-test auth path with one create request
  const testPayload = JSON.stringify({
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
  });

  const testRes = http.post(
    `${BASE_URL}/functions/v1/execute-action-server`,
    testPayload,
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
    fail(`Preflight FAILED: create request returned status=${testRes.status} body=${testRes.body}`);
  }
  const testBody = JSON.parse(testRes.body);
  if (!testBody.success) {
    fail(`Preflight FAILED: create request returned success=false. Body: ${testRes.body}`);
  }

  console.log(`[sustained] Preflight PASSED. actionId=${testBody.actionId}`);
  return { runId: RUN_ID };
}

// ── Main VU function ──

export default function () {
  const idempotencyKey = `lt-${RUN_ID}-${__VU}-${__ITER}`;

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
    { headers, tags: { name: "create_action_sustained" } }
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
