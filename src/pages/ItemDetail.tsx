import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import TimelineStream from "@/components/TimelineStream";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Shield, ArrowRight, AlertTriangle, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/workspace-context";

export default function ItemDetail() {
  const { id } = useParams();
  const { workspace } = useWorkspace();
  const [item, setItem] = useState<any>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [states, setStates] = useState<any[]>([]);
  const [selectedState, setSelectedState] = useState("");

  const fetchItem = async () => {
    if (!id) return;
    const { data } = await supabase
      .from("items")
      .select("*, accounts(id, name), item_states(id, name, label, color), policies(id, name)")
      .eq("id", id)
      .maybeSingle();
    setItem(data);
    if (data?.item_states) setSelectedState(data.item_states.id);
  };

  const fetchActions = async () => {
    if (!id) return;
    const { data } = await supabase
      .from("actions")
      .select("*")
      .eq("item_id", id)
      .order("created_at", { ascending: false });
    setActions(data || []);
  };

  useEffect(() => {
    fetchItem();
    fetchActions();
    if (workspace) {
      supabase.from("item_states").select("*").eq("workspace_id", workspace.id).order("sort_order").then(({ data }) => setStates(data || []));
    }
  }, [id, workspace]);

  const changeState = async (stateId: string) => {
    if (!id || !item) return;
    setSelectedState(stateId);
    const { error } = await supabase.from("items").update({ state_id: stateId }).eq("id", id);
    if (error) { toast.error(error.message); return; }

    // Log state change to timeline
    const state = states.find(s => s.id === stateId);
    await supabase.from("timeline_events").insert({
      account_id: item.account_id || item.accounts?.id,
      item_id: id,
      direction: "system",
      channel: "system",
      summary: `State changed to ${state?.label || 'unknown'}`,
    });

    // Evaluate playbook for this state
    await evaluatePlaybook(stateId);
    fetchItem();
    fetchActions();
    toast.success("State updated");
  };

  const evaluatePlaybook = async (stateId: string) => {
    if (!workspace || !item) return;
    const state = states.find(s => s.id === stateId);
    if (!state) return;

    const { data: playbooks } = await supabase
      .from("playbooks")
      .select("id")
      .eq("workspace_id", workspace.id)
      .eq("item_type", item.type);

    if (!playbooks || playbooks.length === 0) return;

    for (const pb of playbooks) {
      const { data: steps } = await supabase
        .from("playbook_steps")
        .select("*")
        .eq("playbook_id", pb.id)
        .eq("trigger_state", state.name)
        .order("step_order");

      if (!steps) continue;
      for (const step of steps) {
        const scheduledFor = new Date(Date.now() + (step.delay_minutes || 0) * 60000).toISOString();
        await supabase.from("actions").insert({
          item_id: id!,
          type: step.action_type,
          channel: step.channel || "email",
          status: step.requires_approval ? "pending_approval" : "scheduled",
          scheduled_for: scheduledFor,
          payload_json: { template_id: step.template_id, step_id: step.id },
        });
      }
    }
  };

  const queueAction = async (actionType: string, channel: string) => {
    if (!id || !item) return;
    const { error } = await supabase.from("actions").insert({
      item_id: id,
      type: actionType,
      channel,
      status: "scheduled",
      scheduled_for: new Date().toISOString(),
    });
    if (error) { toast.error(error.message); return; }
    fetchActions();
    toast.success("Action queued");
  };

  if (!item) return <div className="p-6 text-muted-foreground">Loading...</div>;

  return (
    <div>
      <PageHeader
        title={item.title}
        subtitle={`${item.type} · ${item.accounts?.name || "—"} · ${item.amount ? "$" + Number(item.amount).toLocaleString() : "No amount"}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-border">
        {/* Left panel: state, policy, actions */}
        <div className="lg:col-span-1 divide-y divide-border">
          {/* State */}
          <div className="p-4">
            <h3 className="text-sm font-semibold font-mono mb-3">STATE</h3>
            {states.length > 0 ? (
              <Select value={selectedState} onValueChange={changeState}>
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {states.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <span style={{ color: s.color }}>●</span> {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground">No states configured</p>
            )}
          </div>

          {/* Policy */}
          <div className="p-4">
            <h3 className="text-sm font-semibold font-mono mb-2">POLICY</h3>
            {item.policies ? (
              <span className="text-sm">{item.policies.name}</span>
            ) : (
              <span className="text-xs text-muted-foreground">No policy assigned</span>
            )}
          </div>

          {/* Action buttons */}
          <div className="p-4">
            <h3 className="text-sm font-semibold font-mono mb-3">ACTIONS</h3>
            <div className="space-y-2">
              <Button variant="secondary" size="sm" className="w-full justify-start" onClick={() => queueAction("send_message", "email")}>
                <Mail size={14} className="mr-2" /> Send Message
              </Button>
              <Button variant="secondary" size="sm" className="w-full justify-start" onClick={() => queueAction("request_verification", "email")}>
                <Shield size={14} className="mr-2" /> Request Verification
              </Button>
              <Button variant="secondary" size="sm" className="w-full justify-start" onClick={() => queueAction("present_options", "email")}>
                <MessageSquare size={14} className="mr-2" /> Present Options
              </Button>
              <Button variant="secondary" size="sm" className="w-full justify-start" onClick={() => queueAction("escalate", "system")}>
                <AlertTriangle size={14} className="mr-2" /> Escalate
              </Button>
            </div>
          </div>

          {/* Queued actions */}
          <div className="p-4">
            <h3 className="text-sm font-semibold font-mono mb-3">QUEUED ({actions.length})</h3>
            {actions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No actions</p>
            ) : (
              <div className="space-y-2">
                {actions.slice(0, 5).map(a => (
                  <div key={a.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <ArrowRight size={12} className="text-muted-foreground" />
                      <span className="font-mono text-xs">{a.type}</span>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Timeline */}
        <div className="lg:col-span-2">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold font-mono">TIMELINE</h3>
          </div>
          <TimelineStream itemId={id!} />
        </div>
      </div>
    </div>
  );
}
