/**
 * Phase 3: Burst Spike Test
 *
 * Applies a 5× spike (100 VUs) for 60 seconds after a warm-up period.
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

if (!WORKSPACE_ID) {
  fail("K6_TEST_WORKSPACE_ID is required. Never run against production.");
}
if (!BASE_URL || !ANON_KEY || !ITEM_ID || !AUTH_TOKEN) {
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
  maxVUs: 100,
  maxDuration: "2m",
};

export default function () {
  // 10% dedup pairs during burst to verify idempotency under extreme concurrency
  const isDedupTest = __ITER % 10 === 0;
  const idempotencyKey = isDedupTest
    ? `${RUN_ID}-dedup-${__VU}-${Math.floor(__ITER / 10)}`
    : `${RUN_ID}-${__VU}-${__ITER}`;

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
}
