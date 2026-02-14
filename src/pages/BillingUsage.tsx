import { useEffect, useState, useCallback } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import PageHeader from "@/components/PageHeader";
import { ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface UsageData {
  plan: string;
  monthly_action_limit: number;
  current_period: string;
  total_used: number;
  remaining: number;
  by_channel: Record<string, number>;
  daily: Array<{ date: string; count: number }>;
}

type FetchState = "ok" | "loading" | "error" | "access_denied";

export default function BillingUsage() {
  const { workspace, loading } = useWorkspace();
  const [data, setData] = useState<UsageData | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>("loading");

  const fetchUsage = useCallback(async () => {
    if (!workspace) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setFetchState("error"); return; }

      const res = await supabase.functions.invoke("billing-usage", {
        body: { workspace_id: workspace.id },
      });

      if (res.error) { setFetchState("error"); return; }

      const json = res.data;
      if (json?.error === "access_denied") { setFetchState("access_denied"); return; }

      setData(json as UsageData);
      setFetchState("ok");
    } catch {
      setFetchState("error");
    }
  }, [workspace]);

  useEffect(() => {
    if (!workspace || loading) return;
    fetchUsage();
  }, [workspace, loading, fetchUsage]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const periodLabel = data
    ? format(new Date(data.current_period + "-01"), "MMMM yyyy")
    : "";

  const usagePercent = data
    ? Math.min(100, Math.round((data.total_used / data.monthly_action_limit) * 100))
    : 0;

  const channelEntries = data
    ? Object.entries(data.by_channel).filter(([, v]) => v > 0)
    : [];

  return (
    <div>
      <PageHeader title="Usage" subtitle="Billing period metrics" />
      <div className="p-6 space-y-6">
        {fetchState === "access_denied" && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Permission denied</AlertTitle>
            <AlertDescription>You don't have access to this workspace's billing data.</AlertDescription>
          </Alert>
        )}

        {fetchState === "error" && (
          <Alert variant="destructive">
            <AlertTitle>Failed to load usage data</AlertTitle>
            <AlertDescription>Could not connect to the billing service.</AlertDescription>
          </Alert>
        )}

        {fetchState === "loading" && !data && (
          <div className="text-center py-12 text-muted-foreground text-sm">Loading usage data...</div>
        )}

        {data && (
          <>
            {/* Plan card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-mono text-muted-foreground">PLAN</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-xl font-bold font-mono capitalize">{data.plan}</span>
                <span className="text-muted-foreground mx-2">—</span>
                <span className="text-sm text-muted-foreground">{periodLabel}</span>
              </CardContent>
            </Card>

            {/* Usage meter */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-mono text-muted-foreground">USAGE</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={usagePercent} className="h-3" />
                <div className="flex justify-between text-sm font-mono">
                  <span>{data.total_used} / {data.monthly_action_limit} actions</span>
                  <span className="text-muted-foreground">{data.remaining} remaining</span>
                </div>
              </CardContent>
            </Card>

            {/* Channel breakdown */}
            {channelEntries.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-mono text-muted-foreground">BY CHANNEL</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-mono text-xs">Channel</TableHead>
                        <TableHead className="font-mono text-xs text-right">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {channelEntries.map(([ch, count]) => (
                        <TableRow key={ch}>
                          <TableCell className="font-mono text-sm capitalize">{ch}</TableCell>
                          <TableCell className="font-mono text-sm text-right">{count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Daily usage chart */}
            {data.daily.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-mono text-muted-foreground">DAILY USAGE (30 DAYS)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.daily}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => format(new Date(v), "MMM d")}
                          className="text-muted-foreground"
                        />
                        <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ fontSize: 12 }}
                          labelFormatter={(v) => format(new Date(v as string), "MMM d, yyyy")}
                        />
                        <Line
                          type="monotone"
                          dataKey="count"
                          name="Actions"
                          className="stroke-primary"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
