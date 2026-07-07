/**
 * Onboarding kernel — phases, checklist seeding, progress rollup.
 * Kernel phase is tracked on the client_ops item metadata (kernel_phase).
 * Checklist rows live in public.onboarding_checklist scoped by account_id.
 */
import { supabase } from "@/integrations/supabase/client";
import { writeTimelineEvent } from "@/lib/timeline-events";

export interface KernelPhase {
  key: string;
  label: string;
  defaults: string[];
}

// Canonical 13-column onboarding framework. Order is authoritative.
export const KERNEL_PHASES: KernelPhase[] = [
  { key: "agreement_access", label: "Agreement & Access",
    defaults: [
      "Standard-vs-Regulated designation set",
      "Countersigned agreement",
      "Payment terms confirmed",
      "Access credentials received",
    ] },
  { key: "workspace_scaffold", label: "Workspace Scaffold",
    defaults: [
      "Full CORE built",
      "Rules surface (AGENT-HEADER + registry)",
      "Memory Sync home",
      "Session Log home",
      "Permissions Always-Allow",
    ] },
  { key: "connect_your_world", label: "Connect Your World",
    defaults: [
      "Email",
      "Calendar (+forwarding for secondary inboxes)",
      "Files",
      "Accounting",
      "CRM",
      "Comms",
    ] },
  { key: "storage_files", label: "Storage & Files",
    defaults: [
      "Client's own Box kernel folder readable (identity kernel only · no mutable stores)",
      "Shared Skills-Source folder readable",
    ] },
  { key: "install_skills", label: "Install Operating Skills",
    defaults: [
      "Skill · begin (read from Skills-Source, rebuilt, client Saved, version cross-checked)",
      "Skill · save",
      "Skill · sync",
      "Skill · end",
      "Skill · format",
      "Skill · council",
    ] },
  { key: "gather_foundation", label: "Gather & Foundation",
    defaults: [
      "Rich world-read into the OFFICE",
      "Regulated no-store honored",
    ] },
  { key: "gather_packet_gate", label: "Gather Packet Gate",
    defaults: [
      "Packet produced",
      "Single-home checkpoint passed (one Notion home per mutable thing)",
      "No Box mutable seeds lingering (any seed consumed then DELETED)",
    ] },
  { key: "deep_ingest_discovery", label: "Deep Ingest & Discovery",
    defaults: [
      "Full corpus read",
      "Vision/values discovery (inferred vs confirmed flagged)",
    ] },
  { key: "migrate_memory", label: "Migrate Memory",
    defaults: [
      "Migrated into Memory Sync (the one home)",
      "Seed-delete verified",
    ] },
  { key: "domain_build", label: "Domain Build",
    defaults: [
      "Catered domain DBs from the client's real world",
    ] },
  { key: "kernel_assembly", label: "Kernel Assembly",
    defaults: [
      "4-doc kernel built verbatim-from-canon",
      "Identity files to Box under STABLE filenames",
    ] },
  { key: "go_live_gate", label: "Go-Live Gate",
    defaults: [
      "Operator ratifies kernel",
      "Council connector handoff",
      "First /begin greets clean",
      "Client told 'live' only now",
    ] },
  { key: "live", label: "LIVE",
    defaults: [] },
];

export const PHASE_KEYS = KERNEL_PHASES.map(p => p.key);
export const LIVE_PHASE = "live";

export function phaseIndex(key: string): number {
  const i = PHASE_KEYS.indexOf(key);
  return i < 0 ? 0 : i;
}

export function phaseLabel(key: string): string {
  return KERNEL_PHASES.find(p => p.key === key)?.label ?? key;
}

export interface ChecklistRow {
  id: string;
  workspace_id: string;
  account_id: string;
  phase: string;
  label: string;
  done: boolean;
  done_at: string | null;
  note: string | null;
  sort_order: number;
}

/** Idempotent: seed default checklist rows for phases that have none yet. */
export async function seedChecklist(workspaceId: string, accountId: string) {
  const { data: existing } = await (supabase as any)
    .from("onboarding_checklist")
    .select("phase")
    .eq("account_id", accountId);
  const existingPhases = new Set(((existing as any[]) || []).map((r: any) => r.phase));
  const rows: any[] = [];
  for (const p of KERNEL_PHASES) {
    if (existingPhases.has(p.key)) continue;
    let i = 0;
    for (const label of p.defaults) {
      rows.push({
        workspace_id: workspaceId,
        account_id: accountId,
        phase: p.key,
        label,
        sort_order: i++,
      });
    }
  }
  if (rows.length === 0) return { seeded: 0 };
  const { error } = await (supabase as any).from("onboarding_checklist").insert(rows);
  if (error) return { seeded: 0, error: error.message };
  return { seeded: rows.length };
}

export async function loadChecklistByAccount(accountId: string): Promise<ChecklistRow[]> {
  const { data } = await (supabase as any)
    .from("onboarding_checklist")
    .select("*")
    .eq("account_id", accountId)
    .order("phase", { ascending: true })
    .order("sort_order", { ascending: true });
  return ((data as any[]) || []) as ChecklistRow[];
}

export async function loadChecklistForAccounts(accountIds: string[]): Promise<Record<string, ChecklistRow[]>> {
  if (accountIds.length === 0) return {};
  const { data } = await (supabase as any)
    .from("onboarding_checklist")
    .select("*")
    .in("account_id", accountIds)
    .order("phase", { ascending: true })
    .order("sort_order", { ascending: true });
  const out: Record<string, ChecklistRow[]> = {};
  for (const r of ((data as any[]) || []) as ChecklistRow[]) (out[r.account_id] ||= []).push(r);
  return out;
}

export function progress(rows: ChecklistRow[]): { done: number; total: number; pct: number } {
  const total = rows.length;
  const done = rows.filter(r => r.done).length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export async function toggleChecklistItem(row: ChecklistRow, next: boolean, actorEmail?: string | null) {
  const patch: any = { done: next, done_at: next ? new Date().toISOString() : null };
  const { error } = await (supabase as any)
    .from("onboarding_checklist").update(patch).eq("id", row.id);
  if (error) return { ok: false, error: error.message };
  try {
    await writeTimelineEvent({
      accountId: row.account_id,
      direction: "system",
      channel: "system",
      summary: `Checklist ${next ? "checked" : "unchecked"} · ${row.label}`,
      rawJson: { phase: row.phase, label: row.label, actor: actorEmail || null },
    });
  } catch {}
  return { ok: true };
}

export async function addChecklistItem(args: { workspaceId: string; accountId: string; phase: string; label: string }) {
  const { data } = await (supabase as any).from("onboarding_checklist").insert({
    workspace_id: args.workspaceId,
    account_id: args.accountId,
    phase: args.phase,
    label: args.label,
  }).select("*").single();
  return data as ChecklistRow | null;
}

export async function deleteChecklistItem(id: string) {
  await (supabase as any).from("onboarding_checklist").delete().eq("id", id);
}

/** Move a client_ops item to a new kernel_phase (stored in metadata) + timeline. */
export async function setKernelPhase(args: {
  itemId: string;
  accountId: string;
  workspaceId: string;
  phase: string;
}) {
  const { data: cur } = await supabase.from("items")
    .select("metadata").eq("id", args.itemId).maybeSingle();
  const meta = { ...((cur as any)?.metadata || {}), kernel_phase: args.phase };
  const { error } = await supabase.from("items").update({ metadata: meta }).eq("id", args.itemId);
  if (error) return { ok: false, error: error.message };
  await writeTimelineEvent({
    accountId: args.accountId,
    itemId: args.itemId,
    direction: "system",
    channel: "system",
    summary: `Kernel phase → ${phaseLabel(args.phase)}`,
    rawJson: { kernel_phase: args.phase },
  });
  // LIVE flips the client_ops item to client_active.
  if (args.phase === LIVE_PHASE) {
    const { data: st } = await supabase.from("item_states")
      .select("id, name, label").eq("workspace_id", args.workspaceId).eq("name", "client_active").maybeSingle();
    if (st) {
      await supabase.from("items").update({ state_id: (st as any).id }).eq("id", args.itemId);
      await writeTimelineEvent({
        accountId: args.accountId,
        itemId: args.itemId,
        direction: "system",
        channel: "system",
        summary: "Kernel LIVE · client marked Active",
      });
    }
  }
  return { ok: true };
}
