## Goal
`slack-bridge-events` verifies Slack request signatures with `SLACK_SIGNING_SECRET`. That secret is not currently configured (confirmed against the project's 21 existing secrets), so every inbound Slack event returns 401.

## Steps
1. Open a secure form requesting `SLACK_SIGNING_SECRET` (format hint: 32-char hex, e.g. `8f742...`). You paste the value; it is stored encrypted and never lands in code.
2. Redeploy `slack-bridge-events` so the function picks up the new environment variable.
3. Verify: send a test request and confirm the function no longer returns 401 for a correctly signed payload (an unsigned curl should still return 401 — that is intended).

## Where to find the value
Slack app settings → **Basic Information** → **App Credentials** → **Signing Secret** → Show → copy.

## Notes
- No schema, code, or existing-secret changes. Only the new secret plus one function redeploy.
- Slack's request URL for the app is `https://vacpgxxgdfhgvkduljgs.supabase.co/functions/v1/slack-bridge-events` (already deployed with `verify_jwt = false`).
