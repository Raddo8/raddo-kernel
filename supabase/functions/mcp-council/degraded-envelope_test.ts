// supabase/functions/mcp-council/degraded-envelope_test.ts
//
// Lane A Commit 4 proofs. Run: deno test -A degraded-envelope_test.ts
//
// These exercise the envelope builder and the vault-derived content_status
// against stub clients. They assert by KEY INSPECTION, never by eyeballing.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ACCEPTED_SAVE_FIELDS,
  buildDegradedEnvelope,
  resolveContentStatus,
  returnedPayload,
} from "./degraded-envelope.ts";

const ENVELOPE_KEYS = [
  "outcome", "reason", "retryable", "save_attempt_id", "client_request_id",
  "payload_hash", "receipt_id", "overall_status", "failure_stage",
  "content_status", "recovery_expires_at", "layers", "returned_payload",
  "next_action", "note",
].sort();

/** Stub admin whose vault table returns whatever row we hand it. */
function stubAdmin(row: any, error: any = null) {
  return {
    from() {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: row, error }),
      };
      return q;
    },
  };
}

const DIRTY_ARGS = {
  session_id: "sess-1",
  client_request_id: "req-abcdefgh",
  decisions: [{ title: "Ship it" }],
  open_loops: [{ title: "Chase invoice" }],
  signals: [], memory: [], rules_captured: [],
  checkpoint: { principal_state: "steady" },
  // everything below must be dropped
  access_token: "tok_secret",
  authorization: "Bearer xyz",
  identity: { principal_id: "p1", cid: "COB-HQ" },
  tool_manifest_version: "2026.07.31.3",
  manifest_version: "2026.07.31.3",
  build_id: "truthful_degraded_v1",
  request_id: "rq_1",
  correlation_id: "cor_1",
  telemetry: { ms: 12 },
  unknown_prop: "nope",
};

Deno.test("1 · session_not_found returns the degraded envelope, RECOVERY_HELD", async () => {
  const held = await resolveContentStatus(
    stubAdmin({ wrapped_dek: "d2FsbA==", expires_at: "2026-08-03T19:00:00Z", erased_at: null }),
    "att-1",
  );
  const env = buildDegradedEnvelope({
    reason: "session_not_found",
    retryable: true,
    save_attempt_id: "att-1",
    client_request_id: "req-abcdefgh",
    payload_hash: "a".repeat(64),
    failure_stage: "SESSION_VALIDATION",
    content_status: held.content_status,
    recovery_expires_at: held.recovery_expires_at,
    layers: null,
    args: DIRTY_ARGS,
  });
  console.log("CASE 1", JSON.stringify(env, null, 2));
  assertEquals(Object.keys(env).sort(), ENVELOPE_KEYS);
  assertEquals(env.outcome, "degraded");
  assertEquals(env.retryable, true);
  assertEquals(env.failure_stage, "SESSION_VALIDATION");
  assertEquals(env.content_status, "RECOVERY_HELD");
  assert(env.save_attempt_id);
  assertEquals(env.next_action, "open a new session, then resubmit with a NEW client_request_id");
  assert(env.note.startsWith("I could not connect this save to an active session"));
});

Deno.test("2 · cid_unresolved reports identity_binding_required at CID_RESOLUTION", async () => {
  const held = await resolveContentStatus(
    stubAdmin({ wrapped_dek: "d2FsbA==", expires_at: "2026-08-03T19:00:00Z", erased_at: null }),
    "att-2",
  );
  const env = buildDegradedEnvelope({
    reason: "identity_binding_required",
    retryable: false,
    save_attempt_id: "att-2",
    client_request_id: "req-abcdefgh",
    payload_hash: "b".repeat(64),
    failure_stage: "CID_RESOLUTION",
    content_status: held.content_status,
    recovery_expires_at: held.recovery_expires_at,
    args: DIRTY_ARGS,
  });
  console.log("CASE 2", JSON.stringify(env, null, 2));
  assertEquals(Object.keys(env).sort(), ENVELOPE_KEYS);
  assertEquals(env.reason, "identity_binding_required");
  assertEquals(env.failure_stage, "CID_RESOLUTION");
  assertEquals(env.retryable, false);
  assertEquals(env.outcome, "degraded");
  assertEquals(env.layers, null);
});

Deno.test("3 · mid-leg exception returns failed with the exact per-layer state", async () => {
  const layers = [
    { layer: "decisions", requested: 2, attempted: 2, saved: 1, failed: 1, verified: true, error_code: "pg_error", record_ids: ["d1"] },
    { layer: "open_loops", requested: 1, attempted: 1, saved: 0, failed: 1, verified: false, error_code: "boom", record_ids: [] },
    { layer: "memory", requested: 0, attempted: 0, saved: 0, failed: 0, verified: false, error_code: null, record_ids: [] },
  ];
  const held = await resolveContentStatus(
    stubAdmin({ wrapped_dek: "d2FsbA==", expires_at: "2026-08-03T19:00:00Z", erased_at: null }),
    "att-3",
  );
  const env = buildDegradedEnvelope({
    reason: "internal_save_failure",
    retryable: false,
    save_attempt_id: "att-3",
    client_request_id: "req-abcdefgh",
    payload_hash: "c".repeat(64),
    failure_stage: "LEG_EXCEPTION",
    content_status: held.content_status,
    recovery_expires_at: held.recovery_expires_at,
    layers,
    args: DIRTY_ARGS,
  });
  console.log("CASE 3", JSON.stringify(env, null, 2));
  assertEquals(env.outcome, "failed");
  assertEquals(env.failure_stage, "LEG_EXCEPTION");
  assertEquals(env.layers, layers);
  // BINDING: must not claim nothing was saved once layers ran.
  assert(!env.note.toLowerCase().includes("nothing was"));
  assert(env.note.includes("authoritative record"));
});

Deno.test("4 · returned_payload leaks nothing · asserted by key inspection", () => {
  const p = returnedPayload(DIRTY_ARGS);
  const keys = Object.keys(p).sort();
  console.log("CASE 4 returned_payload keys", keys);
  // Every key must be a member of the accepted set. No exceptions.
  for (const k of keys) assert((ACCEPTED_SAVE_FIELDS as readonly string[]).includes(k), `leaked key: ${k}`);
  const forbidden = [
    "access_token", "authorization", "identity", "tool_manifest_version",
    "manifest_version", "build_id", "request_id", "correlation_id",
    "telemetry", "unknown_prop", "session_id", "client_request_id",
  ];
  for (const f of forbidden) assertEquals(Object.hasOwn(p, f), false, `leaked ${f}`);
  assertEquals(keys, ["checkpoint", "decisions", "memory", "open_loops", "rules_captured", "signals"]);
});

Deno.test("5 · a failed recovery write reads NOT_HELD, never RECOVERY_HELD", async () => {
  // (a) no vault row at all — the Commit 3 write failed outright
  const none = await resolveContentStatus(stubAdmin(null), "att-5");
  // (b) row exists but the wrapped DEK never landed — content is unrecoverable
  const noDek = await resolveContentStatus(stubAdmin({ wrapped_dek: null, expires_at: "x", erased_at: null }), "att-5");
  // (c) row was crypto-erased
  const erased = await resolveContentStatus(stubAdmin({ wrapped_dek: "d2FsbA==", expires_at: "x", erased_at: "2026-07-31T00:00:00Z" }), "att-5");
  // (d) the attempt itself never opened
  const noAttempt = await resolveContentStatus(stubAdmin({ wrapped_dek: "d2FsbA==" }), null);
  // (e) the read itself errored — we do not guess
  const errored = await resolveContentStatus(stubAdmin(null, { message: "boom" }), "att-5");

  console.log("CASE 5", JSON.stringify({ none, noDek, erased, noAttempt, errored }, null, 2));
  for (const r of [none, noDek, erased, noAttempt, errored]) {
    assertEquals(r.content_status, "NOT_HELD");
    assertEquals(r.recovery_expires_at, null);
  }

  const env = buildDegradedEnvelope({
    reason: "session_not_found",
    retryable: true,
    save_attempt_id: "att-5",
    client_request_id: "req-abcdefgh",
    payload_hash: "e".repeat(64),
    failure_stage: "SESSION_VALIDATION",
    content_status: none.content_status,
    recovery_expires_at: none.recovery_expires_at,
    args: DIRTY_ARGS,
  });
  assertEquals(env.content_status, "NOT_HELD");
  assertEquals(Object.keys(env).sort(), ENVELOPE_KEYS);
});
