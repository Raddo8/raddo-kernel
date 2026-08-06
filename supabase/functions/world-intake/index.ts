// supabase/functions/world-intake/index.ts
//
// W-INTAKE · COPPS · the deterministic core of the vacuum.
// Categorize is agent-driven and happens BEFORE this call. This function is the
// certifiable half: Organize, Prioritize, Place, Schedule + receipt. Internal
// only (service-role Bearer). Idempotent by idem_key. Append-only. Two clocks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BUILD_ID = "wintake.1";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = (supabaseUrl && serviceRole)
  ? createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } })
  : null;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Build-Id": BUILD_ID } });
const fail = (e: string, s = 400, x: Record<string, unknown> = {}) => json({ ok: false, error: e, ...x }, s);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const GRADES = ["own-probe", "document", "system-of-record", "spoken", "client-asserted", "inference"];
const SENS = ["operational", "sensitive", "privileged", "third-party-npi"];
const CATS = ["architecture", "build", "capability", "client-domain", "correction", "decision", "defect", "diagnosis", "doctrine", "gap", "operations", "people", "product", "security", "synthetic", "verification"];
const grade = (v: unknown) => (GRADES.includes(str(v) ?? "") ? (str(v) as string) : "document");
const sens = (v: unknown) => (SENS.includes(str(v) ?? "") ? (str(v) as string) : "operational");
const cat = (v: unknown): string | null => (CATS.includes(str(v) ?? "") ? (str(v) as string) : null);

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return ("00000000" + h.toString(16)).slice(-8);
}

type Ref = { entity_id?: string; etype?: string; name?: string; resolution_keys?: string[]; sensitivity?: string };

async function resolve(cid: string, spec: Ref): Promise<string> {
  const direct = str(spec?.entity_id);
  if (direct) {
    const { data } = await admin!.from("world_entities").select("id, merged_into").eq("cid", cid).eq("id", direct).maybeSingle();
    if (!data) throw new Error("entity_not_found");
    return (data.merged_into ?? data.id) as string;
  }
  const etype = str(spec?.etype), name = str(spec?.name);
  if (!etype || !name) throw new Error("entity_spec_incomplete");
  const keys = Array.isArray(spec?.resolution_keys) ? spec!.resolution_keys!.map(String).filter(Boolean) : [];
  const { data: res, error } = await admin!.rpc("world_resolve_entity_v1", { p_cid: cid, p_etype: etype, p_name: name, p_keys: keys });
  if (error) throw new Error("resolver_failed");
  const mode = String(res?.mode ?? "none");
  const matched = str(res?.entity_id);
  if ((mode === "key" || mode === "exact") && matched) return matched;
  const status = mode === "fuzzy" && matched ? "candidate" : "active";
  const { data: made, error: mkErr } = await admin!
    .from("world_entities").insert({ cid, etype, name, status, resolution_keys: keys, sensitivity: sens(spec?.sensitivity) })
    .select("id").single();
  if (mkErr || !made?.id) throw new Error("entity_create_failed");
  return made.id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") return json({ ok: true, service: "world-intake", build_id: BUILD_ID });
  if (req.method !== "POST") return fail("method_not_allowed", 405);
  if (!admin) return fail("admin_client_unavailable", 503);

  const auth = req.headers.get("Authorization") ?? "";
  if (auth.replace(/^Bearer\s+/i, "").trim() !== serviceRole) return fail("forbidden", 403);

  let body: any; try { body = await req.json(); } catch { return fail("invalid_json"); }
  const cid = str(body?.cid); if (!cid) return fail("cid_required");
  const source = body?.source ?? {};
  const kind = str(source?.kind); if (!kind) return fail("source_kind_required");
  const label = str(source?.label);
  const ex = body?.extraction ?? {};

  let office = cid;
  {
    const { data: m } = await admin!.from("memory_entries").select("tenant").eq("cid", cid).not("tenant", "is", null).limit(1).maybeSingle();
    if (m?.tenant) office = m.tenant as string;
    else {
      const { data: o } = await admin!.from("onboarding_tenants").select("tenant_key").eq("cid", cid).limit(1).maybeSingle();
      if (o?.tenant_key) office = o.tenant_key as string;
    }
  }

  let src = admin!.from("world_sources").select("id, last_wave, meta").eq("cid", cid).eq("kind", kind);
  src = label === null ? src.is("label", null) : src.eq("label", label);
  const { data: foundRows } = await src.limit(1);
  const found: any = (foundRows ?? [])[0] ?? null;
  const idem = str(body?.idem_key) ?? hash(JSON.stringify({ kind, label, ex }));
  const seen: string[] = Array.isArray(found?.meta?.seen) ? found.meta.seen : [];
  if (seen.includes(idem)) return json({ ok: true, action: "intake", cid, idempotent: true, idem_key: idem, build_id: BUILD_ID });
  const wave = (Number(found?.last_wave ?? 0) || 0) + 1;
  let sourceId: string;
  if (found?.id) {
    sourceId = found.id;
    await admin!.from("world_sources").update({ last_wave: wave, last_mined_at: new Date().toISOString(), meta: { ...(found.meta ?? {}), seen: [...seen, idem].slice(-500) } }).eq("id", sourceId).eq("cid", cid);
  } else {
    const ins = await admin!.from("world_sources").insert({ cid, kind, label, last_wave: wave, last_mined_at: new Date().toISOString(), meta: { seen: [idem] } }).select("id").single();
    if (ins.error || !ins.data?.id) return fail("source_upsert_failed", 500, { detail: ins.error?.message });
    sourceId = ins.data.id;
  }

  const counts = { subjects: 0, claims: 0, typed_edges: 0, loops: 0, decisions: 0, memories: 0, scheduled: 0, unfiled: 0 };
  const subjectSet = new Set<string>();

  try {
    const facts = Array.isArray(ex?.facts) ? ex.facts : [];
    const rels = Array.isArray(ex?.relationships) ? ex.relationships : [];
    const claimRows: any[] = [];
    const typedEdges: any[] = [];

    for (const f of facts) {
      const pred = str(f?.predicate); if (!pred) continue;
      const sId = await resolve(cid, f?.subject); subjectSet.add(sId);
      let oId: string | null = null;
      if (f?.object) { oId = await resolve(cid, f.object); subjectSet.add(oId); }
      claimRows.push({ cid, subject_id: sId, predicate: pred, value_text: str(f?.value_text), object_id: oId, source_id: sourceId, source_ref: str(f?.source_ref), miner: "miner:intake", wave, grade: grade(f?.grade), status: "staged", sensitivity: sens(f?.sensitivity), valid_from: str(f?.valid_from), created_by: "cob:intake" });
    }
    for (const r of rels) {
      const pred = str(r?.predicate); if (!pred || !r?.subject || !r?.object) continue;
      const sId = await resolve(cid, r.subject); const oId = await resolve(cid, r.object);
      subjectSet.add(sId); subjectSet.add(oId);
      claimRows.push({ cid, subject_id: sId, predicate: pred, value_text: str(r?.value_text), object_id: oId, source_id: sourceId, miner: "miner:intake", wave, grade: grade(r?.grade), status: "staged", sensitivity: "operational", created_by: "cob:intake" });
      typedEdges.push({ cid, src_id: sId, dst_id: oId, etype: pred, meta: { pass: "typed_v1", auto: true, from: "intake" } });
    }
    if (claimRows.length) {
      const ins = await admin!.from("world_claims").insert(claimRows).select("id");
      if (ins.error) throw new Error("claim_insert_failed:" + ins.error.message);
      counts.claims = (ins.data ?? []).length;
    }
    if (typedEdges.length) {
      const ins = await admin!.from("world_edges").upsert(typedEdges, { onConflict: "cid,src_id,dst_id,etype", ignoreDuplicates: true }).select("id");
      counts.typed_edges = (ins.data ?? []).length;
    }
    counts.subjects = subjectSet.size;

    const build = await admin!.rpc("world_build_all_v1", { _cid: cid });
    if (build.error) throw new Error("build_failed:" + build.error.message);

    const obligations = Array.isArray(ex?.obligations) ? ex.obligations : [];
    for (const ob of obligations) {
      const title = str(ob?.title); if (!title) continue;
      const r = await admin!.from("open_loops").insert({ tenant: office, cid, title, trigger: str(ob?.blocker) ?? str(ob?.due), owner: str(ob?.owner) ?? "cob", state: "open", brief_status: "open" }).select("id");
      if (!r.error) counts.loops += (r.data ?? []).length;
    }
    const decisions = Array.isArray(ex?.decisions) ? ex.decisions : [];
    for (const d of decisions) {
      const title = str(d?.title); const dm = str(d?.decision_md); if (!title || !dm) continue;
      const r = await admin!.from("decisions").insert({ cid, title, decision_md: dm, rationale_md: str(d?.rationale_md), provenance: "OPERATOR", authoritative: true, decided_by: "cob:intake" }).select("id");
      if (!r.error) counts.decisions += (r.data ?? []).length;
    }

    const place = Array.isArray(ex?.place) ? ex.place : [];
    for (const p of place) {
      const title = str(p?.title); if (!title) continue;
      const lane = str(p?.lane) ?? "Unfiled";
      if (lane === "Unfiled") counts.unfiled++;
      const r = await admin!.from("memory_entries").insert({ cid, tenant: office, category: cat(p?.category), lane, title, body_md: str(p?.body_md), status: "active", created_by: "cob:intake" }).select("id");
      if (!r.error) counts.memories += (r.data ?? []).length;
    }

    for (const ob of obligations) {
      const due = str(ob?.due); const title = str(ob?.title); if (!due || !title) continue;
      const r = await admin!.from("scheduled_actions").insert({ tenant_id: office, title, detail: str(ob?.detail) ?? str(ob?.blocker), run_at: due, status: "scheduled", owner: "cob" }).select("id");
      if (!r.error) counts.scheduled += (r.data ?? []).length;
    }

    await admin!.from("change_log").insert({ tenant_id: cid, entity: "world.intake", entity_id: sourceId, change: "copps", actor: "cob", summary: `COPPS ${kind}${label ? " · " + label : ""} wave ${wave}: ${counts.claims} facts, ${counts.typed_edges} typed, ${counts.loops} loops, ${counts.decisions} decisions, ${counts.memories} filed (${counts.unfiled} unfiled), ${counts.scheduled} scheduled` });

    return json({ ok: true, action: "intake", cid, source: { kind, label }, wave, idem_key: idem, counts, dirty_embed: counts.claims, build_id: BUILD_ID });
  } catch (e) {
    return fail("intake_failed", 500, { detail: e instanceof Error ? e.message : String(e), counts });
  }
});
