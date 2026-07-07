import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { CheckSquare, Check, X, ExternalLink, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { differenceInDays, differenceInCalendarDays } from "date-fns";

interface TaskRow {
  id: string; type: string; status: string; payload_json: any; created_at: string;
  item_id: string;
  items?: { id: string; title: string; account_id: string; metadata: any; accounts?: { name: string } | null } | null;
}

const CONTEXTUAL_TASKS = new Set(["follow_up", "re_angle", "revive"]);

interface DueRow {
  id: string; description: string; amount_usd: number | string; kind: string; cadence: string;
  next_due: string; status: string; account_id: string; item_id: string | null;
  accounts?: { name: string } | null;
}

export default function Worklist() {
  const { workspace } = useWorkspace();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [dueSoon, setDueSoon] = useState<DueRow[]>([]);
  const [contextByItem, setContextByItem] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    const { data } = await supabase
      .from("actions")
      .select("id, type, status, payload_json, created_at, item_id, items(id, title, account_id, metadata, accounts(name))")
      .eq("workspace_id", workspace.id)
      .eq("type", "internal_task" as any)
      .in("status", ["pending_approval", "approved", "scheduled"] as any)
      .order("created_at", { ascending: true })
      .limit(200);
    const list = (data || []) as any as TaskRow[];
    setTasks(list);

    // Fetch L2/L4 notes for pursuits referenced by contextual tasks
    const contextualItems = Array.from(new Set(
      list
        .filter(t => CONTEXTUAL_TASKS.has(t.payload_json?.task))
        .map(t => t.item_id)
    ));
    if (contextualItems.length > 0) {
      const { data: notes } = await supabase
        .from("timeline_events")
        .select("item_id, body, summary, raw_json, occurred_at")
        .in("item_id", contextualItems)
        .order("occurred_at", { ascending: false })
        .limit(500);
      const map: Record<string, string> = {};
      for (const n of notes || []) {
        const layer = (n as any).raw_json?.layer;
        const iid = (n as any).item_id as string;
        if ((layer === "L4" || layer === "L2") && !map[iid]) {
          map[iid] = ((n as any).body || (n as any).summary || "").slice(0, 220);
        }
      }
      setContextByItem(map);
    } else {
      setContextByItem({});
    }

    // Revenue schedules due within 7 days (or already overdue).
    const cutoff = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
    const { data: rev } = await (supabase as any)
      .from("revenue_schedules")
      .select("id, description, amount_usd, kind, cadence, next_due, status, account_id, item_id, accounts(name)")
      .eq("workspace_id", workspace.id)
      .not("next_due", "is", null)
      .lte("next_due", cutoff)
      .not("status", "in", "(paid,cancelled)");
    setDueSoon((rev || []) as any);

    setLoading(false);
  }, [workspace]);

  useEffect(() => { load(); }, [load]);

  const complete = async (id: string, dismissed: boolean) => {
    const patch: any = {
      status: "completed",
      executed_at: new Date().toISOString(),
      result_json: dismissed ? { dismissed: true } : { done: true },
    };
    const { error } = await supabase.from("actions").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(dismissed ? "Dismissed" : "Done");
    load();
  };

  // Group by pursuit
  const byPursuit = new Map<string, { title: string; account: string; itemId: string; rows: TaskRow[] }>();
  for (const t of tasks) {
    const key = t.item_id;
    if (!byPursuit.has(key)) {
      byPursuit.set(key, {
        title: t.items?.title || "—",
        account: t.items?.accounts?.name || "—",
        itemId: t.item_id,
        rows: [],
      });
    }
    byPursuit.get(key)!.rows.push(t);
  }

  const fmtUsd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  return (
    <div>
      <PageHeader title="Worklist" subtitle="Open internal tasks grouped by pursuit" />
      {dueSoon.length > 0 && (
        <div className="border-b border-border p-4 bg-muted/10">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
            <DollarSign size={12} /> Revenue due within 7 days
          </div>
          <div className="space-y-1">
            {dueSoon.map(r => {
              const days = differenceInCalendarDays(new Date(r.next_due), new Date());
              const overdue = r.status === "overdue" || days < 0;
              return (
                <Link
                  key={r.id}
                  to="/app/revenue"
                  className={`flex items-center gap-2 text-xs font-mono px-2 py-1 rounded border ${overdue ? "border-status-red/40 text-status-red" : "border-border hover:border-dossier-brass/40"}`}
                >
                  <span className="truncate flex-1">{r.accounts?.name ?? "—"} · {r.description}</span>
                  <span>{fmtUsd(Number(r.amount_usd))}{r.cadence === "monthly" ? "/mo" : ""}</span>
                  <span className="text-muted-foreground">· due {r.next_due} ({overdue ? `${Math.abs(days)}d late` : `${days}d`})</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
      {loading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : byPursuit.size === 0 && dueSoon.length === 0 ? (
        <EmptyState icon={CheckSquare} title="Inbox zero" description="No open internal tasks." />
      ) : byPursuit.size === 0 ? null : (
        <div className="divide-y divide-border">
          {Array.from(byPursuit.values()).map(group => (
            <div key={group.itemId} className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{group.account}</div>
                <div className="text-sm font-medium">{group.title}</div>
                <Button asChild variant="ghost" size="sm" className="ml-auto">
                  <Link to={`/app/items/${group.itemId}`}><ExternalLink size={12} className="mr-1" /> Open pursuit</Link>
                </Button>
              </div>
              <div className="space-y-2">
                {group.rows.map(t => {
                  const taskKey = t.payload_json?.task || t.payload_json?.kind || "task";
                  const days = differenceInDays(new Date(), new Date(t.created_at));
                  const ctx = CONTEXTUAL_TASKS.has(taskKey) ? contextByItem[t.item_id] : null;
                  return (
                    <div key={t.id} className="border border-border rounded p-3 bg-muted/20">
                      <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="px-1.5 py-0.5 border border-border rounded">{taskKey}</span>
                        <span className="text-muted-foreground">{days}d waiting</span>
                        <div className="ml-auto flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => complete(t.id, false)}>
                            <Check size={14} className="mr-1" /> Done
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => complete(t.id, true)}>
                            <X size={14} className="mr-1" /> Dismiss
                          </Button>
                        </div>
                      </div>
                      {ctx && (
                        <div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">
                          {ctx}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
