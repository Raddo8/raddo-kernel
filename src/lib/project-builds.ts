/**
 * Project builds — a client can have many. Each carries a status column and
 * an optional link to a revenue_schedule (milestone payment).
 */
import { supabase } from "@/integrations/supabase/client";
import { writeTimelineEvent } from "@/lib/timeline-events";
import { queueAction } from "@/lib/queue-actions";

export type ProjectBuildKind = "mini_site" | "platform" | "module" | "integration" | "other";
export type ProjectBuildStatus =
  | "specd" | "in_build" | "internal_qa" | "client_review" | "deployed" | "maintained";

export interface ProjectBuild {
  id: string;
  workspace_id: string;
  account_id: string;
  title: string;
  description: string | null;
  kind: ProjectBuildKind;
  revenue_schedule_id: string | null;
  status: ProjectBuildStatus;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export const BUILD_STATUSES: { key: ProjectBuildStatus; label: string; color: string }[] = [
  { key: "specd",         label: "Spec'd",         color: "#8a7f6a" },
  { key: "in_build",      label: "In Build",       color: "#c48a2c" },
  { key: "internal_qa",   label: "Internal QA",    color: "#c48a2c" },
  { key: "client_review", label: "Client Review",  color: "#c48a2c" },
  { key: "deployed",      label: "Deployed",       color: "#4b8f52" },
  { key: "maintained",    label: "Maintained",     color: "#4b8f52" },
];

export const BUILD_KINDS: { key: ProjectBuildKind; label: string }[] = [
  { key: "mini_site",   label: "Mini-site" },
  { key: "platform",    label: "Platform" },
  { key: "module",      label: "Module" },
  { key: "integration", label: "Integration" },
  { key: "other",       label: "Other" },
];

export async function listBuilds(workspaceId: string): Promise<ProjectBuild[]> {
  const { data } = await (supabase as any).from("project_builds")
    .select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
  return ((data as any[]) || []) as ProjectBuild[];
}

export async function listBuildsForAccount(accountId: string): Promise<ProjectBuild[]> {
  const { data } = await (supabase as any).from("project_builds")
    .select("*").eq("account_id", accountId).order("created_at", { ascending: false });
  return ((data as any[]) || []) as ProjectBuild[];
}

export async function createBuild(args: {
  workspaceId: string; accountId: string; title: string; description?: string;
  kind: ProjectBuildKind; revenue_schedule_id?: string | null;
}) {
  const { data, error } = await (supabase as any).from("project_builds").insert({
    workspace_id: args.workspaceId,
    account_id: args.accountId,
    title: args.title.trim(),
    description: args.description?.trim() || null,
    kind: args.kind,
    revenue_schedule_id: args.revenue_schedule_id || null,
  }).select("*").single();
  if (error) return { ok: false as const, error: error.message };
  await writeTimelineEvent({
    accountId: args.accountId,
    direction: "system",
    channel: "system",
    summary: `Project build created · ${args.title}`,
    rawJson: { build_id: (data as any).id, kind: args.kind },
  });
  return { ok: true as const, build: data as ProjectBuild };
}

export async function setBuildStatus(build: ProjectBuild, status: ProjectBuildStatus) {
  const prev = build.status;
  const { error } = await (supabase as any).from("project_builds")
    .update({ status }).eq("id", build.id);
  if (error) return { ok: false, error: error.message };

  await writeTimelineEvent({
    accountId: build.account_id,
    direction: "system",
    channel: "system",
    summary: `Build status · ${build.title} → ${BUILD_STATUSES.find(s => s.key === status)?.label || status}`,
    rawJson: { build_id: build.id, from: prev, to: status },
  });

  // Deployed: if a linked expected schedule exists, queue an "invoice milestone" internal task.
  if (status === "deployed" && build.revenue_schedule_id) {
    const { data: sch } = await (supabase as any).from("revenue_schedules")
      .select("id, status, description, amount_usd, item_id")
      .eq("id", build.revenue_schedule_id).maybeSingle();
    if (sch && (sch as any).status === "expected") {
      try {
        await queueAction({
          itemId: (sch as any).item_id || build.id,
          type: "internal_task",
          channel: "system",
          source: "system",
          payloadJson: {
            task: "invoice_milestone",
            note: `Invoice milestone · ${build.title} · ${(sch as any).description || "revenue schedule"}`,
            build_id: build.id,
            revenue_schedule_id: build.revenue_schedule_id,
          },
          idempotencyKey: `invoice_milestone:${build.id}`,
        });
      } catch (e) { console.warn("invoice_milestone queue failed", e); }
    }
  }
  return { ok: true };
}
