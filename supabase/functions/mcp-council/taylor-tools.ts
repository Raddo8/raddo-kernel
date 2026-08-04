// supabase/functions/mcp-council/taylor-tools.ts
//
// TAYLOR BUILD UNIT · T1. Eight connector tools that complete TAYLOR's gate
// coverage, plus the typed connections inventory used by record_intake.
//
// Law for every handler here:
//   · CID keys. Display names are never keys.
//   · Receipts first. Every mutation returns the persisted id plus a computed
//     measure, never an echo of what the caller sent.
//   · Every mutation emits a change_log signal.
//   · Distinct error string per failure state.
//   · No em dashes in any client visible string.

import { postThreadMessage, resolveThread } from "../_shared/taylor-shared.ts";

type Admin = any;

export type ToolReply = { ok: true; [k: string]: unknown } | { ok: false; reason: string };

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const str = (v: unknown, max = 4000): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Fire and forget. A lost signal is never allowed to fail a tool. */
async function signal(
  admin: Admin,
  cid: string,
  entity: string,
  entityId: string | null,
  change: string,
  summary: string,
): Promise<void> {
  try {
    const { error } = await admin.from("change_log").insert({
      tenant_id: cid,
      entity,
      entity_id: isUuid(entityId) ? entityId : null,
      change,
      summary: summary.slice(0, 600),
      actor: "taylor",
    });
    if (error) console.error("taylor_tools_signal_failed", entity, error.message);
  } catch (e) {
    console.error("taylor_tools_signal_exception", e instanceof Error ? e.message : String(e));
  }
}

/** The one onboarding row for a CID. Newest wins when history exists. */
async function tenantRow(admin: Admin, cid: string): Promise<any | null> {
  const { data, error } = await admin
    .from("onboarding_tenants")
    .select("id, cid, state, step0_flags, consent_signed_at, consent_signed_name, lane, handoff_complete_at, handoff_message_id")
    .eq("cid", cid)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("taylor_tools_tenant_read_failed", error.message);
    return null;
  }
  return data ?? null;
}

// ── 1 · consent_record ────────────────────────────────────────────────────
export async function consentRecord(admin: Admin, cid: string, args: any): Promise<ToolReply> {
  const signedName = str(args?.signed_name, 160);
  if (args?.accepted !== true) return { ok: false, reason: "consent_not_accepted" };
  if (signedName.length < 2) return { ok: false, reason: "consent_name_missing" };

  const row = await tenantRow(admin, cid);
  if (!row?.id) return { ok: false, reason: "consent_tenant_missing" };

  const reconsented = Boolean(row.consent_signed_at);
  const stamp = new Date().toISOString();
  const { data, error } = await admin
    .from("onboarding_tenants")
    .update({ consent_signed_at: stamp, consent_signed_name: signedName, updated_at: stamp })
    .eq("id", row.id)
    .select("id, consent_signed_at, consent_signed_name")
    .maybeSingle();
  if (error || !data) {
    console.error("consent_record_failed", error?.message);
    return { ok: false, reason: "consent_write_failed" };
  }

  await signal(admin, cid, "onboarding_tenants", data.id, reconsented ? "consent_updated" : "consent_signed", `consent stamped for ${cid}`);
  return {
    ok: true,
    tenant_id: data.id,
    consent_signed_at: data.consent_signed_at,
    consent_signed_name: data.consent_signed_name,
    reconsented,
  };
}

// ── 2 · lane_record ───────────────────────────────────────────────────────
const LANE_QUESTIONS = ["holds_financial_account_data", "handles_regulated_data", "custodies_client_funds"] as const;

export async function laneRecord(admin: Admin, cid: string, args: any): Promise<ToolReply> {
  const answers: Record<string, boolean> = {};
  for (const q of LANE_QUESTIONS) {
    if (typeof args?.[q] !== "boolean") return { ok: false, reason: "lane_answers_incomplete" };
    answers[q] = args[q] as boolean;
  }
  const lane = Object.values(answers).some(Boolean) ? "regulated" : "standard";

  const row = await tenantRow(admin, cid);
  if (!row?.id) return { ok: false, reason: "lane_tenant_missing" };

  const flags = { ...(row.step0_flags && typeof row.step0_flags === "object" ? row.step0_flags : {}), ...answers, lane, lane_recorded_at: new Date().toISOString() };
  const notes = str(args?.notes, 800);
  if (notes) (flags as any).lane_notes = notes;

  const { data, error } = await admin
    .from("onboarding_tenants")
    .update({ step0_flags: flags, lane, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .select("id, lane, step0_flags")
    .maybeSingle();
  if (error || !data) {
    console.error("lane_record_failed", error?.message);
    return { ok: false, reason: "lane_write_failed" };
  }

  await signal(admin, cid, "onboarding_tenants", data.id, "lane_recorded", `lane ${lane} for ${cid}`);
  return {
    ok: true,
    tenant_id: data.id,
    lane: data.lane,
    yes_count: Object.values(answers).filter(Boolean).length,
    consumers: ["regulated_gates", "taylor_context"],
  };
}

// ── 3 · boundaries_record ─────────────────────────────────────────────────
export async function boundariesRecord(admin: Admin, cid: string, args: any): Promise<ToolReply> {
  const inBounds = Array.isArray(args?.in_bounds) ? args.in_bounds.map((s: unknown) => str(s, 600)).filter(Boolean) : [];
  const outBounds = Array.isArray(args?.out_of_bounds) ? args.out_of_bounds.map((s: unknown) => str(s, 600)).filter(Boolean) : [];
  const noStore = str(args?.no_store_rule, 600);
  if (inBounds.length === 0 && outBounds.length === 0 && !noStore) return { ok: false, reason: "boundaries_empty" };

  const rows: Array<{ tenant_id: string; cid: string; text: string; scope: string; rank: number; status: string; confirmed_at: string }> = [];
  const now = new Date().toISOString();
  let rank = 0;
  for (const t of inBounds) rows.push({ tenant_id: cid, cid, text: `In bounds: ${t}`, scope: "SITUATIONAL", rank: rank++, status: "active", confirmed_at: now });
  for (const t of outBounds) rows.push({ tenant_id: cid, cid, text: `Out of bounds: ${t}`, scope: "SITUATIONAL", rank: rank++, status: "active", confirmed_at: now });
  if (noStore) rows.push({ tenant_id: cid, cid, text: `Never store: ${noStore}`, scope: "SITUATIONAL", rank: rank++, status: "active", confirmed_at: now });

  const { data, error } = await admin.from("directives").insert(rows).select("id, text");
  if (error || !Array.isArray(data)) {
    console.error("boundaries_record_failed", error?.message);
    return { ok: false, reason: "boundaries_write_failed" };
  }

  for (const d of data) await signal(admin, cid, "directives", d.id, "boundary_recorded", d.text);
  return {
    ok: true,
    directive_ids: data.map((d: any) => d.id),
    recorded: data.length,
    in_bounds: inBounds.length,
    out_of_bounds: outBounds.length,
    no_store_rule: Boolean(noStore),
  };
}

// ── world item shaping · shared by deepdive_commit and harvest_record ─────
type WorldItemDraft = {
  item_type: string;
  title: string;
  body: string;
  confidence: number | null;
  provenance: Record<string, unknown>;
  provenance_refs: unknown[];
};

const clampConfidence = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number.NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
};

function draftsFromUnderstanding(u: any, brief: string, provenance: Record<string, unknown>): WorldItemDraft[] {
  const out: WorldItemDraft[] = [];
  const push = (item_type: string, raw: unknown) => {
    if (raw == null) return;
    if (Array.isArray(raw)) {
      for (const r of raw) push(item_type, r);
      return;
    }
    if (typeof raw === "string") {
      const t = str(raw, 2000);
      if (t) out.push({ item_type, title: t.slice(0, 160), body: t, confidence: null, provenance, provenance_refs: [] });
      return;
    }
    if (typeof raw === "object") {
      const o = raw as any;
      const title = str(o.title ?? o.name, 160);
      const body = str(o.body ?? o.summary ?? o.detail ?? "", 4000) || title;
      if (!title && !body) return;
      out.push({
        item_type,
        title: title || body.slice(0, 160),
        body,
        confidence: clampConfidence(o.confidence),
        provenance: { ...provenance, ...(o.provenance && typeof o.provenance === "object" ? o.provenance : {}) },
        provenance_refs: Array.isArray(o.provenance_refs) ? o.provenance_refs.slice(0, 25) : [],
      });
    }
  };
  push("business", u?.biz);
  push("entity", u?.entities);
  push("person", u?.people);
  push("priority", u?.priorities);
  push("system", u?.systems);
  if (brief) out.push({ item_type: "brief", title: "Deep dive brief", body: brief, confidence: null, provenance, provenance_refs: [] });
  return out;
}

async function writeWorldItems(
  admin: Admin,
  cid: string,
  source: "deepdive" | "harvest",
  drafts: WorldItemDraft[],
  synthetic: boolean,
): Promise<{ ids: string[]; byType: Record<string, number> } | null> {
  const now = new Date().toISOString();
  const rows = drafts.slice(0, 300).map((d) => ({
    cid,
    source,
    item_type: d.item_type,
    title: d.title,
    body: d.body,
    confidence: d.confidence,
    provenance: d.provenance,
    provenance_refs: d.provenance_refs,
    synthetic,
    first_seen: now,
  }));
  const { data, error } = await admin.from("world_items").insert(rows).select("id, item_type");
  if (error || !Array.isArray(data)) {
    console.error("world_items_write_failed", error?.message);
    return null;
  }
  const byType: Record<string, number> = {};
  for (const r of data) byType[r.item_type] = (byType[r.item_type] ?? 0) + 1;
  return { ids: data.map((r: any) => r.id), byType };
}

// ── 4 · deepdive_commit ───────────────────────────────────────────────────
export async function deepdiveCommit(admin: Admin, cid: string, args: any): Promise<ToolReply> {
  const u = args?.understanding;
  const brief = str(args?.brief, 8000);
  if ((!u || typeof u !== "object") && !brief) return { ok: false, reason: "deepdive_payload_empty" };

  const row = await tenantRow(admin, cid);
  if (!row?.id) return { ok: false, reason: "deepdive_tenant_missing" };

  const provenance = {
    source: "deepdive",
    surface: "connector",
    cid,
    captured_at: new Date().toISOString(),
    ...(args?.provenance && typeof args.provenance === "object" ? args.provenance : {}),
  };
  const drafts = draftsFromUnderstanding(u, brief, provenance);
  if (drafts.length === 0) return { ok: false, reason: "deepdive_payload_empty" };

  const written = await writeWorldItems(admin, cid, "deepdive", drafts, args?.synthetic === true);
  if (!written) return { ok: false, reason: "deepdive_write_failed" };

  const state = { ...(row.state && typeof row.state === "object" ? row.state : {}), deepdive: { understanding: u ?? null, brief: brief || null, committed_at: provenance.captured_at, item_count: written.ids.length } };
  const { error: tErr } = await admin
    .from("onboarding_tenants")
    .update({ state, current_step: "dive", updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (tErr) console.error("deepdive_tenant_state_failed", tErr.message);

  await signal(admin, cid, "world_items", written.ids[0] ?? null, "deepdive_committed", `${written.ids.length} world items staged from the deep dive`);
  return { ok: true, tenant_id: row.id, items_written: written.ids.length, by_type: written.byType, item_ids: written.ids.slice(0, 25) };
}

// ── 5 · harvest_record ────────────────────────────────────────────────────
export async function harvestRecord(admin: Admin, cid: string, args: any): Promise<ToolReply> {
  const items = Array.isArray(args?.items) ? args.items : [];
  if (items.length === 0) return { ok: false, reason: "harvest_items_empty" };

  const drafts: WorldItemDraft[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") return { ok: false, reason: "harvest_item_shape_invalid" };
    const o = raw as any;
    const title = str(o.title, 160);
    const body = str(o.body, 4000);
    const item_type = str(o.type ?? o.item_type, 40) || "note";
    if (!title || !body) return { ok: false, reason: "harvest_item_shape_invalid" };
    const prov = o.provenance;
    const provOk = prov && typeof prov === "object" && Object.keys(prov).length > 0;
    if (!provOk) return { ok: false, reason: "harvest_provenance_missing" };
    drafts.push({
      item_type,
      title,
      body,
      confidence: clampConfidence(o.confidence),
      provenance: { source: "harvest", cid, captured_at: new Date().toISOString(), ...prov },
      provenance_refs: Array.isArray(o.provenance_refs) ? o.provenance_refs.slice(0, 25) : [],
    });
  }

  const written = await writeWorldItems(admin, cid, "harvest", drafts, args?.synthetic === true);
  if (!written) return { ok: false, reason: "harvest_write_failed" };

  await signal(admin, cid, "world_items", written.ids[0] ?? null, "harvest_recorded", `${written.ids.length} distilled foundation items staged`);
  return { ok: true, items_written: written.ids.length, by_type: written.byType, item_ids: written.ids.slice(0, 25) };
}

// ── 6 · wire_grants_record ────────────────────────────────────────────────
const GRANT_SOURCES = new Set(["email", "calendar", "files", "accounting", "crm", "chat", "other"]);
const GRANT_STATUS = new Set(["pending", "granted", "declined", "revoked"]);

export async function wireGrantsRecord(admin: Admin, cid: string, args: any): Promise<ToolReply> {
  const grants = Array.isArray(args?.grants) ? args.grants : [];
  if (grants.length === 0) return { ok: false, reason: "wire_grants_empty" };

  const rows: any[] = [];
  for (const raw of grants) {
    if (!raw || typeof raw !== "object") return { ok: false, reason: "wire_grants_shape_invalid" };
    const source = str((raw as any).source, 40).toLowerCase();
    if (!GRANT_SOURCES.has(source)) return { ok: false, reason: "wire_grants_invalid_source" };
    const status = (str((raw as any).status, 20).toLowerCase() || "pending");
    if (!GRANT_STATUS.has(status)) return { ok: false, reason: "wire_grants_invalid_status" };
    rows.push({
      cid,
      source,
      provider: str((raw as any).provider, 80),
      grant_status: status,
      granted_at: status === "granted" ? (str((raw as any).granted_at, 40) || new Date().toISOString()) : null,
      notes: str((raw as any).notes, 400) || null,
      updated_at: new Date().toISOString(),
    });
  }

  const { data, error } = await admin
    .from("wire_grants")
    .upsert(rows, { onConflict: "cid,source,provider" })
    .select("id, source, provider, grant_status");
  if (error || !Array.isArray(data)) {
    console.error("wire_grants_record_failed", error?.message);
    return { ok: false, reason: "wire_grants_write_failed" };
  }

  const granted = data.filter((r: any) => r.grant_status === "granted").length;
  await signal(admin, cid, "wire_grants", data[0]?.id ?? null, "wire_grants_recorded", `${data.length} sources recorded, ${granted} granted`);
  return { ok: true, recorded: data.length, granted, grant_ids: data.map((r: any) => r.id) };
}

// ── 7 · kernel_inputs_check · READ ONLY ───────────────────────────────────
type Fill = { key: string; status: "present" | "gap"; measure: number | string | null; closes_with: string };

export async function kernelInputsCheck(admin: Admin, cid: string): Promise<ToolReply> {
  const count = async (table: string, build: (q: any) => any): Promise<number> => {
    try {
      const { count: c, error } = await build(admin.from(table).select("id", { count: "exact", head: true }).eq("cid", cid));
      if (error) {
        console.error("kernel_inputs_count_failed", table, error.message);
        return 0;
      }
      return c ?? 0;
    } catch (e) {
      console.error("kernel_inputs_count_exception", table, e instanceof Error ? e.message : String(e));
      return 0;
    }
  };

  const row = await tenantRow(admin, cid);
  const { data: tenant } = await admin.from("tenants").select("display_name, cob_name, principal, office_mode").eq("cid", cid).maybeSingle();

  const [entities, people, dive, boundaries, voice, fireside] = await Promise.all([
    count("world_items", (q: any) => q.eq("item_type", "entity")),
    count("world_items", (q: any) => q.eq("item_type", "person")),
    count("world_items", (q: any) => q.eq("source", "deepdive")),
    count("directives", (q: any) => q.eq("scope", "SITUATIONAL").eq("status", "active")),
    count("client_intake", (q: any) => q.in("topic", ["communication-style", "values", "non-negotiables"])),
    count("client_intake", (q: any) => q.eq("source", "fireside-connector")),
  ]);

  const fills: Fill[] = [
    { key: "identity", status: tenant?.display_name ? "present" : "gap", measure: tenant?.display_name ?? null, closes_with: "record the business name and principal on the tenant record" },
    { key: "entities", status: entities > 0 ? "present" : "gap", measure: entities, closes_with: "call deepdive_commit with the entities the business runs through" },
    { key: "voice_signals", status: voice > 0 ? "present" : "gap", measure: voice, closes_with: "call record_intake on communication style, values or non negotiables" },
    { key: "roster", status: people > 0 ? "present" : "gap", measure: people, closes_with: "call deepdive_commit with the people around the principal" },
    { key: "office_refs", status: tenant?.office_mode ? "present" : "gap", measure: tenant?.office_mode ?? null, closes_with: "set the office mode on the tenant record" },
    { key: "consent", status: row?.consent_signed_at ? "present" : "gap", measure: row?.consent_signed_at ?? null, closes_with: "call consent_record with the signed name" },
    { key: "boundaries", status: boundaries > 0 ? "present" : "gap", measure: boundaries, closes_with: "call boundaries_record with in bounds and out of bounds" },
    { key: "dive", status: dive > 0 ? "present" : "gap", measure: dive, closes_with: "call deepdive_commit with the understanding and the brief" },
    { key: "fireside", status: fireside > 0 ? "present" : "gap", measure: fireside, closes_with: "call record_intake with source fireside-connector" },
  ];

  const gaps = fills.filter((f) => f.status === "gap");
  return {
    ok: true,
    cid,
    complete: gaps.length === 0,
    fills_present: fills.length - gaps.length,
    fills_total: fills.length,
    findings: gaps.map((g) => ({ fill: g.key, closes_with: g.closes_with })),
    fills,
  };
}

// ── 8 · taylor_handoff ────────────────────────────────────────────────────
const DEFAULT_HANDOFF =
  "That is the setup complete. Your COB has everything it needs to start work. From here your COB carries the conversation. I stay reachable any time you want a hand with setup.";

export async function taylorHandoff(admin: Admin, cid: string, args: any): Promise<ToolReply> {
  const row = await tenantRow(admin, cid);
  if (!row?.id) return { ok: false, reason: "handoff_tenant_missing" };
  if (row.handoff_complete_at) {
    return {
      ok: true,
      already_handed_off: true,
      reason: "already_handed_off",
      tenant_id: row.id,
      handoff_complete_at: row.handoff_complete_at,
      handoff_message_id: row.handoff_message_id ?? null,
    };
  }

  const threadId = await resolveThread(admin, cid);
  if (!threadId) return { ok: false, reason: "handoff_thread_unavailable" };

  const content = str(args?.message, 2000) || DEFAULT_HANDOFF;
  const posted = await postThreadMessage(admin, { threadId, cid, role: "taylor", surface: "connector", content });
  if (!posted?.id) return { ok: false, reason: "handoff_message_failed" };

  const stamp = new Date().toISOString();
  const { data, error } = await admin
    .from("onboarding_tenants")
    .update({ handoff_complete_at: stamp, handoff_message_id: posted.id, updated_at: stamp })
    .eq("id", row.id)
    .select("id, handoff_complete_at, handoff_message_id")
    .maybeSingle();
  if (error || !data) {
    console.error("taylor_handoff_mark_failed", error?.message);
    return { ok: false, reason: "handoff_mark_failed" };
  }

  await signal(admin, cid, "onboarding_tenants", data.id, "taylor_handoff", `baton passed to the COB for ${cid}`);
  return {
    ok: true,
    already_handed_off: false,
    tenant_id: data.id,
    thread_id: threadId,
    handoff_message_id: data.handoff_message_id,
    handoff_complete_at: data.handoff_complete_at,
  };
}

// ── 9 · connections inventory · record_intake extension ───────────────────
const CONNECTION_ROLES = new Set(["personal", "professional", "both"]);
const CONNECTION_STATUS = new Set(["not-requested", "pending", "granted", "declined", "revoked"]);

export async function recordConnections(
  admin: Admin,
  cid: string,
  connections: unknown,
): Promise<{ ok: true; recorded: number; connection_ids: string[] } | { ok: false; reason: string }> {
  if (!Array.isArray(connections) || connections.length === 0) return { ok: false, reason: "connections_empty" };
  const rows: any[] = [];
  for (const raw of connections) {
    if (!raw || typeof raw !== "object") return { ok: false, reason: "connections_shape_invalid" };
    const o = raw as any;
    const system_name = str(o.system ?? o.system_name ?? o.name, 80);
    if (!system_name) return { ok: false, reason: "connections_system_missing" };
    const usage_role = (str(o.role ?? o.usage_role, 20).toLowerCase() || "professional");
    if (!CONNECTION_ROLES.has(usage_role)) return { ok: false, reason: "connections_invalid_role" };
    const grant_status = (str(o.grant_status ?? o.status, 20).toLowerCase() || "not-requested");
    if (!CONNECTION_STATUS.has(grant_status)) return { ok: false, reason: "connections_invalid_status" };
    rows.push({
      cid,
      system_name,
      category: str(o.category, 40) || "other",
      usage_role,
      grant_status,
      updated_at: new Date().toISOString(),
    });
  }

  // The unique index is on (cid, lower(system_name)), so reconcile by hand:
  // read what exists, update those, insert the rest. Keeps the tool idempotent.
  const { data: existing } = await admin.from("connection_inventory").select("id, system_name").eq("cid", cid);
  const byName = new Map<string, string>();
  for (const e of Array.isArray(existing) ? existing : []) byName.set(String(e.system_name).toLowerCase(), e.id);

  const ids: string[] = [];
  for (const r of rows) {
    const hit = byName.get(r.system_name.toLowerCase());
    if (hit) {
      const { data, error } = await admin.from("connection_inventory").update(r).eq("id", hit).select("id").maybeSingle();
      if (error) {
        console.error("connection_inventory_update_failed", error.message);
        return { ok: false, reason: "connections_write_failed" };
      }
      if (data?.id) ids.push(data.id);
    } else {
      const { data, error } = await admin.from("connection_inventory").insert(r).select("id").maybeSingle();
      if (error) {
        console.error("connection_inventory_insert_failed", error.message);
        return { ok: false, reason: "connections_write_failed" };
      }
      if (data?.id) ids.push(data.id);
    }
  }

  await signal(admin, cid, "connection_inventory", ids[0] ?? null, "connections_recorded", `${ids.length} systems inventoried`);
  return { ok: true, recorded: ids.length, connection_ids: ids };
}
