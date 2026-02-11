import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import StatusBadge from "@/components/StatusBadge";
import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";

function normalizeEventType(raw: string): string {
  return raw.startsWith("email.") ? raw.slice(6) : raw;
}

interface ActionInspectorDrawerProps {
  action: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ActionInspectorDrawer({ action, open, onOpenChange }: ActionInspectorDrawerProps) {
  const [events, setEvents] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  useEffect(() => {
    if (!action || !open) {
      setEvents([]);
      return;
    }
    fetchEvents();
  }, [action?.id, open]);

  const fetchEvents = async () => {
    if (!action) return;
    setLoadingEvents(true);

    // Primary: by action_id
    const { data: primary } = await supabase
      .from("message_events")
      .select("*")
      .eq("action_id", action.id)
      .eq("workspace_id", action.workspace_id)
      .order("occurred_at", { ascending: false })
      .limit(50);

    let merged = primary || [];

    // Fallback: by provider_message_id if primary empty
    if (merged.length === 0 && action.provider_message_id) {
      const { data: fallback } = await supabase
        .from("message_events")
        .select("*")
        .eq("provider_message_id", action.provider_message_id)
        .eq("workspace_id", action.workspace_id)
        .order("occurred_at", { ascending: false })
        .limit(50);

      if (fallback && fallback.length > 0) {
        const seen = new Set(merged.map((e: any) => e.id));
        for (const ev of fallback) {
          if (!seen.has(ev.id)) merged.push(ev);
        }
      }
    }

    setEvents(merged);
    setLoadingEvents(false);
  };

  if (!action) return null;

  const resultJson = action.result_json as Record<string, any> | null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-mono text-sm">Action Inspector</SheetTitle>
          <SheetDescription className="sr-only">Action details and delivery events</SheetDescription>
        </SheetHeader>

        {/* Section 1: Action Details */}
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-medium">{action.type}</span>
            <span className="text-xs text-muted-foreground">{action.channel}</span>
            <StatusBadge status={action.status} />
          </div>

          <div className="space-y-1.5 text-sm">
            {action.items?.title && (
              <Row label="Item" value={`${action.items.title}${action.items?.accounts?.name ? ` · ${action.items.accounts.name}` : ""}`} />
            )}
            {resultJson?.recipient_email && (
              <Row label="Recipient" value={resultJson.recipient_email} />
            )}
            {resultJson?.rendered_subject && (
              <Row label="Subject" value={resultJson.rendered_subject} />
            )}
            {action.provider && (
              <Row label="Provider" value={action.provider} />
            )}
            {action.provider_message_id && (
              <Row label="Message ID" value={action.provider_message_id} mono />
            )}
            <Row label="Created" value={fmt(action.created_at)} />
            {action.scheduled_for && <Row label="Scheduled" value={fmt(action.scheduled_for)} />}
            {action.executed_at && <Row label="Executed" value={fmt(action.executed_at)} />}
          </div>

          {resultJson?.persistence_warning && (
            <div className="flex items-center gap-1.5 text-xs text-status-amber bg-status-amber/10 px-2 py-1 rounded">
              <AlertTriangle size={12} />
              <span>{resultJson.persistence_warning}</span>
            </div>
          )}
        </div>

        {/* Section 2: Message Events */}
        <div className="mt-6">
          <h4 className="text-xs font-semibold font-mono text-muted-foreground mb-2">MESSAGE EVENTS</h4>
          {loadingEvents ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : events.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {action.provider_message_id ? "No delivery events yet" : "No delivery events — action not yet sent"}
            </p>
          ) : (
            <div className="space-y-1">
              {events.map((ev: any) => {
                const normalized = normalizeEventType(ev.event_type);
                return (
                  <div key={ev.id} className="flex items-center justify-between py-1">
                    <span title={ev.event_type}>
                      <StatusBadge status={normalized} />
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {fmt(ev.occurred_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <span className={mono ? "font-mono text-xs break-all" : "break-all"}>{value}</span>
    </div>
  );
}

function fmt(iso: string): string {
  try {
    return format(new Date(iso), "MMM d HH:mm:ss");
  } catch {
    return iso;
  }
}
