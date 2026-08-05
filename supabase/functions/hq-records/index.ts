// HQ · RECORDS · operator-gated, read-only fleet drill-down.
//
// Authority: the caller must present a verified JWT AND hold an ACTIVE row in
// public.fleet_operators. Identity is server-derived only; the body never
// supplies a cid for authorization purposes (only as a read filter, and the
// caller is already fleet-wide authorized when it reaches that point).
//
// Read-only: there is no mutating branch in this function, by construction.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { resolveIdentityKeyed } from "../_shared/identity-keyed.ts";

type KeyMode = "cid" | "keys";

interface RegisterSpec {
  table: string;
  key: KeyMode;
  keyCol: string;
  dateCol: string;
  titleCol: string | null;
  bodyCol: string | null;
  catCol: string | null;
  statusCol: string | null;
  columns: string[];
}

/** The allowlist. A register name that is not a key here is refused outright. */
const REGISTERS: Record<string, RegisterSpec> = {
  memory_entries: {
    table: "memory_entries", key: "cid", keyCol: "cid", dateCol: "created_at",
    titleCol: "title", bodyCol: "body_md", catCol: "category", statusCol: "status",
    columns: ["title", "category", "lane", "confidence", "status", "session_id", "created_by", "created_at"],
  },
  open_loops: {
    table: "open_loops", key: "cid", keyCol: "cid", dateCol: "updated_at",
    titleCol: "title", bodyCol: "trigger", catCol: null, statusCol: "state",
    columns: ["title", "state", "owner", "trigger", "surfaced_count", "last_surfaced", "updated_at"],
  },
  sessions: {
    table: "sessions", key: "cid", keyCol: "cid", dateCol: "opened_at",
    titleCol: null, bodyCol: null, catCol: "surface", statusCol: "close_kind",
    columns: ["id", "surface", "close_kind", "kernel_version", "opened_at", "closed_at"],
  },
  session_checkpoints: {
    table: "session_checkpoints", key: "cid", keyCol: "cid", dateCol: "created_at",
    titleCol: null, bodyCol: "principal_state", catCol: "kind", statusCol: null,
    columns: ["id", "kind", "session_id", "created_at"],
  },
  decisions: {
    table: "decisions", key: "cid", keyCol: "cid", dateCol: "decided_at",
    titleCol: "title", bodyCol: "decision_md", catCol: "authority_tier", statusCol: "verification_state",
    columns: ["title", "authority_tier", "reversibility", "decided_by", "provenance", "superseded_by", "decided_at"],
  },
  council_minutes: {
    table: "council_minutes", key: "cid", keyCol: "cid", dateCol: "convened_at",
    titleCol: "question", bodyCol: "verdict_md", catCol: "mode", statusCol: "status",
    columns: ["question", "mode", "status", "advisor", "session_id", "cost_usd", "convened_at"],
  },
  improvement_signals: {
    table: "improvement_signals", key: "cid", keyCol: "cid", dateCol: "last_seen",
    titleCol: "pattern", bodyCol: "detail_md", catCol: "audience", statusCol: "status",
    columns: ["pattern", "audience", "status", "recurrence", "provenance", "first_seen", "last_seen"],
  },
  directives: {
    table: "directives", key: "cid", keyCol: "cid", dateCol: "created_at",
    titleCol: "text", bodyCol: "text", catCol: "scope", statusCol: "status",
    columns: ["text", "scope", "status", "rank", "confirmed_at", "created_at"],
  },
  ritual_runs: {
    table: "ritual_runs", key: "cid", keyCol: "cid", dateCol: "created_at",
    titleCol: "ritual", bodyCol: null, catCol: "ritual", statusCol: "outcome",
    columns: ["ritual", "outcome", "session_id", "unsaved", "duration_ms", "created_at"],
  },
  save_receipts: {
    table: "save_receipts", key: "cid", keyCol: "cid", dateCol: "created_at",
    titleCol: null, bodyCol: null, catCol: "provenance", statusCol: "overall_status",
    columns: ["save_id", "overall_status", "session_id", "provenance", "watermark", "created_at", "completed_at"],
  },
  blueprints: {
    table: "blueprints", key: "keys", keyCol: "tenant_id", dateCol: "created_at",
    titleCol: "title", bodyCol: "intent", catCol: "loop_cadence", statusCol: "status",
    columns: ["title", "status", "owner", "current_state", "next_action", "version", "created_at"],
  },
  change_log: {
    table: "change_log", key: "keys", keyCol: "tenant_id", dateCol: "at",
    titleCol: "summary", bodyCol: "summary", catCol: "entity", statusCol: "change",
    columns: ["entity", "entity_id", "change", "summary", "actor", "at"],
  },
  world_claims: {
    table: "world_claims", key: "cid", keyCol: "cid", dateCol: "created_at",
    titleCol: "value_text", bodyCol: "value_text", catCol: "predicate", statusCol: "status",
    columns: ["predicate", "value_text", "status", "grade", "sensitivity", "confidence", "subject_id", "created_at"],
  },
  goals: {
    table: "goals", key: "cid", keyCol: "cid", dateCol: "created_at",
    titleCol: "title", bodyCol: "description", catCol: "value_pillar", statusCol: "status",
    columns: ["title", "status", "value_pillar", "priority", "target_date", "created_by", "created_at"],
  },
  storyline: {
    table: "storyline", key: "cid", keyCol: "cid", dateCol: "created_at",
    titleCol: "title", bodyCol: "body_md", catCol: "kind", statusCol: "grade",
    columns: ["title", "kind", "grade", "period_start", "period_end", "created_at"],
  },
  document_registry: {
    table: "document_registry", key: "cid", keyCol: "cid", dateCol: "created_at",
    titleCol: "filename", bodyCol: null, catCol: "category", statusCol: "drift",
    columns: ["filename", "category", "install_version", "drift", "last_checked", "created_at"],
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.slice("Bearer ".length);
  const { data: claimsData, error: claimsErr } = await anon.auth.getClaims(token);
  const claims = claimsData?.claims as Record<string, unknown> | undefined;
  if (claimsErr || !claims?.sub) return json({ error: "unauthorized" }, 401);

  const authUserId = String(claims.sub);

  // AUTH v2 · identity-keyed resolution, for the record and for logging.
  const keyed = await resolveIdentityKeyed(admin, {
    email: typeof claims.email === "string" ? claims.email : null,
    emailVerified: claims.email_verified === true,
    sub: authUserId,
  });

  // AUTHORITY · fleet operator membership is the gate. Nothing else opens it.
  const { data: op } = await admin
    .from("fleet_operators")
    .select("auth_user_id, status")
    .eq("auth_user_id", authUserId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (!op) {
    console.log("hq_records_refused", JSON.stringify({ sub: authUserId, keyed: keyed.status }));
    return json({ error: "forbidden", reason: "not_fleet_operator" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "bad_request", reason: "invalid_json" }, 400);
  }

  const action = String(body.action ?? "");
  const as_of = new Date().toISOString();

  try {
    if (action === "fleet") {
      const { data, error } = await admin.rpc("hq_records_fleet_v1");
      if (error) throw error;
      return json({ ok: true, as_of, rows: data ?? [] });
    }

    if (action === "counts") {
      const cid = String(body.cid ?? "");
      if (!/^CID-\d+$/.test(cid)) return json({ error: "bad_request", reason: "cid" }, 400);
      const { data, error } = await admin.rpc("hq_records_counts_v1", { _cid: cid });
      if (error) throw error;
      return json({ ok: true, as_of, cid, rows: data ?? [] });
    }

    if (action === "rows") {
      const register = String(body.register ?? "");
      const spec = REGISTERS[register];
      if (!spec) return json({ error: "bad_request", reason: "unknown_register" }, 400);

      const cid = String(body.cid ?? "");
      if (!/^CID-\d+$/.test(cid)) return json({ error: "bad_request", reason: "cid" }, 400);

      const filters = (body.filters ?? {}) as Record<string, string | undefined>;
      const pageSize = [25, 50, 100].includes(Number(body.page_size)) ? Number(body.page_size) : 25;
      const page = Math.max(0, Number(body.page ?? 0) | 0);

      const sortCol = typeof body.sort_col === "string" && spec.columns.includes(body.sort_col)
        ? body.sort_col
        : spec.dateCol;
      const ascending = body.sort_dir === "asc";

      let q = admin.from(spec.table).select("*", { count: "exact" });

      if (spec.key === "cid") {
        q = q.eq(spec.keyCol, cid);
      } else {
        const { data: keys } = await admin.rpc("hq_records_keys_v1", { _cid: cid });
        q = q.in(spec.keyCol, (keys as string[] | null) ?? [cid]);
      }

      if (filters.category && spec.catCol) q = q.eq(spec.catCol, filters.category);
      if (filters.status && spec.statusCol) q = q.eq(spec.statusCol, filters.status);
      if (filters.from) q = q.gte(spec.dateCol, filters.from);
      if (filters.to) q = q.lte(spec.dateCol, filters.to);
      if (filters.q) {
        const needle = filters.q.replace(/[%,()]/g, " ").trim();
        if (needle) {
          const ors: string[] = [];
          if (spec.titleCol) ors.push(`${spec.titleCol}.ilike.%${needle}%`);
          if (spec.bodyCol && spec.bodyCol !== spec.titleCol) ors.push(`${spec.bodyCol}.ilike.%${needle}%`);
          if (ors.length) q = q.or(ors.join(","));
        }
      }
      if (typeof filters.lane === "string" && filters.lane && register === "memory_entries") {
        q = q.eq("lane", filters.lane);
      }
      if (typeof filters.session_id === "string" && filters.session_id) {
        q = q.eq("session_id", filters.session_id);
      }
      if (typeof filters.id === "string" && filters.id) {
        q = q.eq(register === "save_receipts" ? "save_id" : "id", filters.id);
      }
      if (typeof filters.entity_id === "string" && filters.entity_id && register === "change_log") {
        q = q.eq("entity_id", filters.entity_id);
      }

      q = q.order(sortCol, { ascending, nullsFirst: false })
           .range(page * pageSize, page * pageSize + pageSize - 1);

      const { data, error, count } = await q;
      if (error) throw error;

      return json({
        ok: true, as_of, register, cid,
        columns: spec.columns,
        date_col: spec.dateCol,
        title_col: spec.titleCol,
        body_col: spec.bodyCol,
        cat_col: spec.catCol,
        status_col: spec.statusCol,
        page, page_size: pageSize,
        total: count ?? 0,
        rows: data ?? [],
      });
    }

    if (action === "facets") {
      const register = String(body.register ?? "");
      const spec = REGISTERS[register];
      if (!spec) return json({ error: "bad_request", reason: "unknown_register" }, 400);
      const cid = String(body.cid ?? "");
      if (!/^CID-\d+$/.test(cid)) return json({ error: "bad_request", reason: "cid" }, 400);

      const cols = [spec.catCol, spec.statusCol].filter(Boolean) as string[];
      if (cols.length === 0) return json({ ok: true, as_of, categories: [], statuses: [] });

      let q = admin.from(spec.table).select(cols.join(",")).limit(2000);
      if (spec.key === "cid") q = q.eq(spec.keyCol, cid);
      else {
        const { data: keys } = await admin.rpc("hq_records_keys_v1", { _cid: cid });
        q = q.in(spec.keyCol, (keys as string[] | null) ?? [cid]);
      }
      const { data, error } = await q;
      if (error) throw error;
      const uniq = (col: string | null) =>
        col
          ? Array.from(new Set(((data ?? []) as Record<string, unknown>[])
              .map((r) => r[col]).filter((v) => typeof v === "string" && v))).sort() as string[]
          : [];
      return json({ ok: true, as_of, categories: uniq(spec.catCol), statuses: uniq(spec.statusCol) });
    }

    return json({ error: "bad_request", reason: "unknown_action" }, 400);
  } catch (e) {
    console.error("hq_records_error", String(e));
    return json({ error: "read_failed", reason: String(e) }, 500);
  }
});
