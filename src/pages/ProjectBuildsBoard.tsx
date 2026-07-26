/**
 * Project Builds Board · /control/builds/projects
 * One card per build. Six columns from Spec'd → Maintained.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Hammer, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { differenceInDays } from "date-fns";
import {
  BUILD_STATUSES, listBuilds, setBuildStatus, type ProjectBuild, type ProjectBuildStatus,
} from "@/lib/project-builds";
import ProjectBuildDialog from "@/components/dialogs/ProjectBuildDialog";
import { fmtUsd } from "@/lib/revenue-math";
import { Link } from "react-router-dom";

export default function ProjectBuildsBoard() {
  const { workspace } = useWorkspace();
  const [builds, setBuilds] = useState<ProjectBuild[]>([]);
  const [accounts, setAccounts] = useState<Record<string, string>>({});
  const [schedules, setSchedules] = useState<Record<string, { description: string; amount: number; status: string }>>({});
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    const list = await listBuilds(workspace.id);
    setBuilds(list);
    const accountIds = Array.from(new Set(list.map(b => b.account_id)));
    if (accountIds.length > 0) {
      const { data: accs } = await supabase.from("accounts").select("id, name").in("id", accountIds);
      const m: Record<string, string> = {};
      for (const a of accs || []) m[(a as any).id] = (a as any).name;
      setAccounts(m);
    }
    const scheduleIds = list.map(b => b.revenue_schedule_id).filter(Boolean) as string[];
    if (scheduleIds.length > 0) {
      const { data: sch } = await (supabase as any).from("revenue_schedules")
        .select("id, description, amount_usd, status").in("id", scheduleIds);
      const m: Record<string, { description: string; amount: number; status: string }> = {};
      for (const s of sch || []) m[(s as any).id] = {
        description: (s as any).description || "milestone",
        amount: Number((s as any).amount_usd || 0),
        status: (s as any).status,
      };
      setSchedules(m);
    }
    setLoading(false);
  }, [workspace]);

  useEffect(() => { load(); }, [load]);

  const columns = useMemo(() => {
    const grouped: Record<string, ProjectBuild[]> = {};
    for (const b of builds) (grouped[b.status] ||= []).push(b);
    return BUILD_STATUSES.map(s => ({ status: s, items: grouped[s.key] || [] }));
  }, [builds]);

  const onDrop = async (e: React.DragEvent, status: ProjectBuildStatus) => {
    e.preventDefault();
    const id = dragId; setDragId(null);
    if (!id) return;
    const build = builds.find(b => b.id === id);
    if (!build || build.status === status) return;
    const prev = build.status;
    setBuilds(list => list.map(b => b.id === id ? { ...b, status } : b));
    const res = await setBuildStatus(build, status);
    if (!res.ok) {
      setBuilds(list => list.map(b => b.id === id ? { ...b, status: prev } : b));
      toast.error(res.error || "Move blocked");
      return;
    }
    if (status === "deployed" && build.revenue_schedule_id) toast.success("Deployed · invoice milestone task queued");
    else toast.success("Moved");
    load();
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Project Builds"
        subtitle="Client builds · mini-sites, platforms, modules, integrations"
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus size={14} className="mr-1" /> Add build
          </Button>
        }
      />
      {loading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : builds.length === 0 ? (
        <EmptyState
          icon={Hammer}
          title="No project builds yet"
          description="Add a build to track it from spec through maintenance."
        />
      ) : (
        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-3 h-full min-w-max">
            {columns.map(({ status, items }) => (
              <div
                key={status.key}
                className="w-72 shrink-0 flex flex-col bg-muted/30 border border-border rounded"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, status.key)}
              >
                <div className="px-3 py-2 border-b border-border flex items-center gap-2 sticky top-0 bg-muted/50 backdrop-blur">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: status.color }} />
                  <span className="text-xs font-mono uppercase tracking-wider">{status.label}</span>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">{items.length}</span>
                </div>
                <div className="p-2 space-y-2 overflow-y-auto">
                  {items.map(b => {
                    const sch = b.revenue_schedule_id ? schedules[b.revenue_schedule_id] : null;
                    const days = differenceInDays(new Date(), new Date(b.updated_at));
                    return (
                      <div
                        key={b.id}
                        draggable
                        onDragStart={() => setDragId(b.id)}
                        onDragEnd={() => setDragId(null)}
                        className="bg-background border border-border rounded p-3 hover:border-dossier-brass/50 transition-colors cursor-grab active:cursor-grabbing"
                      >
                        <div className="text-sm font-medium truncate">{b.title}</div>
                        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground truncate mt-0.5">
                          <Link to={`/control/desk/accounts/${b.account_id}`} className="hover:text-dossier-brass">
                            {accounts[b.account_id] || "—"}
                          </Link>
                          <span> · {b.kind.replace(/_/g, " ")}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[10px] font-mono">
                          {sch && (
                            <span className="px-1.5 py-0.5 border border-dossier-brass/60 text-dossier-brass rounded truncate max-w-[24ch]"
                                  title={`${sch.description} · ${sch.status}`}>
                              {fmtUsd(sch.amount)} · {sch.status}
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 border border-border rounded text-muted-foreground">{days}d</span>
                        </div>
                      </div>
                    );
                  })}
                  {items.length === 0 && <div className="text-[10px] font-mono text-muted-foreground px-1">empty</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <ProjectBuildDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={load}
      />
    </div>
  );
}
