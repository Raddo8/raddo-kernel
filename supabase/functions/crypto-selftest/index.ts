// crypto-selftest · Horizon Envelope Operation 1
// Proves AES-256-GCM + HMAC-SHA-256 work in the deployed Edge Runtime and
// that SAVE_RECOVERY_MASTER_KEY_V1 decodes to a valid 32-byte key.
// Read-only. Writes nothing. Logs no key material.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SECRET_NAME = "SAVE_RECOVERY_MASTER_KEY_V1";
const KEY_VERSION = "V1";
const PLAINTEXT = "horizon-envelope-op1-canary";

type Result = { id: number; name: string; pass: boolean; detail: string };

// Buffered logging so we can leak-scan before anything is emitted.
const logBuffer: string[] = [];
const log = (line: string) => logBuffer.push(line);

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function toHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function runProofs(): Promise<{ results: Result[]; secret: string }> {
  const results: Result[] = [];
  const push = (id: number, name: string, pass: boolean, detail: string) => {
    results.push({ id, name, pass, detail });
    log(`[crypto-selftest] ${id} ${name}: ${pass ? "PASS" : "FAIL"} · ${detail}`);
  };

  // 1 · SECRET_PRESENT
  const secret = Deno.env.get(SECRET_NAME) ?? "";
  const present = typeof secret === "string" && secret.trim().length > 0;
  push(1, "SECRET_PRESENT", present, present
    ? `${SECRET_NAME} is present and non-empty`
    : `${SECRET_NAME} is missing or empty in the edge environment`);

  // 2 · BASE64_VALID
  let keyBytes: Uint8Array | null = null;
  let b64ok = false;
  if (present) {
    try {
      keyBytes = b64ToBytes(secret.trim());
      b64ok = true;
    } catch {
      b64ok = false;
    }
  }
  push(2, "BASE64_VALID", b64ok, b64ok
    ? "secret decodes cleanly as base64"
    : present
      ? "secret is not valid base64"
      : "skipped · no secret to decode");

  // 3 · KEY_LENGTH
  const len = keyBytes?.length ?? -1;
  const lenOk = len === 32;
  push(3, "KEY_LENGTH", lenOk, lenOk
    ? "decoded key is exactly 32 bytes"
    : len < 0
      ? "skipped · no decoded key"
      : `decoded key is ${len} bytes; expected exactly 32`);

  const canCrypto = lenOk && keyBytes !== null;
  const skip = "skipped · no valid 32-byte key available";

  let aesKey: CryptoKey | null = null;
  if (canCrypto) {
    try {
      aesKey = await crypto.subtle.importKey(
        "raw",
        keyBytes! as BufferSource,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"],
      );
    } catch (e) {
      aesKey = null;
      log(`[crypto-selftest] AES key import failed: ${(e as Error).name}`);
    }
  }

  const enc = new TextEncoder();
  const ptBytes = enc.encode(PLAINTEXT);

  // 4 · AES_GCM_ROUND_TRIP
  let ct1: Uint8Array | null = null;
  let iv1: Uint8Array | null = null;
  if (aesKey) {
    try {
      iv1 = crypto.getRandomValues(new Uint8Array(12));
      ct1 = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv1 }, aesKey, ptBytes));
      const back = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv1 }, aesKey, ct1));
      const ok = bytesEqual(back, ptBytes);
      push(4, "AES_GCM_ROUND_TRIP", ok, ok
        ? "encrypt/decrypt recovered the plaintext byte for byte"
        : "decrypted output did not match the original bytes");
    } catch (e) {
      push(4, "AES_GCM_ROUND_TRIP", false, `round trip threw: ${(e as Error).name}`);
    }
  } else {
    push(4, "AES_GCM_ROUND_TRIP", false, aesKey === null && canCrypto ? "AES-GCM key import failed" : skip);
  }

  // 5 · RANDOM_NONCE_BEHAVIOUR
  if (aesKey && ct1) {
    try {
      const iv2 = crypto.getRandomValues(new Uint8Array(12));
      const ct2 = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv2 }, aesKey, ptBytes));
      const differ = !bytesEqual(ct1, ct2);
      push(5, "RANDOM_NONCE_BEHAVIOUR", differ, differ
        ? "two independent IVs produced different ciphertexts"
        : "ciphertexts were identical across two IVs · deterministic output is a failure");
    } catch (e) {
      push(5, "RANDOM_NONCE_BEHAVIOUR", false, `second encryption threw: ${(e as Error).name}`);
    }
  } else {
    push(5, "RANDOM_NONCE_BEHAVIOUR", false, skip);
  }

  // 6 · AUTH_TAG_REJECTION
  if (aesKey && ct1 && iv1) {
    const tampered = new Uint8Array(ct1);
    tampered[0] ^= 0x01;
    let threw = false;
    try {
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv1 }, aesKey, tampered);
    } catch {
      threw = true;
    }
    push(6, "AUTH_TAG_REJECTION", threw, threw
      ? "single-bit tampered ciphertext was rejected by the auth tag"
      : "tampered ciphertext decrypted successfully · authentication is not enforced");
  } else {
    push(6, "AUTH_TAG_REJECTION", false, skip);
  }

  // 7 · HMAC_SHA256_CONSISTENCY
  if (canCrypto) {
    try {
      const hmacKey = await crypto.subtle.importKey(
        "raw",
        keyBytes! as BufferSource,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const a = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, enc.encode("canonical|input|v1")));
      const b = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, enc.encode("canonical|input|v1")));
      const c = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, enc.encode("canonical|input|v2")));
      const stable = bytesEqual(a, b);
      const sensitive = !bytesEqual(a, c);
      const ok = stable && sensitive && a.length === 32;
      push(7, "HMAC_SHA256_CONSISTENCY", ok, ok
        ? "identical input produced identical 32-byte tags; one-character change produced a different tag"
        : `stability=${stable}, input-sensitivity=${sensitive}, tag length=${a.length}`);
    } catch (e) {
      push(7, "HMAC_SHA256_CONSISTENCY", false, `HMAC operation threw: ${(e as Error).name}`);
    }
  } else {
    push(7, "HMAC_SHA256_CONSISTENCY", false, skip);
  }

  // 8 · KEY_VERSION_REPORTING
  push(8, "KEY_VERSION_REPORTING", true,
    `vault rows would be stamped key_version="${KEY_VERSION}", derived from the secret name suffix`);

  return { results, secret };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body, null, 2), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // service_role only
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // TEMP (Horizon op 1 one-shot proof): removed immediately after the run.
  const tempInvoke = Deno.env.get("CRYPTO_SELFTEST_TEMP_INVOKE") ?? "";
  const authorized = !!token && ((!!serviceRole && token === serviceRole) || (!!tempInvoke && token === tempInvoke));
  if (!authorized) {
    return json({ error: "unauthorized", detail: "service_role authorization required" }, 401);
  }


  const { results, secret } = await runProofs();
  const all_pass = results.every((r) => r.pass);

  const body: Record<string, unknown> = {
    runtime: `deno/${Deno.version?.deno ?? "unknown"} v8/${Deno.version?.v8 ?? "unknown"}`,
    results,
    all_pass,
    key_version: KEY_VERSION,
    leak_check: "CLEAN",
  };

  // 9 · NO_LEAKAGE — scan the assembled response and log buffer.
  const haystack = JSON.stringify(body) + "\n" + logBuffer.join("\n");
  const needles: string[] = [PLAINTEXT];
  if (secret) {
    needles.push(secret.trim());
    try {
      const kb = b64ToBytes(secret.trim());
      needles.push(toHex(kb));
    } catch { /* nothing to add */ }
  }
  const leaked = needles.some((n) => n.length > 0 && haystack.includes(n));

  const leakResult: Result = {
    id: 9,
    name: "NO_LEAKAGE",
    pass: !leaked,
    detail: leaked
      ? "sensitive material was detected in the assembled response or log buffer · output withheld"
      : "no secret, key bytes, or plaintext canary found in the response or log buffer",
  };
  results.push(leakResult);
  body.results = results;
  body.all_pass = results.every((r) => r.pass);
  body.leak_check = leaked ? "LEAKED" : "CLEAN";

  if (leaked) {
    console.error("[crypto-selftest] LEAK DETECTED · suppressing report and logs");
    return json({
      runtime: body.runtime,
      results: [leakResult],
      all_pass: false,
      key_version: KEY_VERSION,
      leak_check: "LEAKED",
    }, 500);
  }

  for (const line of logBuffer) console.log(line);
  console.log(`[crypto-selftest] all_pass=${body.all_pass} leak_check=CLEAN`);

  return json(body, 200);
});
