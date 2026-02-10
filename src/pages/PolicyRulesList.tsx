import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { ListFilter } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { toast } from "sonner";

interface PolicyRule {
  id: string;
  sort_order: number;
  action_type: string;
  action_channel: string;
  enabled: boolean;
  predicate: unknown;
  requires_approval: boolean;
}

export default function PolicyRulesList() {
  const { workspace } = useWorkspace();
  const [rules, setRules] = useState<PolicyRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspace) return;
    supabase
      .from("policy_rules")
      .select("id, sort_order, action_type, action_channel, enabled, predicate, requires_approval")
      .eq("workspace_id", workspace.id)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .then(({ data }) => {
        setRules((data as PolicyRule[]) || []);
        setLoading(false);
      });
  }, [workspace]);

  const toggleEnabled = async (id: string, current: boolean) => {
    const next = !current;
    // Optimistic update
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: next } : r)));

    const { error } = await supabase
      .from("policy_rules")
      .update({ enabled: next })
      .eq("id", id);

    if (error) {
      // Revert
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: current } : r)));
      toast.error("Failed to update rule");
    } else {
      toast.success("Rule updated");
    }
  };

  const truncate = (obj: unknown, max = 60) => {
    const s = JSON.stringify(obj);
    return s.length > max ? s.slice(0, max) + "…" : s;
  };

  return (
    <div>
      <PageHeader title="Policy Rules" subtitle={`${rules.length} rules`} />
      {loading ? (
        <div className="p-6 text-muted-foreground text-sm">Loading...</div>
      ) : rules.length === 0 ? (
        <EmptyState icon={ListFilter} title="No rules" description="Policy rules automate actions based on item conditions." />
      ) : (
        <div className="p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Order</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Predicate</TableHead>
                <TableHead className="w-24">Enabled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.sort_order}</TableCell>
                  <TableCell className="text-sm">{r.action_type}</TableCell>
                  <TableCell className="text-sm">{r.action_channel}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground max-w-xs truncate">
                    {truncate(r.predicate)}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={r.enabled}
                      onCheckedChange={() => toggleEnabled(r.id, r.enabled)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
