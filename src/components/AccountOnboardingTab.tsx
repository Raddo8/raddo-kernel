/**
 * AccountDetail onboarding tab · summarizes checklist progress + linked builds.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  KERNEL_PHASES, loadChecklistByAccount, seedChecklist, progress,
  type ChecklistRow,
} from "@/lib/onboarding";
import { listBuildsForAccount, BUILD_STATUSES, type ProjectBuild } from "@/lib/project-builds";
import { Button } from "@/components/ui/button";
import { Plus, Hammer } from "lucide-react";
import ProjectBuildDialog from "@/components/dialogs/ProjectBuildDialog";

interface Props { workspaceId: string; accountId: string; }

export default function AccountOnboardingTab({ workspaceId, accountId }: Props) {
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [builds, setBuilds] = useState<ProjectBuild[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    await seedChecklist(workspaceId, accountId);
    setRows(await loadChecklistByAccount(accountId));
    setBuilds(await listBuildsForAccount(accountId));
  };
  useEffect(() => { load(); }, [workspaceId, accountId]);

  const overall = progress(rows);

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Kernel · overall</h3>
          <Link to="/app/onboarding/kernel" className="text-[10px] font-mono text-dossier-brass hover:underline">Open board →</Link>
        </div>
        <div className="h-1.5 bg-muted rounded overflow-hidden">
          <div className="h-full bg-dossier-brass" style={{ width: `${overall.pct}%` }} />
        </div>
        <div className="text-[10px] font-mono text-muted-foreground mt-1">{overall.done}/{overall.total} · {overall.pct}%</div>
      </div>
      <div className="space-y-1">
        {KERNEL_PHASES.map(p => {
          const pr = progress(rows.filter(r => r.phase === p.key));
          if (pr.total === 0) return null;
          return (
            <div key={p.key} className="flex items-center gap-2 text-xs font-mono">
              <span className="w-40 truncate">{p.label}</span>
              <div className="flex-1 h-1 bg-muted rounded overflow-hidden">
                <div className="h-full bg-dossier-brass" style={{ width: `${pr.pct}%` }} />
              </div>
              <span className="text-muted-foreground w-16 text-right">{pr.done}/{pr.total}</span>
            </div>
          );
        })}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Hammer size={12} /> Project builds
          </h3>
          <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setAddOpen(true)}>
            <Plus size={11} className="mr-1" /> add
          </Button>
        </div>
        {builds.length === 0 ? (
          <div className="text-xs text-muted-foreground">No builds yet.</div>
        ) : (
          <div className="space-y-1">
            {builds.map(b => {
              const s = BUILD_STATUSES.find(x => x.key === b.status);
              return (
                <div key={b.id} className="text-xs font-mono border border-border rounded px-2 py-1 flex items-center gap-2">
                  <span className="flex-1 truncate">{b.title}</span>
                  <span className="text-[10px] text-muted-foreground">{b.kind.replace(/_/g," ")}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: s?.color, color: s?.color }}>
                    {s?.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ProjectBuildDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultAccountId={accountId}
        onCreated={load}
      />
    </div>
  );
}
