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
import { Mail, Shield, ArrowRight, AlertTriangle, MessageSquare, Pencil, User, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/workspace-context";
import { queueAction } from "@/lib/queue-actions";
import { evaluatePlaybook } from "@/lib/evaluate-playbook";
import { writeTimelineEvent } from "@/lib/timeline-events";
import { useLabels } from "@/lib/labels-context";
import PursuitEditDialog from "@/components/dialogs/PursuitEditDialog";
import ContactEditDialog, { deleteContactWithAudit, type ContactRow } from "@/components/dialogs/ContactEditDialog";
import { changeItemState } from "@/lib/state-transitions";

export default function ItemDetail() {
  const labels = useLabels();
  const { id } = useParams();
  const { workspace, userId, userEmail } = useWorkspace();
  const [item, setItem] = useState<any>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [states, setStates] = useState<any[]>([]);
  const [selectedState, setSelectedState] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [selectedAction, setSelectedAction] = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [presentOptionsTemplateId, setPresentOptionsTemplateId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [editContact, setEditContact] = useState<ContactRow | null>(null);
  const [editContactOpen, setEditContactOpen] = useState(false);

  const fetchContacts = async (accountId: string) => {
    const { data } = await supabase
      .from("contacts")
      .select("id, account_id, name, email, phone, role, title, is_decision_maker, email_verified")
      .eq("account_id", accountId)
      .order("created_at", { ascending: true });
    setContacts((data as any) || []);
  };

  const handleDeleteContact = async (c: ContactRow) => {
    if (!window.confirm(`Delete contact "${c.name}"?`)) return;
    if (await deleteContactWithAudit(c, userEmail) && item?.account_id) {
      fetchContacts(item.account_id);
    }
  };

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
    if (data.account_id) fetchContacts(data.account_id);
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
    const prev = selectedState;
    setSelectedState(stateId);
    const res = await changeItemState({
      item: { id, account_id: item.account_id || item.accounts?.id },
      targetStateId: stateId,
      states,
    });
    if (!res.ok) {
      setSelectedState(prev);
      toast.error(res.error || "Move blocked");
      return;
    }

    // Evaluate playbook via extracted module
    await evaluatePlaybook({
      itemId: id,
      stateId,
      stateName: res.state?.name || "",
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
        actions={
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil size={14} className="mr-1" /> Edit details
          </Button>
        }
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

          {/* Contacts · live from contacts table; edits propagate everywhere */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold font-mono">CONTACTS ({contacts.length})</h3>
              {item.account_id && (
                <Link to={`/app/accounts/${item.account_id}`} className="text-[10px] font-mono text-muted-foreground hover:text-dossier-brass">
                  <Plus size={12} className="inline mr-0.5" /> add
                </Link>
              )}
            </div>
            {contacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No contacts on this account</p>
            ) : (
              <div className="space-y-1.5">
                {contacts.map((c, i) => (
                  <div key={c.id} className="flex items-start gap-2 text-sm group">
                    <User size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="truncate">{c.name}</span>
                        {i === 0 && <span className="text-[9px] font-mono text-dossier-brass">· primary</span>}
                      </div>
                      {c.role && <div className="text-[10px] font-mono text-muted-foreground truncate">{c.role}</div>}
                      {c.email && <div className="text-[10px] font-mono text-muted-foreground truncate">{c.email}</div>}
                      {c.phone && <div className="text-[10px] font-mono text-muted-foreground truncate">{c.phone}</div>}
                    </div>
                    <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => { setEditContact(c); setEditContactOpen(true); }}>
                        <Pencil size={10} />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => handleDeleteContact(c)}>
                        <Trash2 size={10} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
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
              <DossierPanel itemId={id!} itemMetadata={item.metadata} accountId={item.account_id ?? item.accounts?.id ?? null} />
            </TabsContent>
            <TabsContent value="signals" className="m-0">
              <SignalsPanel utmSlug={item.accounts?.metadata?.utm_slug ?? null} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <ActionInspectorDrawer action={selectedAction} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <PursuitEditDialog
        item={item}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => id && fetchItem(id)}
        actorEmail={userEmail}
      />
      <ContactEditDialog
        contact={editContact}
        open={editContactOpen}
        onOpenChange={setEditContactOpen}
        onSaved={() => item?.account_id && fetchContacts(item.account_id)}
        actorEmail={userEmail}
      />
    </div>
  );
}
