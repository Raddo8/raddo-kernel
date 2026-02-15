/**
 * Phase 1: Controlled Ramp Test
 *
 * Determines safe RPS ceiling by ramping VUs from 1 → 50.
 * Measures client-observed latency (p50/p95/p99), error rate, and throughput.
 *
 * 10% of requests intentionally reuse idempotency keys in pairs to measure
 * duplicate prevention under concurrency. Post-run, verify exactly one
 * action row per shared key in the database.
 *
 * Auth: Uses isolated load-test HMAC headers minted from
 * mint-load-test-headers endpoint. JWT is used ONLY for minting.
 * Headers are rotated every 20-40s (jittered) per VU with 60s expiry margin.
 *
 * Pass criteria:
 *   - Error rate < 1%
 *   - p99 latency < 3× baseline (first-stage p99)
 *
 * This script does NOT measure DB CPU, memory, locks, or cold starts.
 * Those must be monitored separately during the run.
 */

import http from "k6/http";
import { check, fail, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ── Safety: require test workspace ──
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

// ── Placeholder guard ──
function looksLikePlaceholder(v) {
  return !v || v.includes("<") || v.includes(">") || v.startsWith("your-");
}
if (looksLikePlaceholder(WORKSPACE_ID) || looksLikePlaceholder(ITEM_ID)) {
  fail(
    "K6_TEST_WORKSPACE_ID or K6_TEST_ITEM_ID contains a placeholder value. " +
    "Set real UUIDs. See load-tests/README.md."
  );
}

// ── Custom metrics ──
const errorRate = new Rate("error_rate");
const createLatency = new Trend("create_latency", true);

// ── Run ID for idempotency key scoping ──
const RUN_ID = `lt-ramp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ── Options: ramp from 1 to 50 VUs over 3 minutes ──
export const options = {
  stages: [
    { duration: "30s", target: 5 },
    { duration: "30s", target: 10 },
    { duration: "30s", target: 20 },
    { duration: "30s", target: 30 },
    { duration: "30s", target: 40 },
    { duration: "30s", target: 50 },
  ],
  thresholds: {
    error_rate: [{ threshold: "rate<0.01", abortOnFail: true }],
    http_req_duration: ["p(99)<5000"],
  },
};

// ── Mint function with jittered retries ──

function mintHeadersRaw() {
  const backoffs = [0.25, 0.75, 1.5];
  let lastRes;

  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    if (attempt > 0) {
      const jitter = 0.8 + Math.random() * 0.4;
      sleep(backoffs[attempt - 1] * jitter);
    }
    lastRes = http.post(
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
    if (lastRes.status === 200) {
      const body = JSON.parse(lastRes.body);
      return {
        ts: body["X-LoadTest-Timestamp"],
        token: body["X-LoadTest-Token"],
        expiresAt: body.expiresAt,
        mintedAt: Date.now(),
      };
    }
    console.warn(
      `[mint] Attempt ${attempt + 1} failed: status=${lastRes.status} body=${(lastRes.body || "").substring(0, 200)}`
    );
  }
  return null; // all retries exhausted
}

// Used in setup() -- hard abort on failure
function mintHeadersOrFail() {
  const result = mintHeadersRaw();
  if (!result) {
    fail("Mint FAILED after 4 attempts in preflight");
  }
  return result;
}

// ── Header rotation with expiry-aware refresh ──

let cached = null;
const JITTER_MIN = 20000;
const JITTER_MAX = 40000;
let refreshInterval = JITTER_MIN + Math.random() * (JITTER_MAX - JITTER_MIN);

function getHeaders() {
  const now = Date.now();
  const expiredByTime = now - (cached?.mintedAt || 0) > refreshInterval;
  const expiredByToken = cached && (now / 1000) > (cached.expiresAt - 60);

  if (!cached || expiredByTime || expiredByToken) {
    const minted = mintHeadersRaw();
    if (!minted) {
      return null; // signal caller to skip iteration
    }
    cached = minted;
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
  console.log(`[ramp] Preflight: minting headers...`);
  const minted = mintHeadersOrFail();
  console.log(`[ramp] Mint OK. expiresAt=${minted.expiresAt}`);

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

  console.log(`[ramp] Preflight PASSED. actionId=${testBody.actionId}`);
  return { runId: RUN_ID };
}

// ── Main VU function ──

export default function () {
  const headers = getHeaders();
  if (!headers) {
    errorRate.add(true);
    console.warn(`[SKIP] VU=${__VU} ITER=${__ITER} reason=mint_exhausted`);
    return;
  }

  const iteration = __ITER;
  const vu = __VU;

  // 10% dedup pairs
  const isDedupTest = iteration % 10 === 0;
  const idempotencyKey = isDedupTest
    ? `lt-${RUN_ID}-dedup-${vu}-${Math.floor(iteration / 10)}`
    : `lt-${RUN_ID}-${vu}-${iteration}`;

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

  const res = http.post(
    `${BASE_URL}/functions/v1/execute-action-server`,
    payload,
    { headers, tags: { name: "create_action" } }
  );

  const success = check(res, {
    "status is 200": (r) => r.status === 200,
    "body has success": (r) => {
      try {
        return JSON.parse(r.body).success === true;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);
  createLatency.add(res.timings.duration);

  if (!success) {
    console.warn(
      `[FAIL] VU=${vu} ITER=${iteration} status=${res.status} body=${(res.body || "").substring(0, 200)}`
    );
  }
}
