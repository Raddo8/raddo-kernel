// supabase/functions/mcp-council/save-recovery.ts
//
// Lane A Commit 3 · durable attempt lifecycle with envelope-encrypted recovery.
//
// Why this exists: save_session used to die at session validation or CID
// resolution before anything server-side recorded that a save was attempted.
// A lost save could not be proven lost, let alone recovered. Every accepted
// save payload now leaves a durable, fingerprinted, encrypted trace BEFORE
// the first thing that can reject it.
//
// PLAINTEXT NEVER TOUCHES POSTGRES. The payload is encrypted here with a
// per-attempt DEK; the DEK is wrapped with SAVE_RECOVERY_MASTER_KEY_V1, which
// exists only as an edge secret. No database function can decrypt this.

export const MAX_RECOVERY_PAYLOAD_BYTES = 262144;
export const CANONICALIZATION_VERSION = "v1";
export const PAYLOAD_HASH_ALGORITHM = "SHA-256";
export const MASTER_KEY_VERSION = "V1";
export const RECOVERY_ALG = "AES-256-GCM";

/** Retention windows, applied at write time and re-stamped on completion. */
export const RETENTION_MS = {
  completed: 15 * 60 * 1000, // verified save: 15 minutes
  failed: 72 * 60 * 60 * 1000, // failed or abandoned: 72 hours
} as const;

// ── canonicalization ──────────────────────────────────────────────────────
/** Deterministic JSON: object keys sorted recursively, undefined dropped. */
export function canonicalize(value: unknown): string {
  const walk = (v: any): any => {
    if (v === null || typeof v !== "object") return v === undefined ? null : v;
    if (Array.isArray(v)) return v.map(walk);
    const out: Record<string, any> = {};
    for (const k of Object.keys(v).sort()) {
      if (v[k] === undefined) continue;
      out[k] = walk(v[k]);
    }
    return out;
  };
  return JSON.stringify(walk(value));
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── master key ────────────────────────────────────────────────────────────
/** Fails loudly. No substitute key is ever generated, no plaintext fallback. */
async function masterKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("SAVE_RECOVERY_MASTER_KEY_V1") ?? "";
  if (!raw) throw new Error("recovery_master_key_missing");
  let bytes: Uint8Array;
  try {
    bytes = unb64(raw.trim());
  } catch {
    throw new Error("recovery_master_key_not_base64");
  }
  if (bytes.length !== 32) throw new Error("recovery_master_key_bad_length");
  return await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export type Envelope = {
  ciphertext_b64: string;
  iv_b64: string;
  wrapped_dek_b64: string;
  wrap_iv_b64: string;
  aad: string;
  alg: string;
  master_key_version: string;
  plaintext_bytes: number;
};

/** Envelope-encrypt one canonical payload. Random DEK, random IVs, AAD bound. */
export async function envelopeEncrypt(canonical: string, aad: string): Promise<Envelope> {
  const plaintext = enc.encode(canonical);
  if (plaintext.byteLength < 1 || plaintext.byteLength > MAX_RECOVERY_PAYLOAD_BYTES) {
    throw new Error("recovery_payload_size_out_of_bounds");
  }
  const dek = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aadBytes = enc.encode(aad);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aadBytes },
    dek,
    plaintext,
  );

  const dekRaw = await crypto.subtle.exportKey("raw", dek);
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: wrapIv, additionalData: aadBytes },
    await masterKey(),
    dekRaw,
  );

  return {
    ciphertext_b64: b64(ciphertext),
    iv_b64: b64(iv),
    wrapped_dek_b64: b64(wrapped),
    wrap_iv_b64: b64(wrapIv),
    aad,
    alg: RECOVERY_ALG,
    master_key_version: MASTER_KEY_VERSION,
    plaintext_bytes: plaintext.byteLength,
  };
}

/** Inverse of envelopeEncrypt. Used for round-trip proof and recovery. */
export async function envelopeDecrypt(e: {
  ciphertext_b64: string;
  iv_b64: string;
  wrapped_dek_b64: string;
  wrap_iv_b64: string;
  aad: string;
}): Promise<string> {
  const aadBytes = enc.encode(e.aad);
  const dekRaw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(e.wrap_iv_b64), additionalData: aadBytes },
    await masterKey(),
    unb64(e.wrapped_dek_b64),
  );
  const dek = await crypto.subtle.importKey("raw", dekRaw, { name: "AES-GCM" }, false, [
    "decrypt",
  ]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(e.iv_b64), additionalData: aadBytes },
    dek,
    unb64(e.ciphertext_b64),
  );
  return dec.decode(plaintext);
}

// ── layer counts (metadata only, never content) ───────────────────────────
export function requestedLayerCounts(payload: any): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(payload ?? {})) {
    if (Array.isArray(v)) out[k] = v.length;
  }
  if (payload?.checkpoint && typeof payload.checkpoint === "object") {
    out.checkpoint = Object.keys(payload.checkpoint).length > 0 ? 1 : 0;
  }
  return out;
}

export type AttemptHandle = {
  save_attempt_id: string | null;
  payload_hash: string;
  idempotent: boolean;
  vault_id?: string | null;
  error?: string | null;
};

/**
 * Canonicalize -> fingerprint -> envelope-encrypt -> persist attempt + vault.
 * Best-effort by design: recovery must never be the reason a save fails, but
 * any failure here is reported so it can be seen in the receipt telemetry.
 */
export async function openDurableAttempt(admin: any, input: {
  client_request_id: string;
  payload: any;
  cid: string | null;
  session_id: string | null;
  surface: string;
  tool_version: string;
  ritual: string;
  schema_version: string;
  principal_id: string | null;
  external_identity_id: string | null;
}): Promise<AttemptHandle> {
  const canonical = canonicalize(input.payload ?? {});
  const payload_hash = await sha256Hex(canonical);
  try {
    const aad = `${input.client_request_id}|${input.cid ?? ""}|${payload_hash}`;
    const env = await envelopeEncrypt(canonical, aad);
    const expires = new Date(Date.now() + RETENTION_MS.failed).toISOString();

    const { data, error } = await admin.rpc("open_save_attempt_v2", {
      p_client_request_id: input.client_request_id,
      p_payload_hash: payload_hash,
      p_requested_layer_counts: requestedLayerCounts(input.payload),
      p_cid: input.cid,
      p_session_id: input.session_id,
      p_surface: input.surface,
      p_tool_version: input.tool_version,
      p_ritual: input.ritual,
      p_schema_version: input.schema_version,
      p_hash_algorithm: PAYLOAD_HASH_ALGORITHM,
      p_canonicalization_version: CANONICALIZATION_VERSION,
      p_principal_id: input.principal_id,
      p_external_identity_id: input.external_identity_id,
      p_ciphertext_b64: env.ciphertext_b64,
      p_iv_b64: env.iv_b64,
      p_wrapped_dek_b64: env.wrapped_dek_b64,
      p_wrap_iv_b64: env.wrap_iv_b64,
      p_aad: env.aad,
      p_alg: env.alg,
      p_master_key_version: env.master_key_version,
      p_plaintext_bytes: env.plaintext_bytes,
      p_recovery_expires_at: expires,
    });
    if (error) return { save_attempt_id: null, payload_hash, idempotent: false, error: error.message };
    return {
      save_attempt_id: data?.save_attempt_id ?? null,
      vault_id: data?.vault_id ?? null,
      payload_hash,
      idempotent: Boolean(data?.idempotent),
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { save_attempt_id: null, payload_hash, idempotent: false, error: msg };
  }
}

export type AttemptStatus = "COMPLETED" | "ABANDONED" | "FAILED" | "PARTIAL";
export type FailureStage =
  | "SESSION_VALIDATION"
  | "CID_RESOLUTION"
  | "LEG_EXCEPTION"
  | "LAYER_WRITE"
  | "RECEIPT"
  | null;

/** Stamps the terminal state. Never throws — telemetry must not break a save. */
export async function stampAttempt(admin: any, attemptId: string | null, input: {
  status: AttemptStatus;
  failure_stage?: FailureStage;
  save_id?: string | null;
  cid?: string | null;
}): Promise<void> {
  if (!attemptId) return;
  const ms = input.status === "COMPLETED" ? RETENTION_MS.completed : RETENTION_MS.failed;
  try {
    await admin.rpc("stamp_save_attempt", {
      p_save_attempt_id: attemptId,
      p_status: input.status,
      p_failure_stage: input.failure_stage ?? null,
      p_save_id: input.save_id ?? null,
      p_cid: input.cid ?? null,
      p_recovery_expires_at: new Date(Date.now() + ms).toISOString(),
    });
  } catch { /* best-effort */ }
}
