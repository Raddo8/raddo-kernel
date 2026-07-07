/**
 * Per-state autopilot matrix.
 *
 * For each work-order-producing step, the operator picks one of three modes:
 * - AUTO    · auto-queue on state entry AND auto-apply completed state move (except send_email).
 * - ASSIST  · auto-queue on state entry, but completion goes to the Approvals queue.
 * - MANUAL  · no auto-queue; completion still goes to Approvals.
 *
 * send_email approvals are ALWAYS required regardless of mode.
 *
 * Storage: workspace.settings.autopilot_matrix; per-pursuit overrides live at
 * item.metadata.autopilot_matrix.
 */
import type { WorkOrderType } from "@/lib/work-orders";

export type AutopilotMode = "auto" | "assist" | "manual";

export type AutopilotMatrix = Partial<Record<WorkOrderType, AutopilotMode>>;

export const AUTOPILOT_ORDER_TYPES: WorkOrderType[] = [
  "qualify_enrichment",
  "deepdive",
  "build_asset",
  "prepare_send",
  "draft_nudge",
  "revisit",
];

export const DEFAULT_AUTOPILOT_MATRIX: Record<WorkOrderType, AutopilotMode> = {
  qualify_enrichment: "auto",
  deepdive: "auto",
  build_asset: "assist",
  prepare_send: "assist",
  draft_nudge: "auto",
  revisit: "assist",
  kernel_step: "manual",
  project_build: "manual",
};

export function resolveMatrix(args: {
  workspaceMatrix?: AutopilotMatrix | null;
  itemMatrix?: AutopilotMatrix | null;
}): Record<WorkOrderType, AutopilotMode> {
  const out: Record<string, AutopilotMode> = { ...DEFAULT_AUTOPILOT_MATRIX };
  for (const k of Object.keys(args.workspaceMatrix || {})) {
    const v = (args.workspaceMatrix as any)[k];
    if (v === "auto" || v === "assist" || v === "manual") out[k] = v;
  }
  for (const k of Object.keys(args.itemMatrix || {})) {
    const v = (args.itemMatrix as any)[k];
    if (v === "auto" || v === "assist" || v === "manual") out[k] = v;
  }
  return out as Record<WorkOrderType, AutopilotMode>;
}

export function resolveMode(
  orderType: WorkOrderType,
  workspaceMatrix?: AutopilotMatrix | null,
  itemMatrix?: AutopilotMatrix | null,
): AutopilotMode {
  return resolveMatrix({ workspaceMatrix, itemMatrix })[orderType] ?? "manual";
}

export function summarizeMatrix(matrix: Record<WorkOrderType, AutopilotMode>): string {
  const counts = { auto: 0, assist: 0, manual: 0 };
  for (const t of AUTOPILOT_ORDER_TYPES) counts[matrix[t]] = (counts[matrix[t]] || 0) + 1;
  return `${counts.auto} auto · ${counts.assist} assist · ${counts.manual} manual`;
}

export function labelFor(t: WorkOrderType): string {
  switch (t) {
    case "qualify_enrichment": return "qualify · enrichment";
    case "deepdive": return "deep dive";
    case "build_asset": return "build asset";
    case "prepare_send": return "prepare send";
    case "draft_nudge": return "draft nudge";
    case "revisit": return "revisit";
    case "kernel_step": return "kernel step";
    case "project_build": return "project build";
  }
}
