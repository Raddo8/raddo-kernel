import { useEffect, useState, useCallback, useRef } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/PageHeader";
import { AlertTriangle, CheckCircle2, ShieldAlert, RefreshCw } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface HealthData {
  stuck_count: number;
  stuck_threshold_minutes: number;
  completed_1h: number;
  failed_1h: number;
  avg_exec_latency_seconds: number;
  avg_queue_latency_seconds: number;
  completed_24h: number;
  failed_24h: number;
  webhook_events_24h: Record<string, number>;
  recent_failures: Array<{
    id: string;
    type: string;
    channel: string;
    error_summary: string;
    executed_at: string;
  }>;
}

type FetchState = "ok" | "loading" | "error" | "access_denied";

const BASE_INTERVAL = 30_000;
const MAX_INTERVAL = 300_000;

export default function SchedulerHealth() {
  const { workspace, loading } = useWorkspace();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>("loading");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [retryMs, setRetryMs] = useState(BASE_INTERVAL);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchHealth = useCallback(async () => {
    if (!workspace) return;

    try {
      const { data, error } = await supabase.rpc("get_scheduler_health", {
        p_workspace_id: workspace.id,
      });

      if (error) {
        setFetchState("error");
        setRetryMs((prev) => Math.min(prev * 2, MAX_INTERVAL));
        return;
      }

      if (data && typeof data === "object" && "error" in data && data.error === "access_denied") {
        setFetchState("access_denied");
        return;
      }

      setHealth(data as unknown as HealthData);
      setFetchState("ok");
      setLastUpdated(new Date());
      setRetryMs(BASE_INTERVAL);
    } catch {
      setFetchState("error");
      setRetryMs((prev) => Math.min(prev * 2, MAX_INTERVAL));
    }
  }, [workspace]);

  useEffect(() => {
    if (!workspace || loading) return;
    fetchHealth();
  }, [workspace, loading, fetchHealth]);

  useEffect(() => {
    if (fetchState === "access_denied" || !workspace) return;

    timerRef.current = setTimeout(() => {
      fetchHealth();
    }, retryMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchState, retryMs, fetchHealth, workspace, lastUpdated]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const isStale = fetchState === "error" && lastUpdated;
  const retrySeconds = Math.round(retryMs / 1000);

  return (
    <div>
      <PageHeader title="Scheduler Health" subtitle="Engine observability" />
      <div className="p-6 space-y-6">
        {/* Status banners */}
        {fetchState === "access_denied" && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Permission denied</AlertTitle>
            <AlertDescription>You don't have access to this workspace's health data. Contact your workspace admin.</AlertDescription>
          </Alert>
        )}

        {fetchState === "error" && (
          <Alert className="border-[hsl(var(--status-amber))] bg-[hsl(var(--status-amber)/0.1)]">
            <AlertTriangle className="h-4 w-4 text-[hsl(var(--status-amber))]" />
            <AlertTitle className="text-[hsl(var(--status-amber-foreground))]">
              {lastUpdated ? "Data stale" : "Failed to load health data"}
            </AlertTitle>
            <AlertDescription className="text-muted-foreground">
              {lastUpdated
                ? `Last updated ${formatDistanceToNow(lastUpdated)} ago.`
                : "Could not connect."}{" "}
              Retrying in {retrySeconds}s.
            </AlertDescription>
          </Alert>
        )}

        {/* Last refreshed */}
        {lastUpdated && fetchState !== "access_denied" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <RefreshCw size={12} />
            Last refreshed: {format(lastUpdated, "HH:mm:ss")}
          </div>
        )}

        {health && (
          <>
            {/* Row 1: 4 metric cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                label="STUCK ACTIONS"
                value={health.stuck_count}
                subtitle={`threshold: ${health.stuck_threshold_minutes}m`}
                status={health.stuck_count > 0 ? "red" : "green"}
              />
              <MetricCard
                label="COMPLETED (1H)"
                value={health.completed_1h}
                status="green"
              />
              <MetricCard
                label="FAILED (1H)"
                value={health.failed_1h}
                status={health.failed_1h > 0 ? "red" : "green"}
              />
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-mono text-muted-foreground">LATENCY (1H)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Exec</span>
                      <span className="text-lg font-bold font-mono">{health.avg_exec_latency_seconds}s</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Queue</span>
                      <span className="text-lg font-bold font-mono">{health.avg_queue_latency_seconds}s</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Row 2: 2 wider cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-mono text-muted-foreground">24H THROUGHPUT</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Completed:</span>
                      <span className="text-xl font-bold font-mono text-[hsl(var(--status-green))]">{health.completed_24h}</span>
                    </div>
                    <span className="text-muted-foreground">/</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Failed:</span>
                      <span className={`text-xl font-bold font-mono ${health.failed_24h > 0 ? "text-[hsl(var(--status-red))]" : "text-muted-foreground"}`}>
                        {health.failed_24h}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-mono text-muted-foreground">WEBHOOK EVENTS (24H)</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.keys(health.webhook_events_24h).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No webhook events</p>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(health.webhook_events_24h).map(([type, count]) => (
                        <div key={type} className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">{type}:</span>
                          <span className="text-sm font-bold font-mono">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Row 3: Recent Failures */}
            <div className="border border-border rounded-md">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold font-mono">RECENT FAILURES</h3>
              </div>
              {health.recent_failures.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <CheckCircle2 size={20} className="mx-auto mb-2 text-[hsl(var(--status-green))]" />
                  <p className="text-xs text-muted-foreground">No recent failures</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-mono text-xs">Type</TableHead>
                      <TableHead className="font-mono text-xs">Channel</TableHead>
                      <TableHead className="font-mono text-xs">Error</TableHead>
                      <TableHead className="font-mono text-xs">Executed At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {health.recent_failures.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-mono text-xs">{f.type}</TableCell>
                        <TableCell className="font-mono text-xs">{f.channel ?? "—"}</TableCell>
                        <TableCell className="text-xs max-w-[300px] truncate" title={f.error_summary}>
                          {f.error_summary}
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {f.executed_at ? format(new Date(f.executed_at), "MMM d HH:mm:ss") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        )}

        {fetchState === "loading" && !health && (
          <div className="text-center py-12 text-muted-foreground text-sm">Loading health data...</div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtitle,
  status,
}: {
  label: string;
  value: number;
  subtitle?: string;
  status: "green" | "red";
}) {
  const color =
    status === "green" ? "text-[hsl(var(--status-green))]" : "text-[hsl(var(--status-red))]";
  const Icon = status === "green" ? CheckCircle2 : AlertTriangle;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-mono text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Icon size={20} className={color} />
          <span className={`text-2xl font-bold font-mono ${color}`}>{value}</span>
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
