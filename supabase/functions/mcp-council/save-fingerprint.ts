// supabase/functions/mcp-council/save-fingerprint.ts
//
// Lane A Commit 5 · keyed idempotency fingerprint over a canonical save envelope.
//
// Why keyed and not a bare digest: payload_hash is stored in Postgres and is
// readable by anyone with database access. A plain SHA-256 over short-form
// content (a one-line decision, a known client name) turns that column into a
// content oracle — a guess can be confirmed by recomputation. HMAC keyed on
// SAVE_RECOVERY_MASTER_KEY_V1 removes the oracle: without the key a guess
// cannot be checked. The key never leaves the edge runtime.
//
// The fingerprint covers SEMANTIC SAVE INTENT ONLY. Transport, identity
// mechanics, build numbers, telemetry and the client_request_id itself are
// excluded — they change between two honest retries of the same intent, and a
// fingerprint that moves under an honest retry converts a recoverable retry
// into a hard failure. That is the whole risk of this commit.

export const CANONICALIZATION_VERSION = "COB-SAVE-CANON-v1";
export const PAYLOAD_HASH_ALGORITHM = "HMAC-SHA-256";
export const PAYLOAD_HASH_KEY_VERSION = "V1";
export const DOMAIN_SEPARATOR = "COB:SAVE_SESSION:CANON_V1:";

/**
 * ROLLBACK SWITCH.
 *
 * Set this environment variable to "1" / "true" / "on" to revert to the
 * pre-commit behaviour: p_payload_hash goes to record_save_receipt as null and
 * the conflict path returns to being structurally unreachable. No redeploy, no
 * code change. Absent variable = fingerprint ON, which is the shipped default.
 *
 * This function READS the variable. It never sets it.
 */
export const ROLLBACK_FLAG = "SAVE_FINGERPRINT_DISABLED";

export function fingerprintEnabled(env?: { get(k: string): string | undefined }): boolean {
  let raw: string | undefined;
  try {
    raw = (env ?? Deno.env).get(ROLLBACK_FLAG);
  } catch {
    raw = undefined; // no env read permission → fail to the shipped default
  }
  const v = (raw ?? "").trim().toLowerCase();
  return !(v === "1" || v === "true" || v === "on" || v === "yes");
}

// ── errors ────────────────────────────────────────────────────────────────

export class CanonError extends Error {
  readonly path: string;
  constructor(code: string, path: string) {
    super(`${code} at ${path || "<root>"}`);
    this.name = "CanonError";
    this.path = path;
  }
}

// ── published schema of the canonical envelope ────────────────────────────
//
// Mirrors RITUAL_SAVE_PROPS exactly (Commit 1 parity), minus the fields that
// are deliberately excluded from the fingerprint.

type FieldSpec =
  | { kind: "string"; nullable?: boolean }
  | { kind: "array"; item: ObjectSpec }
  | { kind: "object"; spec: ObjectSpec };

type ObjectSpec = {
  props: Record<string, "string" | "array" | "object" | "any">;
  required?: string[];
};

const DECISION: ObjectSpec = {
  props: {
    title: "string", rationale: "string", decision_owner: "string",
    execution_owner: "string", reversible: "string", decision_md: "string",
    authority_tier: "string", client_ref: "string",
  },
  required: ["title"],
};

const OPEN_LOOP: ObjectSpec = {
  props: { title: "string", trigger: "string", owner: "string", state: "string" },
  required: ["title"],
};

const SIGNAL: ObjectSpec = {
  props: {
    title: "string", description: "string", implication: "string",
    type: "string", status: "string", pattern: "string", client_ref: "string",
  },
  required: ["title"],
};

const MEMORY: ObjectSpec = {
  props: { title: "string", body_md: "string", category: "string" },
  required: ["title", "body_md"],
};

const RULE: ObjectSpec = {
  props: { text: "string", scope: "string" },
  required: ["text", "scope"],
};

const CHECKPOINT: ObjectSpec = {
  props: {
    open_loops: "array", decisions_pending: "array", deferrals: "array",
    principal_state: "string", financial_residue: "string",
    task_states: "object", staleness_flags: "array",
  },
};

/**
 * Field order here is irrelevant to the output (keys are sorted), but the SET
 * is the contract: exactly these fields are fingerprinted.
 *
 * `cid` and `session_id` are nullable and INCLUDED on purpose. Retrying the
 * same content after the identity or the session changed is not the same save
 * intent, and must be forced to carry a new client_request_id.
 */
export const ENVELOPE_SCHEMA: Record<string, FieldSpec> = {
  ritual: { kind: "string" },
  schema_version: { kind: "string" },
  cid: { kind: "string", nullable: true },
  session_id: { kind: "string", nullable: true },
  decisions: { kind: "array", item: DECISION },
  open_loops: { kind: "array", item: OPEN_LOOP },
  signals: { kind: "array", item: SIGNAL },
  memory: { kind: "array", item: MEMORY },
  rules_captured: { kind: "array", item: RULE },
  checkpoint: { kind: "object", spec: CHECKPOINT },
};

export const ENVELOPE_FIELDS = Object.keys(ENVELOPE_SCHEMA);

/** Fields that carry content but are NEVER fingerprinted. Documented, not guessed. */
export const EXCLUDED_FROM_FINGERPRINT = [
  "client_request_id", "access_token", "authorization", "token", "issuer",
  "provider_subject", "surface", "tool_version", "build_id",
  "client_manifest_version", "manifest_version", "tool_manifest_version",
  "telemetry", "request_id", "correlation_id", "identity", "receipt_id",
  "save_id", "created_at", "updated_at", "timestamp",
] as const;

// ── primitive normalizers ─────────────────────────────────────────────────

/** (b)(c)(d): UTF-8 without BOM, Unicode NFC, CRLF and CR folded to LF. */
export function normalizeString(s: string): string {
  return s
    .replace(/^\uFEFF/, "")
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

/** (j): JSON Canonicalization Scheme number form. */
export function canonicalNumber(n: number, path: string): string {
  if (!Number.isFinite(n)) throw new CanonError("NON_FINITE_NUMBER", path);
  if (Object.is(n, -0)) return "0"; // negative zero becomes zero
  // ECMAScript Number::toString is the JCS reference serialization: it never
  // emits redundant exponents or leading zeros.
  return String(n);
}

/** (f): lexicographic by Unicode code point, not by UTF-16 code unit. */
export function compareCodePoints(a: string, b: string): number {
  const ca = Array.from(a);
  const cb = Array.from(b);
  const n = Math.min(ca.length, cb.length);
  for (let i = 0; i < n; i++) {
    const x = ca[i].codePointAt(0)!;
    const y = cb[i].codePointAt(0)!;
    if (x !== y) return x < y ? -1 : 1;
  }
  return ca.length === cb.length ? 0 : ca.length < cb.length ? -1 : 1;
}

/**
 * Serialize an already-validated value.
 * (e) whitespace inside strings is preserved verbatim — never trimmed, never
 * collapsed. (g) array order is preserved.
 */
function serialize(v: unknown, path: string): string {
  if (v === null) return "null";
  const t = typeof v;
  if (t === "string") return JSON.stringify(normalizeString(v as string));
  if (t === "number") return canonicalNumber(v as number, path);
  if (t === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) {
    return "[" + v.map((e, i) => serialize(e, `${path}[${i}]`)).join(",") + "]";
  }
  if (t === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort(compareCodePoints);
    return "{" + keys
      .map((k) => `${JSON.stringify(normalizeString(k))}:${serialize(o[k], `${path}.${k}`)}`)
      .join(",") + "}";
  }
  throw new CanonError("UNSERIALIZABLE_VALUE", path);
}

// ── (a) schema validation · runs FIRST, rejects unknown properties ────────

function validateObject(o: unknown, spec: ObjectSpec, path: string): void {
  if (o === null) throw new CanonError("NULL_NOT_PERMITTED", path);
  if (typeof o !== "object" || Array.isArray(o)) throw new CanonError("EXPECTED_OBJECT", path);
  const rec = o as Record<string, unknown>;
  for (const k of Object.keys(rec)) {
    if (rec[k] === undefined) continue;
    const declared = spec.props[k];
    if (!declared) throw new CanonError(`UNKNOWN_PROPERTY:${k}`, path);
    const v = rec[k];
    if (v === null) throw new CanonError("NULL_NOT_PERMITTED", `${path}.${k}`);
    if (declared === "string" && typeof v !== "string") {
      throw new CanonError("EXPECTED_STRING", `${path}.${k}`);
    }
    if (declared === "array" && !Array.isArray(v)) {
      throw new CanonError("EXPECTED_ARRAY", `${path}.${k}`);
    }
    if (declared === "object" && (typeof v !== "object" || Array.isArray(v))) {
      throw new CanonError("EXPECTED_OBJECT", `${path}.${k}`);
    }
  }
  for (const r of spec.required ?? []) {
    if (rec[r] === undefined) throw new CanonError(`MISSING_REQUIRED:${r}`, path);
  }
}

/**
 * Build the canonical envelope from a raw save payload.
 *
 * (h) absent stays absent: a key the client did not send is not synthesized,
 * so `{}` and `{decisions: []}` are DIFFERENT saves with different
 * fingerprints. (i) null is rejected unless the field is declared nullable.
 */
export function buildCanonicalEnvelope(input: {
  ritual: string;
  schema_version: string;
  cid: string | null;
  session_id: string | null;
  payload: Record<string, unknown>;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ritual: input.ritual,
    schema_version: input.schema_version,
    cid: input.cid ?? null,
    session_id: input.session_id ?? null,
  };

  const p = input.payload ?? {};
  for (const [field, spec] of Object.entries(ENVELOPE_SCHEMA)) {
    if (field === "ritual" || field === "schema_version" || field === "cid" || field === "session_id") continue;
    const v = (p as any)[field];
    if (v === undefined) continue; // absent stays absent
    if (v === null) throw new CanonError("NULL_NOT_PERMITTED", field);

    if (spec.kind === "array") {
      if (!Array.isArray(v)) throw new CanonError("EXPECTED_ARRAY", field);
      v.forEach((item, i) => validateObject(item, spec.item, `${field}[${i}]`));
      out[field] = v;
    } else if (spec.kind === "object") {
      validateObject(v, spec.spec, field);
      out[field] = v;
    }
  }
  return out;
}

/** Domain-separated canonical bytes. (l) */
export function canonicalBytesText(envelope: Record<string, unknown>): string {
  return DOMAIN_SEPARATOR + serialize(envelope, "");
}

// ── keyed fingerprint ─────────────────────────────────────────────────────

const enc = new TextEncoder();

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Same secret as the recovery envelope, proven present and 32 bytes by op-1. */
async function hmacKey(rawB64?: string): Promise<CryptoKey> {
  const raw = (rawB64 ?? Deno.env.get("SAVE_RECOVERY_MASTER_KEY_V1") ?? "").trim();
  if (!raw) throw new Error("fingerprint_key_missing");
  let bytes: Uint8Array;
  try {
    bytes = b64ToBytes(raw);
  } catch {
    throw new Error("fingerprint_key_not_base64");
  }
  if (bytes.byteLength !== 32) throw new Error("fingerprint_key_bad_length");
  return await crypto.subtle.importKey(
    "raw",
    bytes.slice().buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export type Fingerprint = {
  payload_hash: string;
  payload_hash_algorithm: string;
  payload_hash_key_version: string;
  canonicalization_version: string;
  canonical_bytes: number;
};

export async function computeFingerprint(
  input: {
    ritual: string;
    schema_version: string;
    cid: string | null;
    session_id: string | null;
    payload: Record<string, unknown>;
  },
  keyB64?: string,
): Promise<Fingerprint> {
  const envelope = buildCanonicalEnvelope(input);
  const text = canonicalBytesText(envelope);
  const bytes = enc.encode(text);
  const sig = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(keyB64),
    bytes.slice().buffer as ArrayBuffer,
  );
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return {
    payload_hash: hex,
    payload_hash_algorithm: PAYLOAD_HASH_ALGORITHM,
    payload_hash_key_version: PAYLOAD_HASH_KEY_VERSION,
    canonicalization_version: CANONICALIZATION_VERSION,
    canonical_bytes: bytes.byteLength,
  };
}
