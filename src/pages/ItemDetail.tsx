import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import TimelineStream from "@/components/TimelineStream";
import DossierPanel from "@/components/DossierPanel";
import SignalsPanel from "@/components/SignalsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ActionInspectorDrawer from "@/components/ActionInspectorDrawer";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Shield, ArrowRight, AlertTriangle, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/workspace-context";
import { queueAction } from "@/lib/queue-actions";
import { evaluatePlaybook } from "@/lib/evaluate-playbook";
import { writeTimelineEvent } from "@/lib/timeline-events";
import { useLabels } from "@/lib/labels-context";

export default function ItemDetail() {
  const labels = useLabels();
  const { id } = useParams();
  const { workspace, userId } = useWorkspace();
  const [item, setItem] = useState<any>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [states, setStates] = useState<any[]>([]);
  const [selectedState, setSelectedState] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [selectedAction, setSelectedAction] = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [presentOptionsTemplateId, setPresentOptionsTemplateId] = useState<string | null>(null);

  const fetchItem = async (itemId: string) => {
    const { data, error } = await supabase
      .from("items")
      .select("*, accounts(id, name, metadata), item_states(id, name, label, color), policies(id, name)")
      .eq("id", itemId)
      .maybeSingle();
    if (error || !data) {
      setNotFound(true);
      setActions([]);
      return;
    }
    setNotFound(false);
    setItem(data);
    if (data.item_states) setSelectedState(data.item_states.id);
  };

  const fetchActions = async (itemId: string) => {
    const { data, error } = await supabase
      .from("actions")
      .select("*")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false });
    if (error) {
      setActions([]);
      toast.error("Failed to load actions");
      return;
    }
    setActions(data || []);
  };

  useEffect(() => {
    setNotFound(false);
    setItem(null);
    setActions([]);
    if (!id) return;
    fetchItem(id);
    fetchActions(id);
  }, [id]);

  useEffect(() => {
    if (workspace) {
      supabase.from("item_states").select("*")
        .eq("workspace_id", workspace.id)
        .order("sort_order")
        .then(({ data }) => setStates(data || []));
      supabase.from("templates").select("id")
        .eq("workspace_id", workspace.id)
        .eq("template_type", "present_options")
        .limit(1)
        .maybeSingle()
        .then(({ data }) => setPresentOptionsTemplateId(data?.id ?? null));
    }
  }, [workspace]);

  const changeState = async (stateId: string) => {
    if (!id || !item || !workspace) return;
    setSelectedState(stateId);
    const { error } = await supabase.from("items").update({ state_id: stateId }).eq("id", id);
    if (error) { toast.error(error.message); return; }

    const state = states.find(s => s.id === stateId);

    // Centralized timeline write (constraint 2)
    await writeTimelineEvent({
      accountId: item.account_id || item.accounts?.id,
      itemId: id,
      direction: "system",
      channel: "system",
      summary: `State changed to ${state?.label || "unknown"}`,
    });

    // Evaluate playbook via extracted module
    await evaluatePlaybook({
      itemId: id,
      stateId,
      stateName: state?.name || "",
      itemType: item.type,
      workspaceId: workspace.id,
      actorUserId: userId ?? undefined,
    });

    fetchItem(id);
    fetchActions(id);
    toast.success("State updated");
  };

  const handleQueueAction = async (actionType: string, channel: string, payloadJson?: Record<string, unknown>, templateId?: string) => {
    if (!id || !item) return;
    if (actionType === "present_options" && !templateId) {
      toast.error("No present_options template configured for this workspace");
      return;
    }
    const result = await queueAction({
      itemId: id,
      type: actionType,
      channel,
      source: "ui",
      actorUserId: userId ?? undefined,
      payloadJson,
      templateId,
    });
    if (result.error) { toast.error(result.error); return; }
    if (result.rateLimited) { toast.error("Rate limit exceeded"); return; }
    fetchActions(id);
    toast.success("Action queued");
  };

  if (notFound) {
    return (
      <div className="p-6 space-y-3">
        <h2 className="text-lg font-semibold">Item not found</h2>
        <p className="text-sm text-muted-foreground">
          This item does not exist or you do not have access.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/items">Back to {labels.items}</Link>
        </Button>
      </div>
    );
  }
  if (!item) return <div className="p-6 text-muted-foreground">Loading...</div>;

  return (
    <div>
      <PageHeader
        title={item.title}
        subtitle={`${item.type}${item.accounts?.name ? ` · ${item.accounts.name}` : ""} · ${item.amount ? "$" + Number(item.amount).toLocaleString() : `No ${labels.itemLower} amount`}`}
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

          {/* Action buttons: all route through queueAction() */}
          <div className="p-4">
            <h3 className="text-sm font-semibold font-mono mb-3">ACTIONS</h3>
            <div className="space-y-2">
              <Button variant="secondary" size="sm" className="w-full justify-start" onClick={() => handleQueueAction("send_message", "email")}>
                <Mail size={14} className="mr-2" /> Send Message
              </Button>
              <Button variant="secondary" size="sm" className="w-full justify-start" onClick={() => handleQueueAction("request_verification", "email")}>
                <Shield size={14} className="mr-2" /> Request Verification
              </Button>
              <Button variant="secondary" size="sm" className="w-full justify-start" disabled={!presentOptionsTemplateId} onClick={() => handleQueueAction("present_options", "email", {
                options: [
                  { key: "pay_full", label: "Pay in Full" },
                  { key: "request_extension", label: "Request Extension" },
                  { key: "payment_plan", label: "Propose Payment Plan" },
                  { key: "dispute", label: "Dispute" },
                ],
              }, presentOptionsTemplateId!)}>
                <MessageSquare size={14} className="mr-2" /> {presentOptionsTemplateId ? "Present Options" : "Present Options (template missing)"}
              </Button>
              <Button variant="secondary" size="sm" className="w-full justify-start" onClick={() => handleQueueAction("escalate", "system")}>
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
                  <div
                    key={a.id}
                    className="flex items-center justify-between text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 transition-colors"
                    onClick={() => { setSelectedAction(a); setDrawerOpen(true); }}
                  >
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

        {/* Right: Timeline / Dossier / Signals tabs */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="timeline" className="w-full">
            <div className="px-4 pt-3 border-b border-border">
              <TabsList>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="dossier">Dossier</TabsTrigger>
                <TabsTrigger value="signals">Signals</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="timeline" className="m-0">
              <TimelineStream itemId={id!} />
            </TabsContent>
            <TabsContent value="dossier" className="m-0">
              <DossierPanel itemId={id!} itemMetadata={item.metadata} />
            </TabsContent>
            <TabsContent value="signals" className="m-0">
              <SignalsPanel utmSlug={item.accounts?.metadata?.utm_slug ?? null} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <ActionInspectorDrawer action={selectedAction} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
