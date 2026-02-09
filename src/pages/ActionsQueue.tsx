import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Zap, Play, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { executeAction } from "@/lib/execute-action";

export default function ActionsQueue() {
  const { workspace, userId } = useWorkspace();
  const [actions, setActions] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const fetchActions = async () => {
    if (!workspace) return;
    // Use workspace_id directly on actions (no join needed for filtering)
    let query = supabase
      .from("actions")
      .select("*, items(title, account_id, accounts(name))")
      .eq("workspace_id", workspace.id as any)
      .order("created_at", { ascending: false })
      .limit(200);

    if (filter !== "all") {
      query = query.eq("status", filter as any);
    }

    const { data } = await query;
    setActions(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchActions(); }, [workspace, filter]);

  const handleApprove = async (id: string) => {
    const { error } = await supabase
      .from("actions")
      .update({ status: "approved" as any })
      .eq("id", id)
      .eq("status", "pending_approval" as any);

    if (error) { toast.error(error.message); return; }
    toast.success("Action approved");
    fetchActions();
  };

  const handleExecute = async (action: any) => {
    const result = await executeAction({
      actionId: action.id,
      actorUserId: userId ?? undefined,
      source: "ui",
    });
    if (!result.success) {
      toast.error(result.error || "Execution failed");
    } else {
      toast.success("Action executed");
    }
    fetchActions();
  };

  const filters = ["all", "pending_approval", "approved", "scheduled", "running", "completed", "failed", "canceled"];

  return (
    <div>
      <PageHeader title="Actions Queue" subtitle="Execute, approve, and monitor actions" />
      
      <div className="flex gap-1 px-6 py-3 border-b border-border overflow-x-auto">
        {filters.map(f => (
          <Button
            key={f}
            variant={filter === f ? "default" : "ghost"}
            size="sm"
            onClick={() => setFilter(f)}
            className="font-mono text-xs"
          >
            {f.replace(/_/g, " ")}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="p-6 text-muted-foreground text-sm">Loading...</div>
      ) : actions.length === 0 ? (
        <EmptyState icon={Zap} title="No actions" description="Actions will appear here when queued from items or playbooks." />
      ) : (
        <div className="divide-y divide-border">
          {actions.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-6 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono">{a.type}</span>
                  <span className="text-xs text-muted-foreground">{a.channel}</span>
                  <StatusBadge status={a.status} />
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {a.items?.title} — {a.items?.accounts?.name}
                  {a.scheduled_for && <span className="ml-2 font-mono">{format(new Date(a.scheduled_for), "MMM d HH:mm")}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {a.status === "pending_approval" && (
                  <Button size="sm" variant="ghost" onClick={() => handleApprove(a.id)}>
                    <Check size={14} className="text-status-green" />
                  </Button>
                )}
                {(a.status === "scheduled" || a.status === "approved") && (
                  <Button size="sm" variant="ghost" onClick={() => handleExecute(a)}>
                    <Play size={14} />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
