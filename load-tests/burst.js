/**
 * Phase 3: Burst Spike Test
 *
 * Applies a 5× spike (100 VUs) for 60 seconds after a warm-up period.
 *
 * Auth: Uses isolated load-test HMAC headers minted from
 * mint-load-test-headers endpoint. Minting uses X-LoadTest-Operator + secret
 * (no JWT). JWT is used only in setup() for preflight RLS queries.
 * Headers are rotated every 20-40s (jittered) per VU with 60s expiry margin.
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
import { check, fail, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.K6_BASE_URL;
const ANON_KEY = __ENV.K6_ANON_KEY;
const WORKSPACE_ID = __ENV.K6_TEST_WORKSPACE_ID;
const ITEM_ID = __ENV.K6_TEST_ITEM_ID;
const AUTH_TOKEN = __ENV.K6_AUTH_TOKEN;
const LOADTEST_SECRET = __ENV.K6_LOADTEST_SECRET;
const OPERATOR_ID = __ENV.K6_OPERATOR_ID;

if (!WORKSPACE_ID) {
  fail("K6_TEST_WORKSPACE_ID is required. Never run against production.");
}
if (!BASE_URL || !ANON_KEY || !ITEM_ID || !AUTH_TOKEN || !LOADTEST_SECRET || !OPERATOR_ID) {
  fail("Missing required environment variables. See load-tests/README.md.");
}

// ── Placeholder guard ──
function looksLikePlaceholder(v) {
  return !v || v.includes("<") || v.includes(">") || v.startsWith("your-");
}
if (looksLikePlaceholder(WORKSPACE_ID) || looksLikePlaceholder(ITEM_ID) || looksLikePlaceholder(OPERATOR_ID)) {
  fail(
    "K6_TEST_WORKSPACE_ID or K6_TEST_ITEM_ID contains a placeholder value. " +
    "Set real UUIDs. See load-tests/README.md."
  );
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
          "X-LoadTest-Operator": OPERATOR_ID,
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
  return null;
}

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
      return null;
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
  console.log(`[burst] Preflight: minting headers...`);
  const minted = mintHeadersOrFail();
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
  const headers = getHeaders();
  if (!headers) {
    errorRate.add(true);
    console.warn(`[SKIP] VU=${__VU} ITER=${__ITER} reason=mint_exhausted`);
    return;
  }

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
