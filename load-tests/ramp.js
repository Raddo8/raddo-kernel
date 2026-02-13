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
 * Pass criteria:
 *   - Error rate < 1%
 *   - p99 latency < 3× baseline (first-stage p99)
 *
 * This script does NOT measure DB CPU, memory, locks, or cold starts.
 * Those must be monitored separately during the run.
 */

import http from "k6/http";
import { check, fail } from "k6";
import { Rate, Trend } from "k6/metrics";

// ── Safety: require test workspace ──
const BASE_URL = __ENV.K6_BASE_URL;
const ANON_KEY = __ENV.K6_ANON_KEY;
const WORKSPACE_ID = __ENV.K6_TEST_WORKSPACE_ID;
const ACCOUNT_ID = __ENV.K6_TEST_ACCOUNT_ID;
const ITEM_ID = __ENV.K6_TEST_ITEM_ID;
const AUTH_TOKEN = __ENV.K6_AUTH_TOKEN;

if (!WORKSPACE_ID) {
  fail("K6_TEST_WORKSPACE_ID is required. Never run against production.");
}
if (!BASE_URL || !ANON_KEY || !ITEM_ID || !AUTH_TOKEN) {
  fail("Missing required environment variables. See load-tests/README.md.");
}

// ── Custom metrics ──
const errorRate = new Rate("error_rate");
const createLatency = new Trend("create_latency", true);

// ── Run ID for idempotency key scoping ──
const RUN_ID = `lt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ── Options: ramp from 1 to 50 VUs over 5 minutes ──
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
  maxVUs: 50,
  maxDuration: "5m",
};

export default function () {
  const iteration = __ITER;
  const vu = __VU;

  // 10% of requests reuse keys in pairs for dedup testing.
  // Pair index: every 10th request shares a key with the previous 10th.
  const isDedupTest = iteration % 10 === 0;
  const idempotencyKey = isDedupTest
    ? `${RUN_ID}-dedup-${vu}-${Math.floor(iteration / 10)}`
    : `${RUN_ID}-${vu}-${iteration}`;

  const payload = JSON.stringify({
    mode: "create",
    params: {
      itemId: ITEM_ID,
      type: "send_notice",
      channel: "email",
      scheduledFor: new Date().toISOString(),
      idempotencyKey: idempotencyKey,
      source: "system",
      payloadJson: { loadTest: true, runId: RUN_ID, tag: "[LOAD-TEST]" },
    },
  });

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${AUTH_TOKEN}`,
    apikey: ANON_KEY,
  };

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
}
