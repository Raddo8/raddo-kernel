// supabase/functions/world-graph/index.ts
//
// W1b · THE WORLD GRAPH · resolver + governance lane.
//
// Actions: stage | govern | merge | delta | profile
//
// Law:
//  · world_claims is append-only. Nothing here updates a claim except status.
//  · The cid is derived server-side from the authenticated principal. A cid in
//    the request body is ignored, always.
//  · Rows marked 'privileged' or 'third-party-npi' are never returned.
//    'sensitive' returns only to the owning principal.
//  · stage/govern/merge each write one change_log receipt (write, read back,
//    retry once).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { derivePrincipal, isFailure, readableSensitivities, type Principal } from "./identity.ts";
import { writeReceipt } from "./receipts.ts";

const BUILD_ID = "w1c.1";
const HIDDEN = ["privileged", "third-party-npi"];

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = (supabaseUrl && serviceRole)
  ? createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } })
  : null;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "X-Build-Id": BUILD_ID },
  });

const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) =>
  json({ ok: false, error, ...extra }, status);

type EntitySpec =
  | { entity_id: string }
  | { etype: string; name: string; resolution_keys?: string[] };

type ResolvedRef = { entity_id: string; created: boolean; mode: string; candidate_of?: string | null };

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const sens = (v: unknown): string => {
  const s = str(v) ?? "operational";
  return ["operational", "sensitive", "privileged", "third-party-npi"].includes(s) ? s : "operational";
};

const grade = (v: unknown): string => {
  const s = str(v) ?? "document";
  return ["own-probe", "document", "system-of-record", "spoken", "client-asserted", "inference"].includes(s)
    ? s
    : "document";
};

// ── resolver ───────────────────────────────────────────────────────────────

async function resolveRef(
  cid: string,
  spec: EntitySpec,
  extraClaims: Array<Record<string, unknown>>,
): Promise<ResolvedRef> {
  const direct = str((spec as any).entity_id);
  if (direct) {
    const { data } = await admin!
      .from("world_entities")
      .select("id, merged_into")
      .eq("cid", cid)
      .eq("id", direct)
      .maybeSingle();
    if (!data) throw new Error("entity_not_found_in_tenant");
    return { entity_id: (data.merged_into ?? data.id) as string, created: false, mode: "given" };
  }

  const etype = str((spec as any).etype);
  const name = str((spec as any).name);
  if (!etype || !name) throw new Error("entity_spec_incomplete");
  const keys = Array.isArray((spec as any).resolution_keys)
    ? ((spec as any).resolution_keys as unknown[]).map((k) => String(k)).filter(Boolean)
    : [];

  const { data: res, error: resErr } = await admin!.rpc("world_resolve_entity_v1", {
    p_cid: cid,
    p_etype: etype,
    p_name: name,
    p_keys: keys,
  });
  if (resErr) throw new Error("resolver_failed");

  const mode = String(res?.mode ?? "none");
  const matched = str(res?.entity_id);

  // (a) deterministic attach
  if ((mode === "key" || mode === "exact") && matched) {
    if (keys.length > 0) {
      const { data: cur } = await admin!
        .from("world_entities")
        .select("resolution_keys")
        .eq("cid", cid)
        .eq("id", matched)
        .maybeSingle();
      const existing = Array.isArray(cur?.resolution_keys) ? (cur!.resolution_keys as string[]) : [];
      const merged = Array.from(new Set([...existing, ...keys]));
      if (merged.length !== existing.length) {
        await admin!
          .from("world_entities")
          .update({ resolution_keys: merged, updated_at: new Date().toISOString() })
          .eq("cid", cid)
          .eq("id", matched);
      }
    }
    return { entity_id: matched, created: false, mode };
  }

  // (b) near match -> candidate entity plus a same_as_candidate claim to rule on
  // (c) no match   -> active entity
  const status = mode === "fuzzy" && matched ? "candidate" : "active";
  const { data: made, error: makeErr } = await admin!
    .from("world_entities")
    .insert({ cid, etype, name, status, resolution_keys: keys })
    .select("id")
    .single();
  if (makeErr || !made?.id) throw new Error("entity_create_failed");

  if (status === "candidate" && matched) {
    extraClaims.push({
      subject_id: made.id,
      predicate: "same_as_candidate",
      value_text: matched,
      grade: "inference",
    });
  }

  return {
    entity_id: made.id as string,
    created: true,
    mode: status === "candidate" ? "fuzzy" : "new",
    candidate_of: status === "candidate" ? matched : null,
  };
}

// ── actions ────────────────────────────────────────────────────────────────

async function actionStage(p: Principal, body: any) {
  const source = body?.source ?? {};
  const kind = str(source.kind);
  const label = str(source.label);
  if (!kind) return fail("source_kind_required");

  const miner = str(body?.miner);
  const wave = Number.isFinite(Number(body?.wave)) ? Math.trunc(Number(body.wave)) : 0;
  const claims = Array.isArray(body?.claims) ? body.claims : [];
  if (claims.length === 0) return fail("claims_required");

  // upsert source on (cid, kind, label)
  let sourceId: string;
  let lookup = admin!
    .from("world_sources")
    .select("id, last_wave")
    .eq("cid", p.cid)
    .eq("kind", kind);
  lookup = label === null ? lookup.is("label", null) : lookup.eq("label", label);
  const { data: foundRows } = await lookup.limit(1);
  const found: any = (foundRows ?? [])[0] ?? null;

  const nowIso = new Date().toISOString();
  if (found?.id) {
    sourceId = found.id;
    await admin!
      .from("world_sources")
      .update({ last_wave: Math.max(Number(found.last_wave ?? 0), wave), last_mined_at: nowIso })
      .eq("id", sourceId)
      .eq("cid", p.cid);
  } else {
    const ins = await admin!
      .from("world_sources")
      .insert({ cid: p.cid, kind, label, last_wave: wave, last_mined_at: nowIso })
      .select("id")
      .single();
    if (ins.error || !ins.data?.id) return fail("source_upsert_failed", 500);
    sourceId = ins.data.id;
  }

  const extraClaims: Array<Record<string, unknown>> = [];
  const rows: Array<Record<string, unknown>> = [];
  const entities: ResolvedRef[] = [];

  for (const c of claims) {
    const predicate = str(c?.predicate);
    if (!predicate) return fail("claim_predicate_required");
    let subject: ResolvedRef;
    let object: ResolvedRef | null = null;
    try {
      subject = await resolveRef(p.cid, c?.subject, extraClaims);
      entities.push(subject);
      if (c?.object) {
        object = await resolveRef(p.cid, c.object, extraClaims);
        entities.push(object);
      }
    } catch (e) {
      return fail(e instanceof Error ? e.message : "resolver_failed", 400);
    }

    rows.push({
      cid: p.cid,
      subject_id: subject.entity_id,
      predicate,
      value_text: str(c?.value_text),
      object_id: object?.entity_id ?? null,
      source_id: sourceId,
      source_ref: str(c?.source_ref),
      miner,
      wave,
      grade: grade(c?.grade),
      status: "staged",
      sensitivity: sens(c?.sensitivity),
      confidence: Number.isFinite(Number(c?.confidence)) ? Number(c.confidence) : null,
      valid_from: str(c?.valid_from),
      valid_to: str(c?.valid_to),
    });
  }

  for (const x of extraClaims) {
    rows.push({
      cid: p.cid,
      source_id: sourceId,
      miner,
      wave,
      status: "staged",
      sensitivity: "operational",
      ...x,
    });
  }

  const insClaims = await admin!.from("world_claims").insert(rows).select("id");
  if (insClaims.error) return fail("claim_insert_failed", 500, { detail: insClaims.error.message });
  const claimIds = (insClaims.data ?? []).map((r: any) => r.id);

  const receipt = await writeReceipt(admin, {
    tenant_id: p.cid,
    entity_id: sourceId,
    change: "world.stage",
    actor: "cob",
    summary: `staged ${claimIds.length} claims from ${kind}${label ? ` · ${label}` : ""} wave ${wave}`,
  });

  return json({
    ok: true,
    action: "stage",
    cid: p.cid,
    source_id: sourceId,
    claim_ids: claimIds,
    entities: entities.map((e) => ({
      entity_id: e.entity_id,
      created: e.created,
      mode: e.mode,
      candidate_of: e.candidate_of ?? null,
    })),
    counts: {
      claims: claimIds.length,
      inference_claims: extraClaims.length,
      entities_created: entities.filter((e) => e.created).length,
      entities_matched: entities.filter((e) => !e.created).length,
    },
    receipt,
    build_id: BUILD_ID,
  });
}

/** Receipts must never block the caller. Fire, and let the runtime finish it. */
function receiptAsync(args: Parameters<typeof writeReceipt>[1]) {
  const p = writeReceipt(admin, args).catch((e) =>
    console.error("world_receipt_async_failed", e instanceof Error ? e.message : String(e))
  );
  const wu = (globalThis as any).EdgeRuntime?.waitUntil;
  if (typeof wu === "function") wu.call((globalThis as any).EdgeRuntime, p);
}

/**
 * govern · single or batch.
 *   { claim_id } or { claim_ids: [] }, verdict: confirm | flag | explain | undo
 * Batch writes one status update and one governing insert for the whole set.
 * undo returns the claims to staged and voids their governing claims. Nothing
 * is ever deleted: append-only law holds, status is the only mutated column.
 */
async function actionGovern(p: Principal, body: any) {
  const ids = Array.isArray(body?.claim_ids)
    ? (body.claim_ids as unknown[]).map((x) => str(x)).filter(Boolean) as string[]
    : (str(body?.claim_id) ? [str(body.claim_id) as string] : []);
  // The top-level discriminator is also called "action", so a caller sending
  // { action: "govern" } passes the verdict as "verdict". Both spellings work;
  // "verdict" wins when the discriminator has already claimed "action".
  const action = str(body?.verdict) ?? (str(body?.action) === "govern" ? null : str(body?.action));
  const note = str(body?.note);
  if (ids.length === 0) return fail("claim_id_required");
  if (ids.length > 500) return fail("too_many_claims");
  if (!action || !["confirm", "flag", "explain", "undo"].includes(action)) return fail("invalid_action");

  const { data: claims } = await admin!
    .from("world_claims")
    .select("id, subject_id")
    .eq("cid", p.cid)
    .in("id", ids);
  const found = (claims ?? []) as Array<{ id: string; subject_id: string }>;
  if (found.length === 0) return fail("claim_not_found_in_tenant", 404);
  const foundIds = found.map((c) => c.id);

  const newStatus = action === "confirm" ? "confirmed" : action === "undo" ? "staged" : "flagged";

  const upd = await admin!
    .from("world_claims")
    .update({ status: newStatus })
    .eq("cid", p.cid)
    .in("id", foundIds);
  if (upd.error) return fail("status_update_failed", 500, { detail: upd.error.message });

  // undo voids the governing claims that ruled on these claims.
  let voided: string[] = [];
  if (action === "undo") {
    const govIds = Array.isArray(body?.governing_ids)
      ? (body.governing_ids as unknown[]).map((x) => str(x)).filter(Boolean) as string[]
      : [];
    const voidQ = admin!
      .from("world_claims")
      .update({ status: "voided" })
      .eq("cid", p.cid)
      .eq("predicate", "governs")
      .neq("status", "voided");
    const res = govIds.length > 0
      ? await voidQ.in("id", govIds).select("id")
      : await voidQ.in("subject_id", found.map((c) => c.subject_id)).select("id");
    if (!res.error) voided = (res.data ?? []).map((r: any) => r.id);
  }

  const governing = await admin!
    .from("world_claims")
    .insert(
      found.map((c) => ({
        cid: p.cid,
        subject_id: c.subject_id,
        predicate: "governs",
        value_text: note ? `${action}: ${note}` : action,
        grade: "client-asserted",
        status: "confirmed",
        sensitivity: "operational",
        supersedes: newStatus === "flagged" ? c.id : null,
      })),
    )
    .select("id, subject_id");
  if (governing.error) return fail("governing_claim_failed", 500, { detail: governing.error.message });

  receiptAsync({
    tenant_id: p.cid,
    entity_id: found[0].subject_id,
    change: "world.govern",
    actor: "client",
    summary: `${action} on ${foundIds.length} claim${foundIds.length === 1 ? "" : "s"}${note ? ` · ${note}` : ""}`,
  });

  return json({
    ok: true,
    action: "govern",
    cid: p.cid,
    verdict: action,
    claim_id: foundIds[0],
    claim_ids: foundIds,
    claim_status: newStatus,
    governing_claim_id: (governing.data ?? [])[0]?.id ?? null,
    governing_claim_ids: (governing.data ?? []).map((r: any) => r.id),
    voided_governing_ids: voided,
    count: foundIds.length,
    receipt: { queued: true },
    build_id: BUILD_ID,
  });
}


async function actionMerge(p: Principal, body: any) {
  const entityId = str(body?.entity_id);
  const intoId = str(body?.into_id);
  if (!entityId || !intoId) return fail("entity_id_and_into_id_required");
  if (entityId === intoId) return fail("cannot_merge_into_self");

  const { data: both } = await admin!
    .from("world_entities")
    .select("id, merged_into")
    .eq("cid", p.cid)
    .in("id", [entityId, intoId]);
  const ids = (both ?? []).map((r: any) => r.id);
  if (!ids.includes(entityId) || !ids.includes(intoId)) return fail("entity_not_found_in_tenant", 404);

  const upd = await admin!
    .from("world_entities")
    .update({ merged_into: intoId, status: "merged", updated_at: new Date().toISOString() })
    .eq("cid", p.cid)
    .eq("id", entityId);
  if (upd.error) return fail("merge_failed", 500, { detail: upd.error.message });

  const claim = await admin!
    .from("world_claims")
    .insert({
      cid: p.cid,
      subject_id: entityId,
      predicate: "merged_into",
      value_text: intoId,
      object_id: intoId,
      grade: "client-asserted",
      status: "confirmed",
      sensitivity: "operational",
    })
    .select("id")
    .single();
  if (claim.error) return fail("merge_claim_failed", 500, { detail: claim.error.message });

  const receipt = await writeReceipt(admin, {
    tenant_id: p.cid,
    entity_id: entityId,
    change: "world.merge",
    actor: "client",
    summary: `entity ${entityId} merged into ${intoId}`,
  });

  return json({
    ok: true,
    action: "merge",
    cid: p.cid,
    entity_id: entityId,
    into_id: intoId,
    claim_id: claim.data.id,
    receipt,
    build_id: BUILD_ID,
  });
}

async function actionDelta(p: Principal) {
  const { data, error } = await admin!
    .from("world_delta_v")
    .select("*")
    .eq("cid", p.cid)
    .in("sensitivity", readableSensitivities(p))
    .order("observed_at", { ascending: false })
    .limit(500);
  if (error) return fail("delta_read_failed", 500, { detail: error.message });
  return json({ ok: true, action: "delta", cid: p.cid, rows: data ?? [], count: (data ?? []).length, build_id: BUILD_ID });
}

/** Read-only roster of entities for the caller's cid. Merged entities are
 * withheld (reads follow merged_into one hop, so the survivor stands in). */
async function actionEntities(p: Principal) {
  const allowed = readableSensitivities(p);
  const { data, error } = await admin!
    .from("world_entities")
    .select("id, etype, name, tag, status, sensitivity, merged_into, updated_at")
    .eq("cid", p.cid)
    .is("merged_into", null)
    .in("sensitivity", allowed)
    .order("name", { ascending: true })
    .limit(1000);
  if (error) return fail("entities_read_failed", 500, { detail: error.message });
  return json({
    ok: true,
    action: "entities",
    cid: p.cid,
    rows: data ?? [],
    count: (data ?? []).length,
    build_id: BUILD_ID,
  });
}

/** Read-only roster of mined sources for the caller's cid. */
async function actionSources(p: Principal) {
  const { data, error } = await admin!
    .from("world_sources")
    .select("id, kind, label, scope, connected_at, last_wave, last_mined_at, meta")
    .eq("cid", p.cid)
    .order("last_mined_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) return fail("sources_read_failed", 500, { detail: error.message });
  return json({
    ok: true,
    action: "sources",
    cid: p.cid,
    rows: data ?? [],
    count: (data ?? []).length,
    build_id: BUILD_ID,
  });
}



async function actionProfile(p: Principal, body: any) {
  const entityId = str(body?.entity_id);
  if (!entityId) return fail("entity_id_required");

  const first = await admin!
    .from("world_entities")
    .select("*")
    .eq("cid", p.cid)
    .eq("id", entityId)
    .maybeSingle();
  if (!first.data) return fail("entity_not_found_in_tenant", 404);

  let entity: any = first.data;
  if (entity.merged_into) {
    const hop = await admin!
      .from("world_entities")
      .select("*")
      .eq("cid", p.cid)
      .eq("id", entity.merged_into)
      .maybeSingle();
    if (hop.data) entity = hop.data;
  }

  if (HIDDEN.includes(String(entity.sensitivity))) return fail("entity_withheld", 403);
  if (entity.sensitivity === "sensitive" && !p.owner) return fail("entity_withheld", 403);

  const allowed = readableSensitivities(p);

  const claims = await admin!
    .from("world_claims")
    .select("*")
    .eq("cid", p.cid)
    .eq("subject_id", entity.id)
    .in("status", ["staged", "confirmed"])
    .in("sensitivity", allowed)
    .order("observed_at", { ascending: false })
    .limit(500);
  if (claims.error) return fail("claims_read_failed", 500, { detail: claims.error.message });

  const edges = await admin!
    .from("world_edges")
    .select("*")
    .eq("cid", p.cid)
    .or(`src_id.eq.${entity.id},dst_id.eq.${entity.id}`)
    .limit(500);
  if (edges.error) return fail("edges_read_failed", 500, { detail: edges.error.message });

  return json({
    ok: true,
    action: "profile",
    cid: p.cid,
    entity,
    followed_merge: first.data.id !== entity.id,
    claims: claims.data ?? [],
    edges: edges.data ?? [],
    counts: { claims: (claims.data ?? []).length, edges: (edges.data ?? []).length },
    build_id: BUILD_ID,
  });
}

// ── server ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method === "GET") {
    return json({ ok: true, service: "world-graph", build_id: BUILD_ID, ts: new Date().toISOString() });
  }
  if (req.method !== "POST") return fail("method_not_allowed", 405);
  if (!admin) return fail("admin_client_unavailable", 503);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail("invalid_json");
  }

  const principal = await derivePrincipal(req, admin);
  if (isFailure(principal)) return fail(principal.error, principal.status);

  const action = str(body?.action);
  try {
    switch (action) {
      case "stage": return await actionStage(principal, body);
      case "govern": return await actionGovern(principal, body);
      case "merge": return await actionMerge(principal, body);
      case "delta": return await actionDelta(principal);
      case "profile": return await actionProfile(principal, body);
      case "entities": return await actionEntities(principal);
      case "sources": return await actionSources(principal);
      default: return fail("unknown_action");
    }
  } catch (e) {
    console.error("world_graph_exception", e instanceof Error ? e.message : String(e));
    return fail("internal_error", 500);
  }
});
