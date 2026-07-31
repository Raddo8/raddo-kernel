// supabase/functions/mcp-council/degraded-envelope.ts
//
// Lane A Commit 4 · one stable shape for every degraded or failed save.
//
// Why this exists: a client COB that receives a raw JSON-RPC error has no
// contract telling it whether to retry, re-author, or escalate — so it does
// the worst available thing, which is continue. Every non-success save now
// returns the SAME keys, every time, null where not applicable, with
// isError:false, because these are outcomes and not protocol failures.
//
// The single most important rule in this file: `content_status` is derived
// from an actual read of the vault row. It is never assumed from the fact
// that Commit 3's recovery write was attempted.

/** The only payload fields a principal is ever handed back. */
export const ACCEPTED_SAVE_FIELDS = [
  "decisions",
  "open_loops",
  "signals",
  "memory",
  "rules_captured",
  "checkpoint",
] as const;

export type ContentStatus = "RECOVERY_HELD" | "NOT_HELD";

export type DegradedReason =
  | "session_not_found"
  | "identity_binding_required"
  | "internal_save_failure";

export type DegradedEnvelope = {
  outcome: "degraded" | "failed";
  reason: DegradedReason;
  retryable: boolean;
  save_attempt_id: string | null;
  client_request_id: string | null;
  payload_hash: string | null;
  receipt_id: string | null;
  overall_status: string | null;
  failure_stage: string | null;
  content_status: ContentStatus;
  recovery_expires_at: string | null;
  layers: unknown[] | null;
  returned_payload: Record<string, unknown>;
  next_action: string | null;
  note: string;
};

/**
 * Copy ONLY the accepted save fields off the raw tool args. Anything else —
 * tokens, telemetry, transport metadata, manifest fields, identity, unknown
 * properties — is dropped by construction rather than by blocklist.
 */
export function returnedPayload(args: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!args || typeof args !== "object") return out;
  for (const k of ACCEPTED_SAVE_FIELDS) {
    if (args[k] !== undefined && args[k] !== null) out[k] = args[k];
  }
  return out;
}

/**
 * Ask the database whether recoverable content actually exists.
 *
 * RECOVERY_HELD requires: a vault row for this attempt, a non-null
 * wrapped_dek, and no erasure. Anything else — no attempt id, no row, a
 * failed recovery write, a read error — reads NOT_HELD. We never claim to
 * hold content we cannot prove we hold.
 */
export async function resolveContentStatus(
  admin: any,
  saveAttemptId: string | null,
): Promise<{ content_status: ContentStatus; recovery_expires_at: string | null }> {
  const miss = { content_status: "NOT_HELD" as ContentStatus, recovery_expires_at: null };
  if (!admin || !saveAttemptId) return miss;
  try {
    const { data, error } = await admin
      .from("save_recovery_vault")
      .select("wrapped_dek, expires_at, erased_at")
      .eq("save_attempt_id", saveAttemptId)
      .maybeSingle();
    if (error || !data) return miss;
    if (!data.wrapped_dek || data.erased_at) return miss;
    return { content_status: "RECOVERY_HELD", recovery_expires_at: data.expires_at ?? null };
  } catch {
    return miss;
  }
}

const NOTES: Record<DegradedReason, string> = {
  session_not_found:
    "I could not connect this save to an active session, so no client records were written. I preserved a short-lived recovery copy and returned your content here. Start a new session, then submit it again with a new request id.",
  identity_binding_required:
    "I could not connect this save to an authorized workspace, so no client records were written. I preserved a short-lived recovery copy and returned your content here. Reconnect or authorize the account before saving again.",
  internal_save_failure:
    "I could not complete this save. The layer report below is the authoritative record of what landed. I preserved the original request for recovery. Do not recreate anything already marked verified.",
};

const NEXT_ACTIONS: Record<DegradedReason, string> = {
  session_not_found: "open a new session, then resubmit with a NEW client_request_id",
  identity_binding_required: "reconnect or authorize the account, then save again",
  internal_save_failure: "review the layer report, then resubmit only the layers not marked verified",
};

/**
 * Assemble the envelope. Every key is always present; callers may not omit.
 * `content_status` and `recovery_expires_at` must come from
 * resolveContentStatus — this function will not infer them.
 */
export function buildDegradedEnvelope(input: {
  reason: DegradedReason;
  outcome?: "degraded" | "failed";
  retryable: boolean;
  save_attempt_id: string | null;
  client_request_id: string | null;
  payload_hash: string | null;
  receipt_id?: string | null;
  overall_status?: string | null;
  failure_stage: string | null;
  content_status: ContentStatus;
  recovery_expires_at: string | null;
  layers?: unknown[] | null;
  args: any;
}): DegradedEnvelope {
  return {
    outcome: input.outcome ?? (input.reason === "internal_save_failure" ? "failed" : "degraded"),
    reason: input.reason,
    retryable: input.retryable,
    save_attempt_id: input.save_attempt_id ?? null,
    client_request_id: input.client_request_id ?? null,
    payload_hash: input.payload_hash ?? null,
    receipt_id: input.receipt_id ?? null,
    overall_status: input.overall_status ?? null,
    failure_stage: input.failure_stage ?? null,
    content_status: input.content_status,
    recovery_expires_at: input.recovery_expires_at,
    layers: input.layers ?? null,
    returned_payload: returnedPayload(input.args),
    next_action: NEXT_ACTIONS[input.reason],
    note: NOTES[input.reason],
  };
}
