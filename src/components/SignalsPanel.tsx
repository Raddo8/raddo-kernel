import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay } from "date-fns";

interface Props { utmSlug?: string | null; }

export function signalHeat(events: { ts: string }[]): "hot" | "warm" | "cold" {
  const now = Date.now();
  const in48h = events.filter(e => now - new Date(e.ts).getTime() <= 48 * 3600_000).length;
  const in7d = events.filter(e => now - new Date(e.ts).getTime() <= 7 * 86400_000).length;
  if (in48h >= 3) return "hot";
  if (in7d >= 1) return "warm";
  return "cold";
}

export function HeatBadge({ heat }: { heat: "hot" | "warm" | "cold" }) {
  const map = {
    hot: { label: "hot", cls: "bg-raddo-brass/20 text-raddo-brass border-raddo-brass/40" },
    warm: { label: "warm", cls: "bg-raddo-ink/20 text-raddo-ink-soft border-raddo-ink/40" },
    cold: { label: "cold", cls: "bg-muted text-muted-foreground border-border" },
  } as const;
  const m = map[heat];
  return <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${m.cls}`}>{m.label}</span>;
}

export default function SignalsPanel({ utmSlug }: Props) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!utmSlug) { setLoading(false); setEvents([]); return; }
    let active = true;
    supabase
      .from("site_events")
      .select("id, ts, event, route, utm_source, utm_medium, utm_campaign")
      .eq("utm_source", utmSlug)
      .order("ts", { ascending: false })
      .limit(200)
      .then(({ data }) => { if (active) { setEvents(data || []); setLoading(false); } });
    return () => { active = false; };
  }, [utmSlug]);

  const spark = useMemo(() => {
    const buckets = new Array(7).fill(0);
    const now = startOfDay(new Date());
    for (const e of events) {
      const day = startOfDay(new Date(e.ts));
      const diff = Math.round((now.getTime() - day.getTime()) / 86400_000);
      if (diff >= 0 && diff < 7) buckets[6 - diff]++;
    }
    return buckets;
  }, [events]);

  const max = Math.max(1, ...spark);
  const heat = signalHeat(events);

  if (loading) return <div className="p-6 text-xs text-muted-foreground font-mono">Loading signals…</div>;

  if (!utmSlug || events.length === 0) {
    return (
      <div className="p-6 space-y-3 text-sm">
        <div className="flex items-center gap-2"><HeatBadge heat="cold" /> <span className="text-muted-foreground">no signals yet · link tagging active</span></div>
        {utmSlug && <div className="text-xs font-mono text-muted-foreground">utm_source · {utmSlug}</div>}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 text-xs font-mono">
        <HeatBadge heat={heat} />
        <span className="text-muted-foreground">utm_source · {utmSlug}</span>
        <span className="text-muted-foreground">{events.length} events</span>
      </div>

      {/* 7-day sparkline */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Last 7 days</div>
        <div className="flex items-end gap-1 h-16 border border-border rounded p-2 bg-muted/20">
          {spark.map((n, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full bg-raddo-brass/70 rounded-sm" style={{ height: `${(n / max) * 100}%`, minHeight: n > 0 ? 2 : 0 }} />
              <span className="text-[9px] font-mono text-muted-foreground">{n}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Event list */}
      <div className="border border-border rounded divide-y divide-border">
        {events.slice(0, 50).map((e) => (
          <div key={e.id} className="px-3 py-2 text-xs font-mono flex items-center gap-2">
            <span className="text-muted-foreground w-32 shrink-0">{format(new Date(e.ts), "MMM d HH:mm")}</span>
            <span className="w-24 shrink-0">{e.event}</span>
            <span className="flex-1 truncate text-muted-foreground">{e.route}</span>
            {e.utm_campaign && <span className="text-muted-foreground">· {e.utm_campaign}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
