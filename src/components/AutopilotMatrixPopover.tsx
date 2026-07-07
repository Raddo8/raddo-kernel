/**
 * Compact popover to configure the per-state autopilot matrix.
 * Used in the Pursuit Board header (workspace default) and inside the
 * Pursuit slide-out (per-pursuit override).
 */
import { useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";
import {
  AUTOPILOT_ORDER_TYPES, DEFAULT_AUTOPILOT_MATRIX, resolveMatrix, labelFor,
  type AutopilotMatrix, type AutopilotMode,
} from "@/lib/autopilot-matrix";
import type { WorkOrderType } from "@/lib/work-orders";
import { cn } from "@/lib/utils";

interface Props {
  /** Effective matrix source (workspace or workspace+item). */
  workspaceMatrix?: AutopilotMatrix | null;
  itemMatrix?: AutopilotMatrix | null;
  /** Whether this popover edits the workspace default or per-item override. */
  scope: "workspace" | "item";
  onChange: (matrix: AutopilotMatrix) => void | Promise<void>;
  triggerLabel?: string;
}

const MODES: AutopilotMode[] = ["auto", "assist", "manual"];

export default function AutopilotMatrixPopover({
  workspaceMatrix, itemMatrix, scope, onChange, triggerLabel,
}: Props) {
  const effective = useMemo(
    () => resolveMatrix({ workspaceMatrix, itemMatrix }),
    [workspaceMatrix, itemMatrix],
  );
  const source: AutopilotMatrix = (scope === "workspace" ? workspaceMatrix : itemMatrix) || {};

  const counts = useMemo(() => {
    const c = { auto: 0, assist: 0, manual: 0 } as Record<AutopilotMode, number>;
    for (const t of AUTOPILOT_ORDER_TYPES) c[effective[t]]++;
    return c;
  }, [effective]);

  const setMode = async (t: WorkOrderType, m: AutopilotMode | null) => {
    const next: AutopilotMatrix = { ...source };
    if (m === null) delete (next as any)[t];
    else (next as any)[t] = m;
    await onChange(next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 font-mono text-[11px]">
          <Zap size={12} className="mr-1" />
          {triggerLabel || `Autopilot · ${counts.auto} auto · ${counts.assist} assist · ${counts.manual} manual`}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="px-3 py-2 border-b border-border">
          <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            {scope === "workspace" ? "Workspace autopilot matrix" : "Pursuit autopilot override"}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground mt-1">
            AUTO auto-queues on state entry and auto-applies completed state moves.
            ASSIST auto-queues but pauses at Approvals. MANUAL queues on click.
            Email sends always require approval.
          </div>
        </div>
        <div className="divide-y divide-border">
          {AUTOPILOT_ORDER_TYPES.map(t => {
            const eff = effective[t];
            const explicit = (source as any)[t] as AutopilotMode | undefined;
            const isOverride = scope === "item" && explicit != null;
            const isWorkspaceDefault = scope === "workspace";
            return (
              <div key={t} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono truncate">{labelFor(t)}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">
                    default · {DEFAULT_AUTOPILOT_MATRIX[t]}
                    {scope === "item" && !isOverride ? " · inheriting workspace" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {MODES.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(t, m)}
                      className={cn(
                        "text-[10px] font-mono px-1.5 py-0.5 rounded border",
                        (isWorkspaceDefault ? explicit === m : explicit === m)
                          ? "border-dossier-brass text-dossier-brass"
                          : eff === m && !explicit
                            ? "border-dossier-brass/40 text-dossier-brass/70"
                            : "border-border text-muted-foreground hover:border-dossier-brass/40",
                      )}
                    >{m}</button>
                  ))}
                  {scope === "item" && isOverride && (
                    <button
                      type="button"
                      onClick={() => setMode(t, null)}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:border-destructive/50"
                      title="Clear override · inherit workspace"
                    >clear</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
