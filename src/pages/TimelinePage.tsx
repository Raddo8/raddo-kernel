import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import { ArrowDownLeft, ArrowUpRight, Cpu, Clock } from "lucide-react";
import { format } from "date-fns";
import EmptyState from "@/components/EmptyState";

const icons = { inbound: ArrowDownLeft, outbound: ArrowUpRight, system: Cpu };
const colors = { inbound: "text-status-blue", outbound: "text-status-green", system: "text-muted-foreground" };

export default function TimelinePage() {
  const { workspace } = useWorkspace();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspace) return;
    supabase
      .from("timeline_events")
      .select("*, accounts!inner(workspace_id, name)")
      .eq("accounts.workspace_id", workspace.id)
      .order("occurred_at", { ascending: false })
      .limit(200)
      .then(({ data }) => { setEvents(data || []); setLoading(false); });
  }, [workspace]);

  return (
    <div>
      <PageHeader title="Timeline" subtitle="All events across accounts" />
      {loading ? (
        <div className="p-6 text-muted-foreground text-sm">Loading...</div>
      ) : events.length === 0 ? (
        <EmptyState icon={Clock} title="No events" description="Timeline events will appear as actions execute." />
      ) : (
        <div className="divide-y divide-border">
          {events.map(ev => {
            const Icon = icons[ev.direction as keyof typeof icons] || Cpu;
            const color = colors[ev.direction as keyof typeof colors] || "text-muted-foreground";
            return (
              <div key={ev.id} className="flex gap-3 px-6 py-3">
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
  );
}
