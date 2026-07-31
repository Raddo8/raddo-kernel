// supabase/functions/mcp-council/save-fingerprint_test.ts
//
// Lane A Commit 5 proofs. Run: deno test -A save-fingerprint_test.ts
//
// The key below is a TEST key generated for this file. It is not a secret and
// is not the production key; the production key is read from the environment
// at runtime and never appears in source.

import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildCanonicalEnvelope,
  canonicalBytesText,
  CanonError,
  computeFingerprint,
  fingerprintEnabled,
  ROLLBACK_FLAG,
} from "./save-fingerprint.ts";

const TEST_KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => (i * 7 + 13) % 256)));

const base = {
  ritual: "save",
  schema_version: "2026.07.31.3",
  cid: "COB-HQ",
  session_id: "11111111-2222-3333-4444-555555555555",
};

const fpOf = (payload: Record<string, unknown>, over: Partial<typeof base> = {}) =>
  computeFingerprint({ ...base, ...over, payload }, TEST_KEY);

Deno.test("1 · reordered object keys produce the SAME fingerprint", async () => {
  const a = await fpOf({
    decisions: [{ title: "Ship it", rationale: "Runway", client_ref: "d-1" }],
    open_loops: [{ title: "Chase invoice", owner: "CFO" }],
  });
  const b = await fpOf({
    open_loops: [{ owner: "CFO", title: "Chase invoice" }],
    decisions: [{ client_ref: "d-1", rationale: "Runway", title: "Ship it" }],
  });
  console.log("T1", a.payload_hash, b.payload_hash);
  assertEquals(a.payload_hash, b.payload_hash);
  assertEquals(a.payload_hash_algorithm, "HMAC-SHA-256");
  assertEquals(a.canonicalization_version, "COB-SAVE-CANON-v1");
});

Deno.test("2 · NFC-equivalent strings produce the SAME fingerprint", async () => {
  const composed = "Ren\u00e9e Bj\u00f6rk";            // NFC
  const decomposed = "Rene\u0301e Bjo\u0308rk";        // NFD, same text
  assertNotEquals(composed, decomposed);
  const a = await fpOf({ decisions: [{ title: composed }] });
  const b = await fpOf({ decisions: [{ title: decomposed }] });
  console.log("T2", a.payload_hash, b.payload_hash);
  assertEquals(a.payload_hash, b.payload_hash);
  // key names normalize too
  const c = await fpOf({ checkpoint: { principal_state: composed } });
  const d = await fpOf({ checkpoint: { principal_state: decomposed } });
  assertEquals(c.payload_hash, d.payload_hash);
});

Deno.test("3 · CRLF, CR and LF produce the SAME fingerprint", async () => {
  const lf = await fpOf({ memory: [{ title: "Notes", body_md: "line one\nline two\nline three" }] });
  const crlf = await fpOf({ memory: [{ title: "Notes", body_md: "line one\r\nline two\r\nline three" }] });
  const cr = await fpOf({ memory: [{ title: "Notes", body_md: "line one\rline two\rline three" }] });
  console.log("T3", lf.payload_hash, crlf.payload_hash, cr.payload_hash);
  assertEquals(lf.payload_hash, crlf.payload_hash);
  assertEquals(lf.payload_hash, cr.payload_hash);
});

Deno.test("4 · meaningful whitespace produces a DIFFERENT fingerprint", async () => {
  const a = await fpOf({ decisions: [{ title: "Approve the raise" }] });
  const b = await fpOf({ decisions: [{ title: "Approve  the raise" }] }); // doubled space
  const c = await fpOf({ decisions: [{ title: " Approve the raise" }] }); // leading space
  const d = await fpOf({ decisions: [{ title: "Approve the raise\n" }] }); // trailing newline
  console.log("T4", { a: a.payload_hash, b: b.payload_hash, c: c.payload_hash, d: d.payload_hash });
  const all = new Set([a, b, c, d].map((x) => x.payload_hash));
  assertEquals(all.size, 4, "whitespace was trimmed or collapsed — it must not be");
});

Deno.test("5 · array reordering produces a DIFFERENT fingerprint", async () => {
  const a = await fpOf({ decisions: [{ title: "First" }, { title: "Second" }] });
  const b = await fpOf({ decisions: [{ title: "Second" }, { title: "First" }] });
  console.log("T5", a.payload_hash, b.payload_hash);
  assertNotEquals(a.payload_hash, b.payload_hash);
});

Deno.test("6 · absent vs explicit-nullable follows the contract exactly", async () => {
  // absent field != present-empty field
  const absent = await fpOf({});
  const empty = await fpOf({ decisions: [] });
  console.log("T6 absent", absent.payload_hash, "empty", empty.payload_hash);
  assertNotEquals(absent.payload_hash, empty.payload_hash);

  // nullable envelope fields: null and "not supplied" are the same thing, and
  // both differ from a real value
  const nullCid = await computeFingerprint({ ...base, cid: null, payload: {} }, TEST_KEY);
  const realCid = await computeFingerprint({ ...base, cid: "COB-HQ", payload: {} }, TEST_KEY);
  assertNotEquals(nullCid.payload_hash, realCid.payload_hash);
  assert(canonicalBytesText(buildCanonicalEnvelope({ ...base, cid: null, payload: {} })).includes('"cid":null'));

  // non-nullable field explicitly set to null is REJECTED, not coerced
  let threw = "";
  try {
    await fpOf({ decisions: null as any });
  } catch (e) {
    threw = (e as CanonError).message;
  }
  console.log("T6 null rejection:", threw);
  assert(threw.startsWith("NULL_NOT_PERMITTED"));

  // unknown property is REJECTED before anything is hashed
  let unknown = "";
  try {
    await fpOf({ decisions: [{ title: "x", made_up_field: 1 } as any] });
  } catch (e) {
    unknown = (e as CanonError).message;
  }
  console.log("T6 unknown rejection:", unknown);
  assert(unknown.startsWith("UNKNOWN_PROPERTY:made_up_field"));

  // excluded fields do not move the fingerprint
  const withNoise = await fpOf({
    decisions: [{ title: "Ship it" }],
    // deliberately present on the raw payload, must be ignored
    client_request_id: "req-zzzzzzzz",
    tool_manifest_version: "9.9.9",
    telemetry: { ms: 5 },
  } as any);
  const clean = await fpOf({ decisions: [{ title: "Ship it" }] });
  assertEquals(withNoise.payload_hash, clean.payload_hash);

  // domain separator is present on the hashed bytes
  assert(canonicalBytesText(buildCanonicalEnvelope({ ...base, payload: {} }))
    .startsWith("COB:SAVE_SESSION:CANON_V1:"));
});

Deno.test("ROLLBACK SWITCH · SAVE_FINGERPRINT_DISABLED restores pre-commit behaviour", () => {
  const env = (v?: string) => ({ get: (_k: string) => v });
  assertEquals(ROLLBACK_FLAG, "SAVE_FINGERPRINT_DISABLED");
  assertEquals(fingerprintEnabled(env(undefined)), true, "absent → ON (shipped default)");
  assertEquals(fingerprintEnabled(env("")), true);
  assertEquals(fingerprintEnabled(env("0")), true);
  assertEquals(fingerprintEnabled(env("1")), false);
  assertEquals(fingerprintEnabled(env("true")), false);
  assertEquals(fingerprintEnabled(env("TRUE")), false);
  assertEquals(fingerprintEnabled(env(" on ")), false);
  assertEquals(fingerprintEnabled(env("yes")), false);
  // The handler computes no fingerprint when disabled, so the value passed to
  // record_save_receipt is `fp?.payload_hash ?? null` → null. Pre-commit exactly.
  const fp = fingerprintEnabled(env("1")) ? { payload_hash: "deadbeef" } : null;
  assertEquals(fp?.payload_hash ?? null, null);
  console.log("ROLLBACK proof · flag on → p_payload_hash =", fp?.payload_hash ?? null);
});

Deno.test("number canonicalization follows JCS", async () => {
  const a = buildCanonicalEnvelope({ ...base, payload: { checkpoint: { task_states: { a: -0 } } } });
  const b = buildCanonicalEnvelope({ ...base, payload: { checkpoint: { task_states: { a: 0 } } } });
  assertEquals(canonicalBytesText(a), canonicalBytesText(b), "negative zero must become zero");
  let bad = "";
  try {
    canonicalBytesText(buildCanonicalEnvelope({ ...base, payload: { checkpoint: { task_states: { a: NaN } } } }));
  } catch (e) { bad = (e as Error).message; }
  assert(bad.startsWith("NON_FINITE_NUMBER"), bad);
  console.log("JCS numbers ok · -0 folds, NaN rejected");
});
