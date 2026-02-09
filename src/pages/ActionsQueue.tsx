import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Zap, Play, Check, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function ActionsQueue() {
  const { workspace } = useWorkspace();
  const [actions, setActions] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const fetchActions = async () => {
    if (!workspace) return;
    // Get all actions for items in this workspace
    let query = supabase
      .from("actions")
      .select("*, items!inner(workspace_id, title, account_id, accounts(name))")
      .eq("items.workspace_id", workspace.id)
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

  const executeAction = async (action: any) => {
    // Mark as running
    await supabase.from("actions").update({ status: "running" }).eq("id", action.id);
    
    // Mock execution: simulate send
    await new Promise(r => setTimeout(r, 500));
    
    // Mark completed and log timeline
    const { error } = await supabase.from("actions").update({
      status: "completed",
      executed_at: new Date().toISOString(),
      result_json: { mock: true, message: "Simulated execution" },
    }).eq("id", action.id);

    if (!error) {
      // Write timeline event
      const item = action.items;
      await supabase.from("timeline_events").insert({
        account_id: item.account_id,
        item_id: action.item_id,
        direction: "outbound",
        channel: action.channel,
        summary: `Action executed: ${action.type}`,
        body: `Mock ${action.channel} action completed`,
      });
      toast.success("Action executed");
    }
    fetchActions();
  };

  const approveAction = async (id: string) => {
    await supabase.from("actions").update({ status: "scheduled" }).eq("id", id);
    toast.success("Action approved");
    fetchActions();
  };

  const filters = ["all", "pending_approval", "scheduled", "running", "completed", "failed"];

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
                  <Button size="sm" variant="ghost" onClick={() => approveAction(a.id)}>
                    <Check size={14} className="text-status-green" />
                  </Button>
                )}
                {(a.status === "scheduled" || a.status === "pending_approval") && (
                  <Button size="sm" variant="ghost" onClick={() => executeAction(a)}>
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
