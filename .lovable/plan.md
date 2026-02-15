

# Remove `maxVUs` for k6 Compatibility

## Problem

The installed k6 version does not recognize `maxVUs` as a valid field in the `ramping-vus` executor schema, causing a parse error. The VU cap is still enforced correctly because k6 infers `maxVUs` from the highest `target` in the `stages` array, which is already `SUSTAINED_VUS`.

## Change

**File:** `load-tests/sustained.js` (lines 64-75)

Remove the `maxVUs: SUSTAINED_VUS` line from the scenario config:

```js
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
```

The existing acceptance gate (`handleSummary` checking `vus_max === SUSTAINED_VUS`) and the `setup()` hard guard remain unchanged -- they still enforce correctness without relying on the `maxVUs` field.

One line removed. No other files affected.

