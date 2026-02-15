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
 * Default: 30 VUs for 15 minutes (configurable via K6_SUSTAINED_VUS).
 *
 * Auth: Uses isolated load-test HMAC headers minted from
 * mint-load-test-headers endpoint. Minting uses X-LoadTest-Operator + secret
 * (no JWT). JWT is used only in setup() for preflight RLS queries.
 * Headers are rotated every 20-40s (jittered) per VU with 60s expiry margin.
 *
 * This measures CLIENT-OBSERVED latency only.
 * Monitor DB CPU, locks, and connections separately.
 */

import http from "k6/http";
import { check, fail, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.1.0/index.js";

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
const mintRefreshFailed = new Rate("mint_refresh_failed");
const vuSkippedNoHeaders = new Rate("vu_skipped_no_headers");
const failStatus401 = new Counter("fail_status_401");
const failStatus429 = new Counter("fail_status_429");
const failStatus5xx = new Counter("fail_status_5xx");
const failStatusOther = new Counter("fail_status_other");
const RUN_ID = `lt-sus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Per-VU fail-log sampling (default: 3 per VU)
const FAIL_LOG_LIMIT = parseInt(__ENV.K6_FAIL_LOG_LIMIT || "3", 10);
let failLogCount = 0;

const SUSTAINED_VUS = parseInt(__ENV.K6_SUSTAINED_VUS || "30", 10);

// Startup logging moved to setup() to avoid per-VU init-context spam.

// ── Scenario-driven options ──
export const options = {
  scenarios: {
    sustained: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: SUSTAINED_VUS },
        { duration: "15m", target: SUSTAINED_VUS },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
      gracefulStop: "30s",
    },
  },
  thresholds: {
    error_rate: [{ threshold: "rate<0.01", abortOnFail: false }],
    http_req_duration: ["p(95)<3000", "p(99)<5000"],
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

// Setup-only mint helper. NEVER call from default() or getHeaders().
function mintHeadersForSetup() {
  const result = mintHeadersRaw();
  if (!result) {
    fail("Mint FAILED after 4 attempts in setup preflight");
  }
  return result;
}

// ── Header rotation with expiry-aware refresh and bounded backoff ──

let cached = null;
const JITTER_MIN = 20000;
const JITTER_MAX = 40000;
let refreshInterval = JITTER_MIN + Math.random() * (JITTER_MAX - JITTER_MIN);

const TOKEN_SAFETY_MARGIN_S = 30;
let mintBackoffMs = 500;
const MINT_BACKOFF_MAX_MS = 5000;

function getHeaders() {
  const now = Date.now();
  const nowSec = now / 1000;
  const expiredByTime = now - (cached?.mintedAt || 0) > refreshInterval;
  const expiredByToken = cached && nowSec > (cached.expiresAt - 60);

  if (!cached || expiredByTime || expiredByToken) {
    const minted = mintHeadersRaw();
    if (!minted) {
      mintRefreshFailed.add(true);
      // Bounded exponential backoff with jitter
      const jitter = 0.8 + Math.random() * 0.4;
      sleep((mintBackoffMs / 1000) * jitter);
      mintBackoffMs = Math.min(mintBackoffMs * 2, MINT_BACKOFF_MAX_MS);

      // Only reuse cached if it has not expired past safety margin
      if (cached && nowSec < (cached.expiresAt - TOKEN_SAFETY_MARGIN_S)) {
        console.warn(
          `[mint-refresh] Failed, reusing cached headers ` +
          `(age=${now - cached.mintedAt}ms, ttl=${Math.round(cached.expiresAt - nowSec)}s)`
        );
        return {
          "Content-Type": "application/json",
          "X-LoadTest-Timestamp": cached.ts,
          "X-LoadTest-Token": cached.token,
          apikey: ANON_KEY,
        };
      }
      // Cached headers are expired or don't exist -- skip iteration
      return null;
    }
    cached = minted;
    mintRefreshFailed.add(false);
    mintBackoffMs = 500; // reset backoff on success
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
  // Hard guard: abort if K6_SUSTAINED_VUS env doesn't match parsed value
  if (__ENV.K6_SUSTAINED_VUS) {
    const envVal = parseInt(__ENV.K6_SUSTAINED_VUS, 10);
    if (SUSTAINED_VUS !== envVal) {
      fail(`VU mismatch: parsed SUSTAINED_VUS=${SUSTAINED_VUS} but K6_SUSTAINED_VUS=${envVal}`);
    }
  }
  console.log(`[sustained] ENV K6_SUSTAINED_VUS=${__ENV.K6_SUSTAINED_VUS || "(unset)"}`);
  console.log(`[sustained] Scenario target VUs: ${SUSTAINED_VUS}`);

  console.log(`[sustained] Preflight: minting headers...`);
  const minted = mintHeadersForSetup();
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

  // Log acceptance gate criteria
  console.log(`[sustained] === ATTEMPT ACCEPTANCE GATE ===`);
  console.log(`[sustained] Required: vus_max=${SUSTAINED_VUS}`);
  console.log(`[sustained] Required: zero GoError/fail() stack traces`);
  console.log(`[sustained] Required: zero "Item lookup failed"`);
  console.log(`[sustained] Required: "Invalid load test token" <= 5 (de minimis)`);

  return { runId: RUN_ID, itemId: ITEM_ID, workspaceId: WORKSPACE_ID };
}

// ── Main VU function ──

export default function (data) {
  const headers = getHeaders();
  if (!headers) {
    errorRate.add(true);
    vuSkippedNoHeaders.add(true);
    console.warn(`[SKIP] VU=${__VU} ITER=${__ITER} reason=no_valid_headers`);
    return;
  }
  vuSkippedNoHeaders.add(false);

  const idempotencyKey = `lt-${data.runId}-${__VU}-${__ITER}`;

  const payload = JSON.stringify({
    mode: "create",
    params: {
      itemId: data.itemId,
      workspaceId: data.workspaceId,
      type: "send_notice",
      channel: "email",
      scheduledFor: new Date().toISOString(),
      idempotencyKey,
      source: "system",
      payloadJson: { loadTest: true, runId: data.runId, tag: "[LOAD-TEST]" },
    },
  });

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
    // Increment globally-aggregated status counters
    const s = res.status;
    if (s === 401) failStatus401.add(1);
    else if (s === 429) failStatus429.add(1);
    else if (s >= 500 && s <= 599) failStatus5xx.add(1);
    else failStatusOther.add(1);

    // Per-VU capped sampling (default: 3 per VU)
    if (failLogCount < FAIL_LOG_LIMIT) {
      failLogCount++;
      console.warn(
        `[FAIL] VU=${__VU} #${failLogCount} status=${res.status} body=${(res.body || "").substring(0, 200)}`
      );
    }
  }
}

// ── Post-run acceptance gate ──

export function handleSummary(data) {
  const metrics = data.metrics;

  const gates = [];

  // Gate: interrupted run (Ctrl+C / SIGINT / SIGTERM)
  if (data.state?.isInterrupted) {
    gates.push("FAIL: run was interrupted (signal/abort)");
  }
  const iterInterrupted = metrics.iterations_interrupted?.values?.count || 0;
  if (iterInterrupted > 0) {
    gates.push(`FAIL: iterations_interrupted=${iterInterrupted}`);
  }

  const vuMax = metrics.vus_max?.values?.max || 0;
  if (vuMax !== SUSTAINED_VUS) {
    gates.push(`FAIL: vus_max=${vuMax}, expected=${SUSTAINED_VUS}`);
  }

  const mintFails = metrics.mint_refresh_failed?.values?.rate || 0;
  const skipRate = metrics.vu_skipped_no_headers?.values?.rate || 0;

  gates.push(`INFO: mint_refresh_failed rate=${(mintFails * 100).toFixed(2)}%`);
  gates.push(`INFO: vu_skipped_no_headers rate=${(skipRate * 100).toFixed(2)}%`);

  const errRate = metrics.error_rate?.values?.rate || 0;
  if (errRate >= 0.01) {
    gates.push(`FAIL: error_rate=${(errRate * 100).toFixed(2)}% (threshold: <1%)`);
  }

  const p95 = metrics.http_req_duration?.values?.["p(95)"] || 0;
  const p99 = metrics.http_req_duration?.values?.["p(99)"] || 0;
  if (p95 >= 3000) gates.push(`FAIL: p95=${p95.toFixed(0)}ms (threshold: <3000ms)`);
  if (p99 >= 5000) gates.push(`FAIL: p99=${p99.toFixed(0)}ms (threshold: <5000ms)`);

  // Status code breakdown (globally aggregated Counters)
  const s401 = metrics.fail_status_401?.values?.count || 0;
  const s429 = metrics.fail_status_429?.values?.count || 0;
  const s5xx = metrics.fail_status_5xx?.values?.count || 0;
  const sOther = metrics.fail_status_other?.values?.count || 0;
  const totalFails = s401 + s429 + s5xx + sOther;

  if (totalFails > 0) {
    gates.push(`INFO: Failure breakdown (total=${totalFails}):`);
    if (s401 > 0) gates.push(`  401: ${s401} (${(s401/totalFails*100).toFixed(1)}%)`);
    if (s429 > 0) gates.push(`  429: ${s429} (${(s429/totalFails*100).toFixed(1)}%)`);
    if (s5xx > 0) gates.push(`  5xx: ${s5xx} (${(s5xx/totalFails*100).toFixed(1)}%)`);
    if (sOther > 0) gates.push(`  other: ${sOther} (${(sOther/totalFails*100).toFixed(1)}%)`);
  }

  const canonical = gates.filter(g => g.startsWith("FAIL")).length === 0;

  const summary = [
    "",
    "═══════════════════════════════════════",
    `  ATTEMPT CLASSIFICATION: ${canonical ? "CANONICAL" : "INVALID"}`,
    `  Target VUs: ${SUSTAINED_VUS}  |  Actual vus_max: ${vuMax}`,
    ...gates.map(g => `  ${g}`),
    "═══════════════════════════════════════",
    "",
  ].join("\n");

  return {
    stdout: summary + textSummary(data, { indent: "  " }),
  };
}
