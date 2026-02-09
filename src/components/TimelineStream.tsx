import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowDownLeft, ArrowUpRight, Cpu } from "lucide-react";
import { format } from "date-fns";

const directionIcon = {
  inbound: ArrowDownLeft,
  outbound: ArrowUpRight,
  system: Cpu,
};

const directionColor = {
  inbound: "text-status-blue",
  outbound: "text-status-green",
  system: "text-muted-foreground",
};

export default function TimelineStream({
  accountId,
  itemId,
}: {
  accountId?: string;
  itemId?: string;
}) {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    let query = supabase
      .from("timeline_events")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(100);

    if (accountId) query = query.eq("account_id", accountId);
    if (itemId) query = query.eq("item_id", itemId);

    query.then(({ data }) => setEvents(data || []));
  }, [accountId, itemId]);

  if (events.length === 0) {
    return <div className="p-6 text-sm text-muted-foreground">No events yet</div>;
  }

  return (
    <div className="divide-y divide-border">
      {events.map((ev) => {
        const Icon = directionIcon[ev.direction as keyof typeof directionIcon] || Cpu;
        const color = directionColor[ev.direction as keyof typeof directionColor] || "text-muted-foreground";
        return (
          <div key={ev.id} className="flex gap-3 px-4 py-3">
            <Icon size={16} className={`mt-0.5 shrink-0 ${color}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{ev.summary}</span>
                <span className="text-xs font-mono text-muted-foreground">{ev.channel}</span>
              </div>
              {ev.body && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ev.body}</p>
              )}
            </div>
            <span className="text-xs text-muted-foreground font-mono shrink-0">
              {format(new Date(ev.occurred_at), "MMM d HH:mm")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
