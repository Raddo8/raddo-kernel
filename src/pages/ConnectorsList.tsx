import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plug, Plus, Trash2, Link as LinkIcon, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/StatusBadge";
import { toast } from "sonner";
import { format } from "date-fns";

export default function ConnectorsList() {
  const { workspace } = useWorkspace();
  const [connectors, setConnectors] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // Add connector form
  const [cName, setCName] = useState("");
  const [cType, setCType] = useState("email");
  const [cFromEmail, setCFromEmail] = useState("");
  const [cFromName, setCFromName] = useState("");
  const [cReplyTo, setCReplyTo] = useState("");

  // Edit connector form (separate from create)
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editFromEmail, setEditFromEmail] = useState("");
  const [editFromName, setEditFromName] = useState("");
  const [editReplyTo, setEditReplyTo] = useState("");

  // Selected connector for linked accounts
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<any[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkAccountId, setLinkAccountId] = useState("");
  const [linkExternalId, setLinkExternalId] = useState("");

  const fetchConnectors = async () => {
    if (!workspace) return;
    const { data } = await supabase
      .from("connectors")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false });
    setConnectors(data || []);
    setLoading(false);
  };

  const fetchAccounts = async () => {
    if (!workspace) return;
    const { data } = await supabase
      .from("accounts")
      .select("id, name")
      .eq("workspace_id", workspace.id)
      .order("name");
    setAccounts(data || []);
  };

  const fetchLinkedAccounts = async (connectorId: string) => {
    const { data } = await supabase
      .from("connector_accounts")
      .select("*, accounts(name)")
      .eq("connector_id", connectorId)
      .order("created_at", { ascending: false });
    setLinkedAccounts(data || []);
  };

  useEffect(() => {
    fetchConnectors();
    fetchAccounts();
  }, [workspace]);

  useEffect(() => {
    if (selectedId) fetchLinkedAccounts(selectedId);
    else setLinkedAccounts([]);
  }, [selectedId]);

  const canAdd = cName.trim() && cFromEmail.includes("@") && cFromName.trim();

  const create = async () => {
    if (!workspace || !canAdd) return;
    const { error } = await supabase.from("connectors").insert({
      workspace_id: workspace.id,
      name: cName.trim(),
      type: cType,
      config: {
        from_email: cFromEmail.trim(),
        from_name: cFromName.trim(),
        reply_to: cReplyTo.trim() || undefined,
      },
    });
    if (error) { toast.error(error.message); return; }
    setCName(""); setCFromEmail(""); setCFromName(""); setCReplyTo(""); setOpen(false);
    fetchConnectors();
    toast.success("Connector created");
  };

  const deleteConnector = async (id: string) => {
    if (!window.confirm("Delete this connector?")) return;
    const { error } = await supabase.from("connectors").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (selectedId === id) setSelectedId(null);
    fetchConnectors();
    toast.success("Connector deleted");
  };

  const openEdit = (c: any) => {
    const cfg = (c.config || {}) as Record<string, string>;
    setEditId(c.id);
    setEditName(c.name);
    setEditFromEmail(cfg.from_email || "");
    setEditFromName(cfg.from_name || "");
    setEditReplyTo(cfg.reply_to || "");
    setEditOpen(true);
  };

  const canEdit = editName.trim() && editFromEmail.includes("@") && editFromName.trim();

  const updateConnector = async () => {
    if (!editId || !canEdit) return;
    const { error } = await supabase.from("connectors").update({
      name: editName.trim(),
      config: {
        from_email: editFromEmail.trim(),
        from_name: editFromName.trim(),
        reply_to: editReplyTo.trim() || undefined,
      },
    } as any).eq("id", editId);
    if (error) { toast.error(error.message); return; }
    setEditOpen(false); setEditId(null);
    fetchConnectors();
    toast.success("Connector updated");
  };

  const linkAccount = async () => {
    if (!selectedId || !linkAccountId) return;
    const { error } = await supabase.from("connector_accounts").insert({
      connector_id: selectedId,
      account_id: linkAccountId,
      external_id: linkExternalId.trim() || null,
    });
    if (error) { toast.error(error.message); return; }
    setLinkAccountId(""); setLinkExternalId(""); setLinkOpen(false);
    fetchLinkedAccounts(selectedId);
    toast.success("Account linked");
  };

  const unlinkAccount = async (id: string) => {
    if (!window.confirm("Unlink this account?")) return;
    const { error } = await supabase.from("connector_accounts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (selectedId) fetchLinkedAccounts(selectedId);
    toast.success("Account unlinked");
  };

  return (
    <div>
      <PageHeader
        title="Connectors"
        subtitle={`${connectors.length} configured`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus size={16} className="mr-1" /> Add Connector</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Connector</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Connector name" value={cName} onChange={e => setCName(e.target.value)} />
                <Select value={cType} onValueChange={setCType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms" disabled>SMS (coming soon)</SelectItem>
                    <SelectItem value="webhook" disabled>Webhook (coming soon)</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="From email" value={cFromEmail} onChange={e => setCFromEmail(e.target.value)} />
                <Input placeholder="From name" value={cFromName} onChange={e => setCFromName(e.target.value)} />
                <Input placeholder="Reply-to (optional)" value={cReplyTo} onChange={e => setCReplyTo(e.target.value)} />
                <Button onClick={create} className="w-full" disabled={!canAdd}>Create</Button>
          </div>

          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Edit Connector</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Connector name" value={editName} onChange={e => setEditName(e.target.value)} />
                <Input placeholder="From email" value={editFromEmail} onChange={e => setEditFromEmail(e.target.value)} />
                <Input placeholder="From name" value={editFromName} onChange={e => setEditFromName(e.target.value)} />
                <Input placeholder="Reply-to (optional)" value={editReplyTo} onChange={e => setEditReplyTo(e.target.value)} />
                <Button onClick={updateConnector} className="w-full" disabled={!canEdit}>Save</Button>
              </div>
            </DialogContent>
          </Dialog>
            </DialogContent>
          </Dialog>
        }
      />
      {loading ? (
        <div className="p-6 text-muted-foreground text-sm">Loading...</div>
      ) : connectors.length === 0 ? (
        <EmptyState icon={Plug} title="No connectors" description="Add a connector to enable outbound messaging." />
      ) : (
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {connectors.map(c => {
              const cfg = (c.config || {}) as Record<string, string>;
              const isSelected = selectedId === c.id;
              return (
                <Card
                  key={c.id}
                  className={`cursor-pointer transition-colors ${isSelected ? "ring-2 ring-primary" : ""}`}
                  onClick={() => setSelectedId(isSelected ? null : c.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">{c.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={c.type} />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={e => { e.stopPropagation(); openEdit(c); }}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={e => { e.stopPropagation(); deleteConnector(c.id); }}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>{cfg.from_name} &lt;{cfg.from_email}&gt;</p>
                      <p className="font-mono">{format(new Date(c.created_at), "MMM d, yyyy")}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {selectedId && (
            <div className="border border-border rounded-md">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold font-mono">LINKED ACCOUNTS</h3>
                <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm"><LinkIcon size={14} className="mr-1" /> Link</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Link Account</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <Select value={linkAccountId} onValueChange={setLinkAccountId}>
                        <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                        <SelectContent>
                          {accounts.map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input placeholder="External ID (optional)" value={linkExternalId} onChange={e => setLinkExternalId(e.target.value)} />
                      <Button onClick={linkAccount} className="w-full" disabled={!linkAccountId}>Link</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              {linkedAccounts.length === 0 ? (
                <p className="px-4 py-3 text-xs text-muted-foreground">No linked accounts</p>
              ) : (
                <div className="divide-y divide-border">
                  {linkedAccounts.map(la => (
                    <div key={la.id} className="flex items-center justify-between px-4 py-2">
                      <div>
                        <span className="text-sm">{(la as any).accounts?.name}</span>
                        {la.external_id && <span className="text-xs text-muted-foreground ml-2 font-mono">{la.external_id}</span>}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => unlinkAccount(la.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
