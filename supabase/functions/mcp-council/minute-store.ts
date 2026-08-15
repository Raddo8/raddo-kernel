// supabase/functions/mcp-council/minute-store.ts
//
// Council minute persistence. Server-only, service-role writes.
//
// Why this exists: deliberations run 2-3 minutes while MCP clients cap at
// 60s. The minute must survive the client hanging up. Every deliberation
// opens a `running` row at start and is finalized to `complete` or `failed`
// the moment synthesis returns, independent of the transport.
//
// Identity rule: rows are keyed by `cid`. `tenant` is a display label only
// and is stored as `tenant_label`, never used to authorize a read.

export type MinuteRunStatus = "running" | "complete" | "failed";

export type OpenRunArgs = {
  run_id: string;
  cid: string | null;
  tenant_label: string | null;
  tool: string;
  question: string;
  question_hash: string | null;
  session_id: string | null;
};

export type CompleteRunArgs = {
  run_id: string;
  minute: unknown;
  verdict_md?: string | null;
  dissent_md?: string | null;
  horizon?: unknown;
  chairs?: unknown;
  lenses?: unknown;
  mode?: string | null;
  advisor?: string | null;
  eps?: number | null;
  rho?: number | null;
  cost_usd?: number | null;
};

type Admin = { from: (t: string) => any } | null;

const TABLE = "council_minutes";

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Write the `running` row. Best effort: never throws into the caller. */
export async function openMinuteRun(admin: Admin, a: OpenRunArgs): Promise<void> {
  if (!admin) return;
  try {
    await admin.from(TABLE).insert({
      run_id: a.run_id,
      cid: a.cid,
      tenant_label: a.tenant_label,
      tool: a.tool,
      question: a.question.slice(0, 8000),
      question_hash: a.question_hash,
      session_id: a.session_id,
      status: "running",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("minute_store_open_failed", JSON.stringify({ run_id: a.run_id, error: String(e).slice(0, 300) }));
  }
}

/** Finalize the run with the full minute. Best effort: never throws. */
export async function completeMinuteRun(admin: Admin, a: CompleteRunArgs): Promise<void> {
  if (!admin) return;
  const now = new Date().toISOString();
  try {
    const { error } = await admin.from(TABLE).update({
      status: "complete",
      minute: a.minute ?? null,
      verdict_md: a.verdict_md ?? null,
      dissent_md: a.dissent_md ?? null,
      horizon: a.horizon ?? null,
      chairs: a.chairs ?? null,
      lenses: a.lenses ?? null,
      mode: a.mode ?? null,
      advisor: a.advisor ?? null,
      eps: num(a.eps),
      rho: num(a.rho),
      cost_usd: num(a.cost_usd),
      completed_at: now,
      updated_at: now,
    }).eq("run_id", a.run_id);
    if (error) throw new Error(error.message);
  } catch (e) {
    console.warn("minute_store_complete_failed", JSON.stringify({ run_id: a.run_id, error: String(e).slice(0, 300) }));
  }
}

/** Mark the run failed with a distinct error string. Best effort. */
export async function failMinuteRun(admin: Admin, run_id: string, error: unknown): Promise<void> {
  if (!admin) return;
  const now = new Date().toISOString();
  try {
    await admin.from(TABLE).update({
      status: "failed",
      error: String(error instanceof Error ? error.message : error).slice(0, 1000),
      completed_at: now,
      updated_at: now,
    }).eq("run_id", run_id);
  } catch (e) {
    console.warn("minute_store_fail_failed", JSON.stringify({ run_id, error: String(e).slice(0, 300) }));
  }
}

export type FetchArgs = {
  cid: string | null;
  run_id?: string | null;
  latest?: boolean;
  question_hash?: string | null;
};

export type FetchResult =
  | { status: "complete"; run_id: string; id: string; tool: string | null; question: string | null; question_hash: string | null; mode: string | null; advisor: string | null; epsilon: number | null; rho: number | null; cost_usd: number | null; minute: unknown; started_at: string | null; completed_at: string | null }
  | { status: "still_running"; run_id: string; id: string; tool: string | null; question: string | null; started_at: string | null; elapsed_ms: number }
  | { status: "failed"; run_id: string; id: string; tool: string | null; question: string | null; error: string | null }
  | { status: "not_found" };

/**
 * Read back a persisted minute for the authenticated CID.
 * `still_running`, `failed`, and `not_found` are three distinct states,
 * never collapsed into one error.
 */
export async function fetchMinute(admin: Admin, a: FetchArgs): Promise<FetchResult> {
  if (!admin) return { status: "not_found" };
  let q = admin.from(TABLE)
    .select("id, run_id, tool, question, question_hash, status, mode, advisor, eps, rho, cost_usd, minute, error, started_at, completed_at")
    .order("started_at", { ascending: false })
    .limit(1);

  // CID scoping. A null CID can only read rows that also carry no CID.
  if (a.cid) q = q.eq("cid", a.cid);
  else q = q.is("cid", null);

  if (a.run_id) q = q.eq("run_id", a.run_id);
  if (a.question_hash) q = q.eq("question_hash", a.question_hash);

  const { data, error } = await q.maybeSingle();
  if (error || !data) return { status: "not_found" };

  const base = {
    run_id: data.run_id as string,
    id: data.id as string,
    tool: (data.tool ?? null) as string | null,
    question: (data.question ?? null) as string | null,
  };

  if (data.status === "running") {
    const started = data.started_at ? Date.parse(data.started_at) : Date.now();
    return {
      status: "still_running",
      ...base,
      started_at: data.started_at ?? null,
      elapsed_ms: Math.max(0, Date.now() - started),
    };
  }
  if (data.status === "failed") {
    return { status: "failed", ...base, error: (data.error ?? null) as string | null };
  }
  return {
    status: "complete",
    ...base,
    question_hash: (data.question_hash ?? null) as string | null,
    mode: (data.mode ?? null) as string | null,
    advisor: (data.advisor ?? null) as string | null,
    epsilon: num(data.eps),
    rho: num(data.rho),
    cost_usd: num(data.cost_usd),
    minute: data.minute ?? null,
    started_at: data.started_at ?? null,
    completed_at: data.completed_at ?? null,
  };
}

/**
 * Append a note to a run without touching its status.
 * Ordering law: once a deliberation is complete, downstream failures are
 * notes, never the run's verdict. `error` stays reserved for real failures.
 */
export async function noteMinuteRun(admin: Admin, run_id: string, note: string): Promise<void> {
  if (!admin) return;
  try {
    const { data } = await admin.from(TABLE).select("notes").eq("run_id", run_id).maybeSingle();
    const prior = Array.isArray(data?.notes) ? data.notes : [];
    await admin.from(TABLE).update({
      notes: [...prior, { at: new Date().toISOString(), detail: String(note).slice(0, 1000) }],
      updated_at: new Date().toISOString(),
    }).eq("run_id", run_id);
  } catch (e) {
    console.warn("minute_store_note_failed", JSON.stringify({ run_id, error: String(e).slice(0, 300) }));
  }
}

/**
 * L2c/L2d · find a deliberation that is still running for this caller and
 * this exact question. A retry must return the in-flight run, never start a
 * second full deliberation at full cost.
 */
export async function findInFlightRun(
  admin: Admin,
  a: { cid: string | null; question_hash: string | null; tool: string; max_age_seconds?: number },
): Promise<{ run_id: string; started_at: string | null; tool: string } | null> {
  if (!admin || !a.question_hash) return null;
  try {
    const since = new Date(Date.now() - (a.max_age_seconds ?? 600) * 1000).toISOString();
    let q = admin.from(TABLE).select("run_id, tool, created_at")
      .eq("status", "running")
      .eq("question_hash", a.question_hash)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    q = a.cid ? q.eq("cid", a.cid) : q.is("cid", null);
    const { data, error } = await q;
    if (error || !data || data.length === 0) return null;
    return { run_id: data[0].run_id, started_at: data[0].created_at ?? null, tool: data[0].tool ?? a.tool };
  } catch (_e) {
    return null;
  }
}
