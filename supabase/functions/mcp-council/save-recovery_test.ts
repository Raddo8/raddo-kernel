// Envelope round-trip and canonicalization proofs for Lane A Commit 3.
// Uses a locally generated 32-byte key when the real master key is not in the
// local test env — the deployed-key proof lives in crypto-selftest.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canonicalize,
  envelopeEncrypt,
  envelopeDecrypt,
  requestedLayerCounts,
  sha256Hex,
  MAX_RECOVERY_PAYLOAD_BYTES,
} from "./save-recovery.ts";

function ensureKey() {
  if (!Deno.env.get("SAVE_RECOVERY_MASTER_KEY_V1")) {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    Deno.env.set("SAVE_RECOVERY_MASTER_KEY_V1", btoa(String.fromCharCode(...raw)));
  }
}

Deno.test("canonicalize is key-order stable", () => {
  assertEquals(canonicalize({ b: 1, a: [{ z: 1, y: 2 }] }), canonicalize({ a: [{ y: 2, z: 1 }], b: 1 }));
});

Deno.test("envelope round trip returns the exact original payload", async () => {
  ensureKey();
  const payload = { session_id: "s-1", decisions: [{ title: "Ship it", decision_md: "yes" }] };
  const canonical = canonicalize(payload);
  const aad = "req-12345678||hash";
  const env = await envelopeEncrypt(canonical, aad);
  assert(env.wrapped_dek_b64.length > 0);
  assertEquals(env.alg, "AES-256-GCM");
  const back = await envelopeDecrypt(env);
  assertEquals(back, canonical);
  assertEquals(JSON.parse(back), JSON.parse(canonical));
});

Deno.test("ciphertext does not contain plaintext", async () => {
  ensureKey();
  const canonical = canonicalize({ secret_marker: "PLAINTEXT_CANARY_9182" });
  const env = await envelopeEncrypt(canonical, "aad");
  assert(!atob(env.ciphertext_b64).includes("PLAINTEXT_CANARY_9182"));
});

Deno.test("wrong aad fails to unwrap", async () => {
  ensureKey();
  const env = await envelopeEncrypt(canonicalize({ a: 1 }), "aad-a");
  let threw = false;
  try { await envelopeDecrypt({ ...env, aad: "aad-b" }); } catch { threw = true; }
  assert(threw);
});

Deno.test("oversize payload is refused", async () => {
  ensureKey();
  const big = "x".repeat(MAX_RECOVERY_PAYLOAD_BYTES + 10);
  let threw = false;
  try { await envelopeEncrypt(big, "aad"); } catch { threw = true; }
  assert(threw);
});

Deno.test("layer counts are metadata only", () => {
  const c = requestedLayerCounts({ decisions: [1, 2], signals: [], checkpoint: { x: 1 } });
  assertEquals(c, { decisions: 2, signals: 0, checkpoint: 1 });
});

Deno.test("fingerprint is deterministic", async () => {
  assertEquals(await sha256Hex("abc"), await sha256Hex("abc"));
});
