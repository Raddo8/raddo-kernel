import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  scheduled: "bg-status-blue/15 text-status-blue",
  running: "bg-status-amber/15 text-status-amber animate-pulse-amber",
  completed: "bg-status-green/15 text-status-green",
  failed: "bg-status-red/15 text-status-red",
  pending_approval: "bg-status-amber/15 text-status-amber",
  active: "bg-status-green/15 text-status-green",
  inactive: "bg-muted text-muted-foreground",
  delivered: "bg-status-green/15 text-status-green",
  bounced: "bg-status-red/15 text-status-red",
  complained: "bg-status-red/15 text-status-red",
  opened: "bg-status-blue/15 text-status-blue",
  clicked: "bg-status-blue/15 text-status-blue",
};

export default function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium",
        statusStyles[status] || "bg-muted text-muted-foreground",
        className
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
