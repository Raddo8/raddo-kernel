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

if (!WORKSPACE_ID) {
  fail("K6_TEST_WORKSPACE_ID is required. Never run against production.");
}
if (!BASE_URL || !ANON_KEY || !ITEM_ID || !AUTH_TOKEN) {
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
    error_rate: [{ threshold: "rate<0.01", abortOnFail: true }],
    http_req_duration: ["p(95)<3000", "p(99)<5000"],
  },
  maxVUs: 40,
  maxDuration: "30m",
};

export default function () {
  const idempotencyKey = `${RUN_ID}-${__VU}-${__ITER}`;

  const payload = JSON.stringify({
    mode: "create",
    params: {
      itemId: ITEM_ID,
      type: "send_notice",
      channel: "email",
      scheduledFor: new Date().toISOString(),
      idempotencyKey,
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
}
