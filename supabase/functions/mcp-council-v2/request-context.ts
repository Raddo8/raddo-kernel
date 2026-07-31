// supabase/functions/mcp-council/request-context.ts
//
// PKT-0A · Request identity and correlation.
//
// Constructs the immutable per-request context that every downstream function
// receives. Purely additive: nothing here reads or writes business state, and
// nothing here can fail a request.
//
// Authority note (PKT-0 ruling, 2026-07-28): `tenant` is a DISPLAY LABEL and
// may collide by design. `cid` is the only identity key. Downstream code must
// never authorize, join, or enforce uniqueness on `tenant`.

export const CONTRACT_VERSION = "pkt0a.1";

export type AuthMode = "static" | "oauth" | null;

export type RequestContext = Readonly<{
  request_id: string;
  correlation_id: string;
  tenant: string;
  cid: string | null;
  authenticated_sub: string | null;
  auth_mode: AuthMode;
  surface: string | null;
  contract_version: string;
  build_id: string;
  started_at: string;
  started_ms: number;
}>;

function safeUuid(): string {
  try {
    return crypto.randomUUID();
  } catch (_e) {
    return `rq_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
  }
}

export function newRequestContext(args: {
  req: Request;
  tenant: string;
  cid?: string | null;
  authenticated_sub?: string | null;
  auth_mode?: AuthMode;
  surface?: string | null;
  build_id: string;
}): RequestContext {
  let incomingCorrelation: string | null = null;
  try {
    incomingCorrelation =
      args.req.headers.get("x-correlation-id") ??
      args.req.headers.get("x-request-id") ??
      null;
  } catch (_e) {
    incomingCorrelation = null;
  }

  const request_id = safeUuid();
  const correlation_id =
    incomingCorrelation && incomingCorrelation.length <= 200
      ? incomingCorrelation
      : request_id;

  return Object.freeze({
    request_id,
    correlation_id,
    tenant: args.tenant,
    cid: args.cid ?? null,
    authenticated_sub: args.authenticated_sub ?? null,
    auth_mode: args.auth_mode ?? null,
    surface: args.surface ?? null,
    contract_version: CONTRACT_VERSION,
    build_id: args.build_id,
    started_at: new Date().toISOString(),
    started_ms: Date.now(),
  });
}

export function elapsedMs(ctx: RequestContext): number {
  const d = Date.now() - ctx.started_ms;
  return Number.isFinite(d) && d >= 0 ? d : 0;
}

export function stampContext<T extends Record<string, unknown>>(
  o: T,
  ctx: RequestContext,
): T & { request_id: string; correlation_id: string; contract_version: string } {
  if (!o || typeof o !== "object") return o as any;
  return {
    ...o,
    request_id: ctx.request_id,
    correlation_id: ctx.correlation_id,
    contract_version: ctx.contract_version,
  };
}
