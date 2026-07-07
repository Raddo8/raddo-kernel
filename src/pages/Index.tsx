import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useWorkspace } from "@/lib/workspace-context";
import { seedCaseyPack } from "@/lib/seed-casey";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, FileText, Zap, ArrowDownLeft, ArrowUpRight, Cpu } from "lucide-react";
import { format } from "date-fns";
import PageHeader from "@/components/PageHeader";

const icons = { inbound: ArrowDownLeft, outbound: ArrowUpRight, system: Cpu };
const colors = { inbound: "text-status-blue", outbound: "text-status-green", system: "text-muted-foreground" };

export default function Index() {
  const { workspace, loading } = useWorkspace();
  const [seeding, setSeeding] = useState(false);
  const [done, setDone] = useState(false);

  const [accountCount, setAccountCount] = useState(0);
  const [itemCount, setItemCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    if (!workspace || seeding || done) return;
    setSeeding(true);
    seedCaseyPack(workspace.id).then(() => {
      setDone(true);
      setSeeding(false);
    });
  }, [workspace]);

  useEffect(() => {
    if (!workspace || !done && !loading) return;
    if (loading || seeding) return;

    // Fetch stats
    supabase
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace!.id)
      .then(({ count }) => setAccountCount(count ?? 0));

    supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace!.id)
      .then(({ count }) => setItemCount(count ?? 0));

    supabase
      .from("actions")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace!.id)
      .in("status", ["scheduled", "pending_approval", "approved"])
      .then(({ count }) => setPendingCount(count ?? 0));

    // Fetch recent timeline
    supabase
      .from("timeline_events")
      .select("*, accounts!inner(workspace_id, name)")
      .eq("accounts.workspace_id", workspace!.id)
      .order("occurred_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setEvents(data || []));
  }, [workspace, done, loading, seeding]);

  if (loading || seeding) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="font-mono font-bold text-2xl text-primary mb-2">COB</h1>
          <p className="text-sm text-muted-foreground">Setting up your workspace...</p>
        </div>
      </div>
    );
  }

  // BD workspace lands on the pursuit board.
  if ((workspace as any)?.slug === "cob-hq-bd") return <Navigate to="/app/board" replace />;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Workspace overview" />
      <div className="p-6 space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-mono text-muted-foreground">ACCOUNTS</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Building2 size={20} className="text-primary" />
                <span className="text-2xl font-bold font-mono">{accountCount}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-mono text-muted-foreground">ITEMS</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <FileText size={20} className="text-primary" />
                <span className="text-2xl font-bold font-mono">{itemCount}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-mono text-muted-foreground">PENDING ACTIONS</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Zap size={20} className="text-primary" />
                <span className="text-2xl font-bold font-mono">{pendingCount}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <div className="border border-border rounded-md">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold font-mono">RECENT ACTIVITY</h3>
          </div>
          {events.length === 0 ? (
            <p className="px-4 py-6 text-xs text-muted-foreground text-center">No recent activity</p>
          ) : (
            <div className="divide-y divide-border">
              {events.map(ev => {
                const Icon = icons[ev.direction as keyof typeof icons] || Cpu;
                const color = colors[ev.direction as keyof typeof colors] || "text-muted-foreground";
                return (
                  <div key={ev.id} className="flex gap-3 px-4 py-3">
                    <Icon size={16} className={`mt-0.5 shrink-0 ${color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{ev.summary}</span>
                        <span className="text-xs font-mono text-muted-foreground">{ev.channel}</span>
                        {ev.accounts && <span className="text-xs text-muted-foreground">· {ev.accounts.name}</span>}
                      </div>
                      {ev.body && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ev.body}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground font-mono shrink-0">
                      {format(new Date(ev.occurred_at), "MMM d HH:mm")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
